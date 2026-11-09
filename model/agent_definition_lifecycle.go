package model

import (
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// LockAgentLifecycleVersion selects only a release belonging to the already
// locked Agent. Revocation is returned for an explicit controlled-state check.
func LockAgentLifecycleVersion(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, current *AgentDefinition, versionID int64) (*AgentVersion, error) {
	if !agentDraftWriteScopeValid(tx, facts) || current == nil || current.ID <= 0 || versionID <= 0 ||
		current.TeamID != facts.TeamID || current.WorkspaceID != facts.Workspace.ID || current.NextVersion <= 0 || current.NextVersion > agentDefinitionMaxInteger {
		return nil, ErrAgentDefinitionInvalid
	}
	var version AgentVersion
	err := lockForUpdate(tx.Session(&gorm.Session{Logger: logger.Discard})).
		Where("team_id = ? AND workspace_id = ? AND agent_id = ? AND id = ? AND "+agentWorkspaceExactColumn(tx, "version_kind")+" = ? AND published_at > 0 AND version_no < ?",
			facts.TeamID, facts.Workspace.ID, current.ID, versionID, AgentVersionKindRelease, current.NextVersion).
		Take(&version).Error
	if err != nil {
		return nil, err
	}
	if version.SchemaVersion != 1 || version.VersionNo <= 0 || version.VersionNo > agentDefinitionMaxInteger ||
		version.SourceDraftRevision <= 0 || version.SourceDraftRevision > agentDefinitionMaxInteger || version.CreatedBy <= 0 ||
		version.CreatedAt <= 0 || version.CreatedAt > agentDefinitionMaxInteger ||
		version.PublishedAt == nil || *version.PublishedAt <= 0 || *version.PublishedAt > agentDefinitionMaxInteger ||
		version.RevokedAt != nil && (*version.RevokedAt <= 0 || *version.RevokedAt > agentDefinitionMaxInteger) {
		return nil, ErrAgentDefinitionInvalid
	}
	if err := VerifyAgentVersionSnapshot(version.ConfigJSON, version.InputSchemaJSON, version.OutputSchemaJSON, version.ConfigHash); err != nil {
		return nil, err
	}
	return &version, nil
}

// ActivateLockedAgentVersion changes only the mutable publication pointer;
// neither the historical release nor the current draft is changed.
func ActivateLockedAgentVersion(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, current *AgentDefinition, version *AgentVersion, expectedRevision int64) (*AgentDefinition, error) {
	if !agentDraftWriteScopeValid(tx, facts) || version == nil || current == nil || version.ID <= 0 || version.AgentID != current.ID ||
		version.TeamID != facts.TeamID || version.WorkspaceID != facts.Workspace.ID ||
		version.VersionKind != AgentVersionKindRelease || version.RevokedAt != nil || version.PublishedAt == nil ||
		*version.PublishedAt <= 0 || version.VersionNo <= 0 || version.VersionNo >= current.NextVersion {
		return nil, ErrAgentDefinitionInvalid
	}
	result, err := replaceAgentDefinitionLifecycle(tx, facts, current, expectedRevision, map[string]any{"current_version_id": version.ID})
	if err != nil {
		return nil, err
	}
	id := version.ID
	result.CurrentVersionID = &id
	return result, nil
}

// SetLockedAgentDefinitionStatus keeps snapshots, draft and current pointer.
func SetLockedAgentDefinitionStatus(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, current *AgentDefinition, expectedRevision int64, status string) (*AgentDefinition, error) {
	if status != AgentDefinitionStatusActive && status != AgentDefinitionStatusDisabled {
		return nil, ErrAgentDefinitionInvalid
	}
	result, err := replaceAgentDefinitionLifecycle(tx, facts, current, expectedRevision, map[string]any{"status": status})
	if err != nil {
		return nil, err
	}
	result.Status = status
	return result, nil
}

// ArchiveLockedAgentDefinition retains historical configuration and references.
// The application must first check the current phase's dependency adapter.
func ArchiveLockedAgentDefinition(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, current *AgentDefinition, expectedRevision int64) (*AgentDefinition, error) {
	if current == nil {
		return nil, ErrAgentDefinitionInvalid
	}
	archivedAt := max(time.Now().UnixMilli(), current.UpdatedAt)
	if archivedAt <= 0 || archivedAt > agentDefinitionMaxInteger {
		return nil, ErrAgentDefinitionInvalid
	}
	result, err := replaceAgentDefinitionLifecycle(tx, facts, current, expectedRevision, map[string]any{"status": AgentDefinitionStatusArchived, "archived_at": archivedAt})
	if err != nil {
		return nil, err
	}
	result.Status, result.ArchivedAt = AgentDefinitionStatusArchived, &archivedAt
	return result, nil
}

func replaceAgentDefinitionLifecycle(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, current *AgentDefinition, expectedRevision int64, changes map[string]any) (*AgentDefinition, error) {
	if !agentDraftWriteScopeValid(tx, facts) || current == nil || current.ID <= 0 ||
		current.TeamID != facts.TeamID || current.WorkspaceID != facts.Workspace.ID ||
		current.ArchivedAt != nil || (current.Status != AgentDefinitionStatusActive && current.Status != AgentDefinitionStatusDisabled) ||
		expectedRevision <= 0 || expectedRevision >= agentDefinitionMaxInteger {
		return nil, ErrAgentDefinitionInvalid
	}
	if current.Revision != expectedRevision {
		return nil, ErrAgentDefinitionRevision
	}
	updatedAt := max(time.Now().UnixMilli(), current.UpdatedAt)
	if updatedAt <= 0 || updatedAt > agentDefinitionMaxInteger {
		return nil, ErrAgentDefinitionInvalid
	}
	changes["revision"], changes["updated_at"], changes["updated_by"] = expectedRevision+1, updatedAt, facts.UserID
	updated := tx.Session(&gorm.Session{SkipHooks: true, Logger: logger.Discard}).Model(&AgentDefinition{}).
		Where("team_id = ? AND workspace_id = ? AND id = ? AND revision = ? AND archived_at IS NULL AND "+agentWorkspaceExactColumn(tx, "status")+" = ?",
			facts.TeamID, facts.Workspace.ID, current.ID, expectedRevision, current.Status).Updates(changes)
	if updated.Error != nil {
		return nil, updated.Error
	}
	if updated.RowsAffected != 1 {
		return nil, ErrAgentDefinitionRevision
	}
	result := *current
	result.Revision, result.UpdatedAt, result.UpdatedBy = expectedRevision+1, updatedAt, &facts.UserID
	return &result, nil
}
