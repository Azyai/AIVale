// Package agentrun adapts the Run metadata use case to the existing main
// database, management sessions, idempotency receipts and audit outbox.
package agentrun

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/agent"
	definition "github.com/QuantumNous/new-api/service/agentdefinition/application"
	"github.com/QuantumNous/new-api/service/agentrun/application"
	"github.com/QuantumNous/new-api/setting/agent_setting"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type MetadataRepository struct {
	db       *gorm.DB
	identity model.AuthSessionIdentity
}

// NewMetadataRepository accepts only the existing typed management identity.
// No HTTP route is wired to this foundation, and it never admits execution.
func NewMetadataRepository(db *gorm.DB, identity model.AuthSessionIdentity) *MetadataRepository {
	return &MetadataRepository{db: db, identity: identity}
}

var _ application.MetadataRepository = (*MetadataRepository)(nil)

type metadataWorkspace struct {
	tx      *gorm.DB
	facts   *model.AgentWorkspaceWriteFacts
	ref     application.MetadataReference
	version *model.AgentVersion
	config  *agenttypes.AgentConfig
	created *model.AgentRun
	audited bool
}

func (repo *MetadataRepository) WithMetadataWorkspace(ctx context.Context, workspaceID int64, reference application.MetadataReference, apply func(application.MetadataTransaction, application.LockedRelease) error) error {
	if repo == nil || repo.db == nil || ctx == nil || apply == nil || workspaceID <= 0 {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if !agent_setting.Snapshot().Enabled {
		return agenttypes.NewError(agenttypes.RuntimeUnavailable, nil)
	}
	// Failed SQL may carry input values. Silence the complete transaction and
	// its rollback-only retries rather than logging individual query errors.
	db := repo.db.Session(&gorm.Session{Context: ctx, Logger: logger.Discard})
	project := false
	err := model.WithAgentWorkspaceWriteFacts(db, repo.identity, workspaceID, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) error {
		project = false
		if !agent_setting.Snapshot().Enabled {
			return agenttypes.NewError(agenttypes.RuntimeUnavailable, nil)
		}
		if err := authorizeMetadataCreation(facts); err != nil {
			return err
		}
		current, err := model.LockAgentPublishDefinition(tx, facts, reference.AgentID)
		if err != nil {
			return err
		}
		if current.Status != model.AgentDefinitionStatusActive || current.Kind != model.AgentDefinitionKindSingle {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		version, err := model.LockAgentLifecycleVersion(tx, facts, current, reference.VersionID)
		if err != nil {
			return err
		}
		if version.RevokedAt != nil {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		config, err := definition.DecodeVersionConfiguration(definition.StoredVersionConfiguration{
			ConfigJSON: version.ConfigJSON, ConfigHash: version.ConfigHash,
			InputSchemaJSON: version.InputSchemaJSON, OutputSchemaJSON: version.OutputSchemaJSON,
		}, agent.AgentDraftGatewayLimits())
		if err != nil {
			return err
		}
		if _, err := model.LockAgentRunFundingToken(tx, facts, reference.FundingTokenID); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) || errors.Is(err, model.ErrTokenInvalid) || errors.Is(err, model.ErrAgentRunReference) {
				return agenttypes.NewError(agenttypes.FundingUnavailable, nil)
			}
			return err
		}
		workspace := &metadataWorkspace{tx: tx, facts: facts, ref: reference, version: version, config: config}
		if err := apply(workspace, application.LockedRelease{InputSchema: common.RawMessage(version.InputSchemaJSON)}); err != nil {
			return err
		}
		project = workspace.audited
		return nil
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
		case model.AgentUniqueConstraint(err):
			return agenttypes.NewError(agenttypes.IdempotencyConflict, nil)
		default:
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
	}
	if project {
		projection, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if _, err := model.ProjectWorkspaceAudit(projection, db, model.LOG_DB, 20); err != nil {
			common.SysError("Agent Run metadata audit projection pending")
		}
	}
	return nil
}

// This permits only metadata persistence for the live candidate role. It does
// not change RunCreate.RequiresResourceCheck or issue a reusable capability.
func authorizeMetadataCreation(facts *model.AgentWorkspaceWriteFacts) error {
	if facts == nil || facts.UserID <= 0 || facts.TeamID <= 0 || facts.TeamOwnerUserID <= 0 ||
		facts.Workspace == nil || facts.Workspace.TeamID != facts.TeamID || facts.Workspace.ArchivedAt != nil {
		return agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	role := ""
	if facts.UserID == facts.TeamOwnerUserID && facts.TeamMemberRole == model.TeamRoleOwner {
		role = model.AgentWorkspaceRoleAdmin
	} else if facts.UserID != facts.TeamOwnerUserID && facts.TeamMemberRole == model.TeamRoleMember && facts.Member != nil && facts.Member.Status == model.AgentWorkspaceMemberStatusActive {
		role = facts.Member.Role
	}
	if agent.WorkspacePermissionForRole(role, agent.WorkspaceRead).Scope == agent.WorkspaceScopeNone {
		return agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if facts.Workspace.Status != model.AgentWorkspaceStatusActive || agent.WorkspacePermissionForRole(role, agent.RunCreate).Scope == agent.WorkspaceScopeNone {
		return agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	return nil
}

func (workspace *metadataWorkspace) digests(intentDigest string) (string, string, error) {
	scope, err := common.Marshal(map[string]string{
		"team_id": strconv.FormatInt(workspace.facts.TeamID, 10), "workspace_id": strconv.FormatInt(workspace.facts.Workspace.ID, 10),
		"subject_type": "session_user", "subject_id": strconv.FormatInt(workspace.facts.UserID, 10), "operation": "run.create",
	})
	if err != nil {
		return "", "", err
	}
	request, err := common.Marshal(map[string]string{
		"scope": string(scope), "target": "/api/agent-platform/workspaces/" + strconv.FormatInt(workspace.facts.Workspace.ID, 10) + "/agents/" + strconv.FormatInt(workspace.ref.AgentID, 10) + "/runs",
		"intent_hash": intentDigest, "version_id": strconv.FormatInt(workspace.ref.VersionID, 10), "config_hash": workspace.version.ConfigHash,
	})
	if err != nil {
		return "", "", err
	}
	scopeHash, requestHash := sha256.Sum256(scope), sha256.Sum256(request)
	return hex.EncodeToString(scopeHash[:]), hex.EncodeToString(requestHash[:]), nil
}

func (workspace *metadataWorkspace) FindReceipt(keyDigest, intentDigest string) (*application.MetadataReplay, error) {
	scopeDigest, requestDigest, err := workspace.digests(intentDigest)
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
	if record.WorkspaceID != workspace.facts.Workspace.ID || record.ScopeHash != scopeDigest || record.KeyHash != keyDigest ||
		record.Operation != "run.create" || record.State != "completed" || record.ResourceType == nil || *record.ResourceType != "run" ||
		record.ResourceID == nil || *record.ResourceID <= 0 || record.ResponseStatus == nil || *record.ResponseStatus != http.StatusCreated ||
		record.ResponseJSON == nil || record.ExpiresAt <= 0 || record.ExpiresAt > agenttypes.MaxSafeInteger {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if record.RequestHash != requestDigest {
		return &application.MetadataReplay{RequestMatches: false}, nil
	}
	if record.ExpiresAt <= time.Now().UnixMilli() {
		return nil, agenttypes.NewError(agenttypes.IdempotencyConflict, nil)
	}
	var run model.AgentRun
	if err := workspace.tx.Select("id", "agent_id", "agent_version_id", "created_by", "funding_token_id", "input_hash", "created_at", "status", "mode").
		Where("team_id = ? AND workspace_id = ? AND id = ? AND agent_id = ? AND agent_version_id = ? AND created_by = ? AND funding_token_id = ?",
			workspace.facts.TeamID, workspace.facts.Workspace.ID, *record.ResourceID, workspace.ref.AgentID, workspace.ref.VersionID, workspace.facts.UserID, workspace.ref.FundingTokenID).Take(&run).Error; err != nil {
		return nil, err
	}
	if run.InputHash != requestDigest || !model.ValidAgentRunStatus(run.Status) || run.Mode != "production" || run.CreatedAt <= 0 || run.CreatedAt > agenttypes.MaxSafeInteger {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	receipt := application.MetadataReceipt{ID: run.ID, AgentID: run.AgentID, AgentVersionID: run.AgentVersionID, Status: "queued", Mode: "production", CreatedAt: run.CreatedAt}
	response, err := metadataReceiptJSON(receipt)
	if err != nil || response != *record.ResponseJSON {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return &application.MetadataReplay{Run: receipt, ExpiresAt: record.ExpiresAt, RequestMatches: true}, nil
}

func (workspace *metadataWorkspace) AppendRun(inputJSON, metadataJSON, intentDigest string) (application.MetadataReceipt, error) {
	_, requestDigest, err := workspace.digests(intentDigest)
	if err != nil || workspace.created != nil {
		return application.MetadataReceipt{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	var entropy [16]byte
	if _, err := rand.Read(entropy[:]); err != nil {
		return application.MetadataReceipt{}, err
	}
	snapshot, err := common.Marshal(map[string]any{
		"schema_version": 1, "admission": "metadata_only", "subject_type": "session", "subject_id": strconv.FormatInt(workspace.facts.UserID, 10),
		"team_id": strconv.FormatInt(workspace.facts.TeamID, 10), "workspace_id": strconv.FormatInt(workspace.facts.Workspace.ID, 10),
		"agent_id": strconv.FormatInt(workspace.ref.AgentID, 10), "agent_version_id": strconv.FormatInt(workspace.ref.VersionID, 10), "funding_token_id": strconv.FormatInt(workspace.ref.FundingTokenID, 10),
	})
	if err != nil {
		return application.MetadataReceipt{}, err
	}
	budget, err := strconv.ParseInt(workspace.config.Limits.MaxCostQuota, 10, 32)
	if err != nil || budget < 0 {
		return application.MetadataReceipt{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	run := &model.AgentRun{
		TeamID: workspace.facts.TeamID, WorkspaceID: workspace.facts.Workspace.ID, CreatedBy: workspace.facts.UserID,
		AgentID: workspace.ref.AgentID, AgentVersionID: workspace.ref.VersionID, FundingTokenID: workspace.ref.FundingTokenID,
		Status: "queued", TriggerType: "manual", Mode: "production", UsageState: "pending", BudgetPolicy: "strict",
		InputJSON: inputJSON, MetadataJSON: metadataJSON, InputHash: requestDigest, AuthSnapshotJSON: string(snapshot), TraceID: hex.EncodeToString(entropy[:]),
		BudgetLimitQuota: budget, MaxSteps: int32(workspace.config.Limits.MaxSteps), MaxModelCalls: int32(workspace.config.Limits.MaxModelCalls), MaxToolCalls: int32(workspace.config.Limits.MaxToolCalls),
		ExecutionBudgetMS: workspace.config.Limits.TimeoutSeconds * 1000,
	}
	if err := model.CreateLockedAgentRunMetadata(workspace.tx, workspace.facts, run); err != nil {
		return application.MetadataReceipt{}, err
	}
	workspace.created = run
	return application.MetadataReceipt{ID: run.ID, AgentID: run.AgentID, AgentVersionID: run.AgentVersionID, Status: run.Status, Mode: run.Mode, CreatedAt: run.CreatedAt}, nil
}

func (workspace *metadataWorkspace) SaveReceipt(keyDigest, intentDigest string, receipt application.MetadataReceipt) (int64, error) {
	if workspace.created == nil || receipt.ID != workspace.created.ID || receipt.AgentID != workspace.ref.AgentID || receipt.AgentVersionID != workspace.ref.VersionID {
		return 0, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	scopeDigest, requestDigest, err := workspace.digests(intentDigest)
	if err != nil {
		return 0, err
	}
	response, err := metadataReceiptJSON(receipt)
	if err != nil {
		return 0, err
	}
	resource, status := "run", int32(http.StatusCreated)
	record := &model.AgentIdempotencyKey{
		TeamID: workspace.facts.TeamID, WorkspaceID: workspace.facts.Workspace.ID, ScopeHash: scopeDigest, KeyHash: keyDigest,
		RequestHash: requestDigest, Operation: "run.create", State: "completed", ResourceType: &resource, ResourceID: &receipt.ID,
		ResponseStatus: &status, ResponseJSON: &response,
	}
	if err := workspace.tx.Create(record).Error; err != nil {
		return 0, err
	}
	return record.ExpiresAt, nil
}

func (workspace *metadataWorkspace) AuditCreation(runID int64, requestID string) error {
	if workspace.created == nil || workspace.created.ID != runID {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if err := model.RecordAgentRunMetadataAudit(workspace.tx, workspace.facts, runID, workspace.ref.AgentID, workspace.ref.VersionID, requestID); err != nil {
		return err
	}
	workspace.audited = true
	return nil
}

func metadataReceiptJSON(receipt application.MetadataReceipt) (string, error) {
	if receipt.ID <= 0 || receipt.AgentID <= 0 || receipt.AgentVersionID <= 0 || receipt.Status != "queued" || receipt.Mode != "production" || receipt.CreatedAt <= 0 || receipt.CreatedAt > agenttypes.MaxSafeInteger {
		return "", agenttypes.NewError(agenttypes.InternalError, nil)
	}
	encoded, err := common.Marshal(map[string]any{
		"id": strconv.FormatInt(receipt.ID, 10), "agent_id": strconv.FormatInt(receipt.AgentID, 10), "agent_version_id": strconv.FormatInt(receipt.AgentVersionID, 10),
		"status": receipt.Status, "mode": receipt.Mode, "created_at": receipt.CreatedAt,
	})
	return string(encoded), err
}
