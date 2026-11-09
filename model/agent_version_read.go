package model

import (
	"crypto/sha256"
	"encoding/hex"
	"math"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// AgentVersionReadRecord separates release metadata from optional private
// content. Only the detail query selects the configuration and release note.
type AgentVersionReadRecord struct {
	ID                  int64  `json:"-"`
	AgentID             int64  `json:"-"`
	VersionNo           int64  `json:"-"`
	VersionKind         string `json:"-"`
	SourceDraftRevision int64  `json:"-"`
	ConfigHash          string `json:"-"`
	PublishedAt         *int64 `json:"-"`
	RevokedAt           *int64 `json:"-"`
	CreatedBy           int64  `json:"-"`
	SchemaVersion       int32  `json:"-"`
	ConfigJSON          string `json:"-"`
	InputSchemaJSON     string `json:"-"`
	OutputSchemaJSON    string `json:"-"`
	ReleaseNote         string `json:"-"`
}

const agentVersionReadMetadataColumns = "ag_agent_versions.id, ag_agent_versions.agent_id, ag_agent_versions.version_no, ag_agent_versions.version_kind, ag_agent_versions.source_draft_revision, ag_agent_versions.config_hash, ag_agent_versions.published_at, ag_agent_versions.revoked_at, ag_agent_versions.created_by"

// The content predicate is deliberately in SQL as well as in the application
// authorizer: a metadata reader must never select a private snapshot.
func agentVersionReadWorkspaceQuery(db *gorm.DB, identity AuthSessionIdentity, teamID, workspaceID int64, content bool) *gorm.DB {
	visible := agentWorkspaceVisibleQuery(db.Session(&gorm.Session{NewDB: true}), identity).
		Select("1").Where("teams.id = ? AND ag_workspaces.id = ?", teamID, workspaceID)
	if content {
		visible = visible.Where(agentWorkspaceExactColumn(db, "ag_workspaces.status")+" = ?", AgentWorkspaceStatusActive).
			Where("((teams.owner_user_id = users.id AND "+agentWorkspaceExactColumn(db, "team_members.role")+" = ?) OR "+
				"(teams.owner_user_id <> users.id AND "+agentWorkspaceExactColumn(db, "team_members.role")+" = ? AND ag_workspace_members.id IS NOT NULL AND "+
				agentWorkspaceExactColumn(db, "ag_workspace_members.status")+" = ? AND "+agentWorkspaceExactColumn(db, "ag_workspace_members.role")+" IN ?))",
				TeamRoleOwner, TeamRoleMember, AgentWorkspaceMemberStatusActive, []string{AgentWorkspaceRoleAdmin, AgentWorkspaceRoleDeveloper})
	}
	return visible
}

func agentVersionReadParentQuery(db *gorm.DB, identity AuthSessionIdentity, teamID, workspaceID, agentID int64, content bool) *gorm.DB {
	return db.Model(&AgentDefinition{}).
		Where("ag_agents.team_id = ? AND ag_agents.workspace_id = ? AND ag_agents.id = ?", teamID, workspaceID, agentID).
		Where(agentWorkspaceExactColumn(db, "ag_agents.status")+" IN ?", []string{AgentDefinitionStatusActive, AgentDefinitionStatusDisabled, AgentDefinitionStatusArchived}).
		Where("EXISTS (?)", agentVersionReadWorkspaceQuery(db, identity, teamID, workspaceID, content))
}

func visibleAgentVersionReadQuery(db *gorm.DB, identity AuthSessionIdentity, teamID, workspaceID, agentID int64, content bool) *gorm.DB {
	return agentVersionScopedQuery(db, teamID, workspaceID, agentID).
		Where(agentWorkspaceExactColumn(db, "ag_agents.status")+" IN ?", []string{AgentDefinitionStatusActive, AgentDefinitionStatusDisabled, AgentDefinitionStatusArchived}).
		Where(agentWorkspaceExactColumn(db, "ag_agent_versions.version_kind")+" = ? AND ag_agent_versions.published_at > 0", AgentVersionKindRelease).
		Where("EXISTS (?)", agentVersionReadWorkspaceQuery(db, identity, teamID, workspaceID, content))
}

// ReadAgentVersionPage requires a visible parent even if it has no releases.
// The same live predicates are applied before COUNT and row pagination.
func ReadAgentVersionPage(db *gorm.DB, identity AuthSessionIdentity, teamID, workspaceID, agentID, offset int64, limit int, orders []string) ([]AgentVersionReadRecord, int64, error) {
	if db == nil || identity.UserID <= 0 || teamID <= 0 || workspaceID <= 0 || agentID <= 0 || offset < 0 || limit < 1 || limit > 100 ||
		len(orders) < 1 || len(orders) > 2 ||
		!slices.Contains([]string{"ag_agent_versions.id ASC", "ag_agent_versions.id DESC"}, orders[len(orders)-1]) ||
		len(orders) == 2 && !slices.Contains([]string{"ag_agent_versions.created_at ASC", "ag_agent_versions.created_at DESC"}, orders[0]) {
		return nil, 0, ErrAgentDefinitionInvalid
	}
	db = db.Session(&gorm.Session{Logger: logger.Discard})
	var parent struct{ ID int64 }
	if err := agentVersionReadParentQuery(db, identity, teamID, workspaceID, agentID, false).Select("ag_agents.id").Take(&parent).Error; err != nil {
		return nil, 0, err
	}
	visible := visibleAgentVersionReadQuery(db, identity, teamID, workspaceID, agentID, false)
	var total int64
	if err := visible.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]AgentVersionReadRecord, 0)
	if offset >= total {
		return items, total, nil
	}
	if offset > int64(math.MaxInt) {
		return nil, 0, ErrAgentDefinitionInvalid
	}
	err := visible.Select(agentVersionReadMetadataColumns).Order(strings.Join(orders, ", ")).Offset(int(offset)).Limit(limit).Scan(&items).Error
	return items, total, err
}

// ReadAgentVersionContent scopes both the parent Agent and the requested
// release. Revoked historical releases remain readable but never activatable.
func ReadAgentVersionContent(db *gorm.DB, identity AuthSessionIdentity, teamID, workspaceID, agentID, versionID int64) (*AgentVersionReadRecord, error) {
	if db == nil || identity.UserID <= 0 || teamID <= 0 || workspaceID <= 0 || agentID <= 0 || versionID <= 0 {
		return nil, ErrAgentDefinitionInvalid
	}
	db = db.Session(&gorm.Session{Logger: logger.Discard})
	var record AgentVersionReadRecord
	err := visibleAgentVersionReadQuery(db, identity, teamID, workspaceID, agentID, true).
		Select(agentVersionReadMetadataColumns+", ag_agent_versions.schema_version, ag_agent_versions.config_json, ag_agent_versions.input_schema_json, ag_agent_versions.output_schema_json, ag_agent_versions.release_note").
		Where("ag_agent_versions.id = ?", versionID).Take(&record).Error
	if err != nil {
		return nil, err
	}
	return &record, nil
}

// VerifyAgentVersionSnapshot verifies immutable storage integrity, without
// model availability or current policy. It is shared with lifecycle commands.
func VerifyAgentVersionSnapshot(configJSON, inputSchemaJSON, outputSchemaJSON, configHash string) error {
	config, err := canonicalAgentDefinitionObject(configJSON, true)
	if err != nil || config != configJSON {
		return ErrAgentDefinitionInvalid
	}
	digest := sha256.Sum256([]byte(config))
	if hex.EncodeToString(digest[:]) != configHash {
		return ErrAgentDefinitionInvalid
	}
	fields, err := common.UnmarshalJSONObjectStrict([]byte(config))
	if err != nil {
		return ErrAgentDefinitionInvalid
	}
	for _, schema := range []struct{ field, value string }{{"input_schema", inputSchemaJSON}, {"output_schema", outputSchemaJSON}} {
		raw, present := fields[schema.field]
		if !present {
			return ErrAgentDefinitionInvalid
		}
		stored, err := canonicalAgentDefinitionObject(schema.value, false)
		if err != nil || stored != schema.value {
			return ErrAgentDefinitionInvalid
		}
		expected, err := canonicalAgentDefinitionObject(string(raw), false)
		if err != nil || expected != stored {
			return ErrAgentDefinitionInvalid
		}
	}
	return nil
}
