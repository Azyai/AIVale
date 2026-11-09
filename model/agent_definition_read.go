package model

import (
	"math"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// AgentDefinitionReadRecord never selects draft JSON, hashes, audit subjects or
// allocation state. Description is populated by the detail query only.
type AgentDefinitionReadRecord struct {
	ID               int64  `json:"-"`
	CreatedAt        int64  `json:"-"`
	UpdatedAt        int64  `json:"-"`
	Revision         int64  `json:"-"`
	DraftRevision    int64  `json:"-"`
	CurrentVersionID *int64 `json:"-"`
	Slug             string `json:"-"`
	Name             string `json:"-"`
	Description      string `json:"-"`
	Kind             string `json:"-"`
	Status           string `json:"-"`
	TagsJSON         string `json:"-"`
}

const agentDefinitionMetadataColumns = "ag_agents.id, ag_agents.created_at, ag_agents.updated_at, ag_agents.revision, ag_agents.draft_revision, ag_agents.current_version_id, ag_agents.slug, ag_agents.name, ag_agents.kind, ag_agents.status, ag_agents.tags_json"

type AgentDefinitionReadFilters struct {
	Query  string
	Status string
	Tag    string
}

// Keep the repository's parent and release-pointer integrity joins, but also
// verify live session and membership in each statement, including COUNT.
func visibleAgentDefinitionQuery(db *gorm.DB, identity AuthSessionIdentity, teamID, workspaceID int64) *gorm.DB {
	workspaceVisible := agentWorkspaceVisibleQuery(db.Session(&gorm.Session{NewDB: true}), identity).
		Select("1").Where("teams.id = ? AND ag_workspaces.id = ?", teamID, workspaceID)
	return agentDefinitionScopedQuery(db, teamID, workspaceID).
		Where("EXISTS (?)", workspaceVisible).
		Where(agentWorkspaceExactColumn(db, "ag_agents.status")+" IN ?", []string{AgentDefinitionStatusActive, AgentDefinitionStatusDisabled, AgentDefinitionStatusArchived})
}

// ReadAgentDefinitionPage applies live visibility and the same filters before
// both COUNT and pagination. Huge offsets beyond total never reach SQL.
func ReadAgentDefinitionPage(db *gorm.DB, identity AuthSessionIdentity, teamID, workspaceID int64, filters AgentDefinitionReadFilters, offset int64, limit int, orders []string) ([]AgentDefinitionReadRecord, int64, error) {
	if db == nil || identity.UserID <= 0 || teamID <= 0 || workspaceID <= 0 || offset < 0 ||
		limit < 1 || limit > 100 || len(orders) < 1 || len(orders) > 2 {
		return nil, 0, ErrAgentDefinitionInvalid
	}
	if !slices.Contains([]string{"ag_agents.id ASC", "ag_agents.id DESC"}, orders[len(orders)-1]) ||
		len(orders) == 2 && !slices.Contains([]string{"ag_agents.created_at ASC", "ag_agents.created_at DESC"}, orders[0]) {
		return nil, 0, ErrAgentDefinitionInvalid
	}
	visible := visibleAgentDefinitionQuery(db, identity, teamID, workspaceID)
	if filters.Status != "" {
		visible = visible.Where(agentWorkspaceExactColumn(db, "ag_agents.status")+" = ?", filters.Status)
	}
	if filters.Query != "" {
		switch db.Dialector.Name() {
		case "sqlite":
			visible = visible.Where("instr(ag_agents.name, ?) > 0", filters.Query)
		case "postgres":
			visible = visible.Where("strpos(ag_agents.name, ?) > 0", filters.Query)
		case "mysql":
			visible = visible.Where("LOCATE(BINARY ?, BINARY ag_agents.name) > 0", filters.Query)
		default:
			return nil, 0, ErrAgentDefinitionInvalid
		}
	}
	if filters.Tag != "" {
		switch db.Dialector.Name() {
		case "sqlite":
			visible = visible.Where("EXISTS (SELECT 1 FROM json_each(ag_agents.tags_json) AS tag_element WHERE tag_element.type = 'text' AND tag_element.value COLLATE BINARY = ?)", filters.Tag)
		case "postgres":
			visible = visible.Where(`EXISTS (SELECT 1 FROM jsonb_array_elements(CAST(ag_agents.tags_json AS jsonb)) AS tag_element(value) WHERE jsonb_typeof(tag_element.value) = 'string' AND (tag_element.value #>> '{}') COLLATE "C" = ?)`, filters.Tag)
		case "mysql":
			tagJSON, err := common.Marshal(filters.Tag)
			if err != nil {
				return nil, 0, err
			}
			visible = visible.Where("JSON_CONTAINS(ag_agents.tags_json, ?, '$') = 1", string(tagJSON))
		default:
			return nil, 0, ErrAgentDefinitionInvalid
		}
	}
	var total int64
	if err := visible.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]AgentDefinitionReadRecord, 0)
	if offset >= total {
		return items, total, nil
	}
	if offset > int64(math.MaxInt) {
		return nil, 0, ErrAgentDefinitionInvalid
	}
	err := visible.Select(agentDefinitionMetadataColumns).
		Order(strings.Join(orders, ", ")).Offset(int(offset)).Limit(limit).Scan(&items).Error
	return items, total, err
}

// ReadAgentDefinitionMetadata fetches one visible metadata projection.
func ReadAgentDefinitionMetadata(db *gorm.DB, identity AuthSessionIdentity, teamID, workspaceID, agentID int64) (*AgentDefinitionReadRecord, error) {
	if db == nil || identity.UserID <= 0 || teamID <= 0 || workspaceID <= 0 || agentID <= 0 {
		return nil, ErrAgentDefinitionInvalid
	}
	var item AgentDefinitionReadRecord
	err := visibleAgentDefinitionQuery(db, identity, teamID, workspaceID).
		Select(agentDefinitionMetadataColumns+", ag_agents.description").
		Where("ag_agents.id = ?", agentID).Take(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}
