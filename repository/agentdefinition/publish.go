package agentdefinition

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/agent"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type PublishRepository struct {
	db       *gorm.DB
	identity model.AuthSessionIdentity
}

// NewPublishRepository binds the dashboard management identity from middleware.
func NewPublishRepository(db *gorm.DB, identity model.AuthSessionIdentity) *PublishRepository {
	return &PublishRepository{db: db, identity: identity}
}

var _ application.PublishRepository = (*PublishRepository)(nil)

type publicationWorkspace struct {
	tx      *gorm.DB
	facts   *model.AgentWorkspaceWriteFacts
	current *model.AgentDefinition
	audited bool
}

func (repo *PublishRepository) GatewayLimits() application.GatewayLimits {
	return agent.AgentDraftGatewayLimits()
}

func (repo *PublishRepository) WithPublishWorkspace(ctx context.Context, workspaceID int64, apply func(application.PublishWorkspaceTransaction) error) error {
	if repo == nil || apply == nil {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return withDefinitionWorkspace(ctx, repo.db, repo.identity, workspaceID, agent.AuthorizeLockedAgentPublish, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) (bool, error) {
		workspace := &publicationWorkspace{tx: tx, facts: facts}
		err := apply(workspace)
		return workspace.audited, err
	})
}

// withDefinitionWorkspace shares only the existing transaction, error boundary
// and post-commit audit projection. Each use case supplies its own live action.
func withDefinitionWorkspace(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID int64, authorize func(*model.AgentWorkspaceWriteFacts) error, apply func(*gorm.DB, *model.AgentWorkspaceWriteFacts) (bool, error)) error {
	if db == nil || ctx == nil || workspaceID <= 0 || authorize == nil || apply == nil {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	// Failed SQL can contain prompts or release notes. Silence the entire path,
	// including inserts, bounded transaction retries and audit persistence.
	db = db.Session(&gorm.Session{Context: ctx, Logger: logger.Discard})
	project := false
	err := model.WithAgentWorkspaceWriteFacts(db, identity, workspaceID, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) error {
		project = false
		if err := authorize(facts); err != nil {
			return err
		}
		var err error
		project, err = apply(tx, facts)
		return err
	})
	if err != nil {
		var controlled *agenttypes.Error
		switch {
		case errors.As(err, &controlled):
			return controlled
		case errors.Is(err, model.ErrUserSessionInactive):
			return agenttypes.NewError(agenttypes.AuthRequired, nil)
		case errors.Is(err, gorm.ErrRecordNotFound), errors.Is(err, model.ErrAgentDefinitionReference):
			return agenttypes.NewError(agenttypes.ResourceNotFound, nil)
		case errors.Is(err, model.ErrAgentDefinitionRevision):
			return agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
		case model.AgentUniqueConstraint(err):
			return agenttypes.NewError(agenttypes.ResourceInUse, nil)
		default:
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
	}
	if project {
		auditCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if _, err := model.ProjectWorkspaceAudit(auditCtx, db, model.LOG_DB, 20); err != nil {
			common.SysError("Agent definition audit projection pending")
		}
	}
	return nil
}

func (workspace *publicationWorkspace) LockDefinition(agentID int64) (application.PublicationDefinition, error) {
	record, err := model.LockAgentPublishDefinition(workspace.tx, workspace.facts, agentID)
	if err != nil {
		return application.PublicationDefinition{}, err
	}
	workspace.current = record
	return application.PublicationDefinition{
		Draft:  application.StoredDraft{Name: record.Name, Revision: record.DraftRevision, Config: record.DraftJSON, Pending: record.DraftJSON == model.AgentDraftPendingJSON},
		Status: record.Status, MetadataRevision: record.Revision, NextVersion: record.NextVersion,
	}, nil
}

func (workspace *publicationWorkspace) ReadPolicy(ctx context.Context, modelName string) (application.DraftPolicy, error) {
	return agent.ReadLockedAgentPublicationPolicy(ctx, workspace.tx, workspace.facts, modelName)
}

func (workspace *publicationWorkspace) PublishDefinition(agentID, expectedDraftRevision int64, configJSON, inputSchemaJSON, outputSchemaJSON, releaseNote string) (application.PublishedVersion, error) {
	if workspace.current == nil || workspace.current.ID != agentID {
		return application.PublishedVersion{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	version, err := model.PublishLockedAgentDefinition(workspace.tx, workspace.facts, workspace.current, expectedDraftRevision, configJSON, inputSchemaJSON, outputSchemaJSON, releaseNote)
	if err != nil {
		return application.PublishedVersion{}, err
	}
	return publishedVersionMetadata(version)
}

func (workspace *publicationWorkspace) FindReceipt(agentID int64, keyDigest, inputDigest string) (*application.PublicationReceipt, error) {
	if workspace.current == nil || workspace.current.ID != agentID {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	scopeDigest, requestDigest, err := workspace.publicationDigests(agentID, inputDigest)
	if err != nil {
		return nil, err
	}
	record, err := model.GetAgentIdempotencyKey(workspace.tx, workspace.facts.TeamID, scopeDigest, keyDigest)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if record.TeamID != workspace.facts.TeamID || record.WorkspaceID != workspace.facts.Workspace.ID ||
		record.ScopeHash != scopeDigest || record.KeyHash != keyDigest || record.State != "completed" ||
		record.Operation != "agent.publish" || record.ResourceType == nil || *record.ResourceType != "agent_version" ||
		record.ResourceID == nil || *record.ResourceID <= 0 || record.ResponseStatus == nil || *record.ResponseStatus != http.StatusCreated ||
		record.ResponseJSON == nil || record.ExpiresAt <= 0 || record.ExpiresAt > agenttypes.MaxSafeInteger {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	// Agent IDs are part of request intent, not scope. Reusing a key for a
	// different Agent conflicts before inspecting or disclosing the old result.
	if record.RequestHash != requestDigest {
		return &application.PublicationReceipt{RequestMatches: false}, nil
	}
	var stored model.AgentVersion
	if err := workspace.tx.Select("id", "agent_id", "version_no", "version_kind", "source_draft_revision", "config_hash", "published_at", "revoked_at").
		Where("team_id = ? AND workspace_id = ? AND agent_id = ? AND id = ?", workspace.facts.TeamID, workspace.facts.Workspace.ID, agentID, *record.ResourceID).
		Take(&stored).Error; err != nil {
		return nil, err
	}
	if stored.RevokedAt != nil {
		return nil, agenttypes.NewError(agenttypes.InvalidState, nil)
	}
	version, err := publishedVersionMetadata(&stored)
	if err != nil {
		return nil, err
	}
	response, err := publicationReceiptJSON(version)
	if err != nil || response != *record.ResponseJSON {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return &application.PublicationReceipt{Version: version, ExpiresAt: record.ExpiresAt, RequestMatches: true}, nil
}

func (workspace *publicationWorkspace) SaveReceipt(agentID int64, keyDigest, inputDigest string, version application.PublishedVersion) (int64, error) {
	if workspace.current == nil || workspace.current.ID != agentID || version.AgentID != agentID {
		return 0, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	scopeDigest, requestDigest, err := workspace.publicationDigests(agentID, inputDigest)
	if err != nil {
		return 0, err
	}
	response, err := publicationReceiptJSON(version)
	if err != nil {
		return 0, err
	}
	resourceType, status := "agent_version", int32(http.StatusCreated)
	record := &model.AgentIdempotencyKey{
		TeamID: workspace.facts.TeamID, WorkspaceID: workspace.facts.Workspace.ID, ScopeHash: scopeDigest,
		KeyHash: keyDigest, RequestHash: requestDigest, Operation: "agent.publish", State: "completed",
		ResourceType: &resourceType, ResourceID: &version.ID, ResponseStatus: &status, ResponseJSON: &response,
	}
	if err := workspace.tx.Create(record).Error; err != nil {
		return 0, err
	}
	return record.ExpiresAt, nil
}

func (workspace *publicationWorkspace) AuditPublication(agentID, versionID, draftRevision, previousMetadataRevision, metadataRevision int64, requestID string) error {
	if err := model.RecordAgentPublicationAudit(workspace.tx, workspace.facts, agentID, versionID, draftRevision, previousMetadataRevision, metadataRevision, requestID); err != nil {
		return err
	}
	workspace.audited = true
	return nil
}

func (workspace *publicationWorkspace) publicationDigests(agentID int64, inputDigest string) (string, string, error) {
	scope, err := common.Marshal(map[string]string{
		"version": "1", "operation": "agent.publish",
		"team_id": strconv.FormatInt(workspace.facts.TeamID, 10), "workspace_id": strconv.FormatInt(workspace.facts.Workspace.ID, 10),
		"actor_id": strconv.FormatInt(workspace.facts.UserID, 10),
	})
	if err != nil {
		return "", "", err
	}
	scopeSum := sha256.Sum256(scope)
	scopeDigest := hex.EncodeToString(scopeSum[:])
	requestSum := sha256.Sum256([]byte(scopeDigest + ":" + strconv.FormatInt(agentID, 10) + ":" + inputDigest))
	return scopeDigest, hex.EncodeToString(requestSum[:]), nil
}

func publishedVersionMetadata(version *model.AgentVersion) (application.PublishedVersion, error) {
	if version == nil || version.ID <= 0 || version.AgentID <= 0 || version.VersionKind != model.AgentVersionKindRelease ||
		version.VersionNo <= 0 || version.VersionNo > agenttypes.MaxSafeInteger ||
		version.SourceDraftRevision <= 0 || version.SourceDraftRevision > agenttypes.MaxSafeInteger ||
		version.PublishedAt == nil || *version.PublishedAt <= 0 || *version.PublishedAt > agenttypes.MaxSafeInteger ||
		len(version.ConfigHash) != 64 || strings.Trim(version.ConfigHash, "0123456789abcdef") != "" {
		return application.PublishedVersion{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return application.PublishedVersion{
		ID: version.ID, AgentID: version.AgentID, VersionNo: version.VersionNo, VersionKind: version.VersionKind,
		SourceDraftRevision: version.SourceDraftRevision, ConfigHash: version.ConfigHash, PublishedAt: *version.PublishedAt,
	}, nil
}

func publicationReceiptJSON(version application.PublishedVersion) (string, error) {
	wire, err := common.Marshal(struct {
		ID                  string `json:"id"`
		AgentID             string `json:"agent_id"`
		VersionNo           int64  `json:"version_no"`
		VersionKind         string `json:"version_kind"`
		SourceDraftRevision int64  `json:"source_draft_revision"`
		ConfigHash          string `json:"config_hash"`
		PublishedAt         int64  `json:"published_at"`
	}{ID: strconv.FormatInt(version.ID, 10), AgentID: strconv.FormatInt(version.AgentID, 10),
		VersionNo: version.VersionNo, VersionKind: version.VersionKind, SourceDraftRevision: version.SourceDraftRevision,
		ConfigHash: version.ConfigHash, PublishedAt: version.PublishedAt})
	return string(wire), err
}
