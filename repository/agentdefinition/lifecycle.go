package agentdefinition

import (
	"context"
	"errors"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/agent"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
)

type LifecycleRepository struct {
	db       *gorm.DB
	identity model.AuthSessionIdentity
}

func NewLifecycleRepository(db *gorm.DB, identity model.AuthSessionIdentity) *LifecycleRepository {
	return &LifecycleRepository{db: db, identity: identity}
}

var _ application.LifecycleRepository = (*LifecycleRepository)(nil)

type lifecycleWorkspace struct {
	tx      *gorm.DB
	facts   *model.AgentWorkspaceWriteFacts
	current *model.AgentDefinition
	version *model.AgentVersion
	audited bool
}

func (repo *LifecycleRepository) GatewayLimits() application.GatewayLimits {
	return agent.AgentDraftGatewayLimits()
}

func (repo *LifecycleRepository) WithLifecycleWorkspace(ctx context.Context, workspaceID int64, action application.LifecycleAction, apply func(application.LifecycleTransaction) error) error {
	if repo == nil || apply == nil {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	authorize := agent.AuthorizeLockedAgentDraft
	switch action {
	case application.LifecycleRestore, application.LifecycleStatus, application.LifecycleArchive:
	case application.LifecycleActivate:
		authorize = agent.AuthorizeLockedAgentPublish
	default:
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return withDefinitionWorkspace(ctx, repo.db, repo.identity, workspaceID, authorize, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) (bool, error) {
		workspace := &lifecycleWorkspace{tx: tx, facts: facts}
		err := apply(workspace)
		return workspace.audited, err
	})
}

func (workspace *lifecycleWorkspace) LockDefinition(agentID int64) (application.LifecycleDefinition, error) {
	record, err := model.LockAgentPublishDefinition(workspace.tx, workspace.facts, agentID)
	if err != nil {
		return application.LifecycleDefinition{}, err
	}
	workspace.current = record
	return application.LifecycleDefinition{
		Name: record.Name, Status: record.Status, MetadataRevision: record.Revision,
		DraftRevision: record.DraftRevision, CurrentVersionID: record.CurrentVersionID,
	}, nil
}

func (workspace *lifecycleWorkspace) ReadVersion(versionID int64) (application.LifecycleVersion, error) {
	record, err := model.LockAgentLifecycleVersion(workspace.tx, workspace.facts, workspace.current, versionID)
	if err != nil {
		return application.LifecycleVersion{}, err
	}
	workspace.version = record
	return application.LifecycleVersion{ID: record.ID, Revoked: record.RevokedAt != nil, Config: application.StoredVersionConfiguration{
		ConfigJSON: record.ConfigJSON, ConfigHash: record.ConfigHash, InputSchemaJSON: record.InputSchemaJSON, OutputSchemaJSON: record.OutputSchemaJSON,
	}}, nil
}

func (workspace *lifecycleWorkspace) ReadPolicy(ctx context.Context, modelName string) (application.DraftPolicy, error) {
	return agent.ReadLockedAgentPublicationPolicy(ctx, workspace.tx, workspace.facts, modelName)
}

func (workspace *lifecycleWorkspace) RestoreDraft(versionID, expectedDraftRevision int64) (int64, error) {
	if workspace.current == nil || workspace.version == nil || workspace.version.ID != versionID || workspace.version.RevokedAt != nil {
		return 0, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	record, err := model.UpdateLockedAgentDraft(workspace.tx, workspace.facts, workspace.current, expectedDraftRevision, workspace.version.ConfigJSON)
	if err != nil {
		return 0, err
	}
	return record.DraftRevision, nil
}

func (workspace *lifecycleWorkspace) ActivateVersion(versionID, expectedRevision int64) (application.LifecycleResult, error) {
	if workspace.current == nil || workspace.version == nil || workspace.version.ID != versionID || workspace.version.RevokedAt != nil {
		return application.LifecycleResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	record, err := model.ActivateLockedAgentVersion(workspace.tx, workspace.facts, workspace.current, workspace.version, expectedRevision)
	if err != nil {
		return application.LifecycleResult{}, lifecycleMetadataError(err)
	}
	return lifecycleResult(record)
}

func (workspace *lifecycleWorkspace) ChangeStatus(expectedRevision int64, status string) (application.LifecycleResult, error) {
	record, err := model.SetLockedAgentDefinitionStatus(workspace.tx, workspace.facts, workspace.current, expectedRevision, status)
	if err != nil {
		return application.LifecycleResult{}, lifecycleMetadataError(err)
	}
	return lifecycleResult(record)
}

func (workspace *lifecycleWorkspace) Archive(expectedRevision int64) (application.LifecycleResult, error) {
	record, err := model.ArchiveLockedAgentDefinition(workspace.tx, workspace.facts, workspace.current, expectedRevision)
	if err != nil {
		return application.LifecycleResult{}, lifecycleMetadataError(err)
	}
	return lifecycleResult(record)
}

func (workspace *lifecycleWorkspace) ArchiveDependenciesAvailable() (bool, error) {
	return model.AgentWorkspaceArchiveDependenciesAvailable(workspace.tx)
}

func (workspace *lifecycleWorkspace) AuditLifecycle(action application.LifecycleAction, versionID, previous, revision int64, previousStatus, status, reasonHash, requestID string) error {
	if workspace.current == nil {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if err := model.RecordAgentLifecycleAudit(workspace.tx, workspace.facts, workspace.current.ID, versionID, string(action), previous, revision, previousStatus, status, reasonHash, requestID); err != nil {
		return err
	}
	workspace.audited = true
	return nil
}

func lifecycleMetadataError(err error) error {
	if errors.Is(err, model.ErrAgentDefinitionRevision) {
		return agenttypes.NewError(agenttypes.InvalidState, nil)
	}
	return err
}

func lifecycleResult(record *model.AgentDefinition) (application.LifecycleResult, error) {
	if record == nil || record.ID <= 0 || record.Revision <= 0 || record.Revision > agenttypes.MaxSafeInteger ||
		record.CurrentVersionID != nil && *record.CurrentVersionID <= 0 {
		return application.LifecycleResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if record.Status != model.AgentDefinitionStatusActive && record.Status != model.AgentDefinitionStatusDisabled && record.Status != model.AgentDefinitionStatusArchived ||
		(record.Status == model.AgentDefinitionStatusArchived) != (record.ArchivedAt != nil) ||
		record.ArchivedAt != nil && (*record.ArchivedAt <= 0 || *record.ArchivedAt > agenttypes.MaxSafeInteger) {
		return application.LifecycleResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return application.LifecycleResult{AgentID: record.ID, Status: record.Status, Revision: record.Revision,
		CurrentVersionID: record.CurrentVersionID, ArchivedAt: record.ArchivedAt}, nil
}
