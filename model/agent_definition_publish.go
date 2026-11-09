package model

import (
	"crypto/sha256"
	"encoding/hex"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// LockAgentPublishDefinition reads the editable definition after the caller has
// authorized the current management session and agent:publish in this transaction.
// A disabled definition may be read for an existing immutable publish receipt.
func LockAgentPublishDefinition(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, agentID int64) (*AgentDefinition, error) {
	if !agentDraftWriteScopeValid(tx, facts) || agentID <= 0 {
		return nil, ErrAgentDefinitionInvalid
	}
	tx = tx.Session(&gorm.Session{Logger: logger.Discard})
	var current AgentDefinition
	err := lockForUpdate(tx).
		Select("id", "team_id", "workspace_id", "name", "kind", "status", "updated_at", "revision", "draft_json", "draft_hash", "draft_revision", "next_version", "current_version_id").
		Where("team_id = ? AND workspace_id = ? AND id = ? AND archived_at IS NULL AND "+
			agentWorkspaceExactColumn(tx, "status")+" IN ?", facts.TeamID, facts.Workspace.ID, agentID,
			[]string{AgentDefinitionStatusActive, AgentDefinitionStatusDisabled}).Take(&current).Error
	if err != nil {
		return nil, err
	}
	return &current, nil
}

// PublishLockedAgentDefinition appends a release and switches its public pointer
// within the caller's workspace transaction. Config must be the exact canonical
// draft approved by the application, not a replacement or a silently repaired row.
func PublishLockedAgentDefinition(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, current *AgentDefinition, expectedDraftRevision int64, configJSON, inputSchemaJSON, outputSchemaJSON, releaseNote string) (*AgentVersion, error) {
	if !agentDraftWriteScopeValid(tx, facts) || current == nil || current.ID <= 0 ||
		current.TeamID != facts.TeamID || current.WorkspaceID != facts.Workspace.ID ||
		current.Status != AgentDefinitionStatusActive || current.Kind != AgentDefinitionKindSingle ||
		current.Revision <= 0 || current.Revision >= agentDefinitionMaxInteger ||
		current.NextVersion <= 0 || current.NextVersion >= agentDefinitionMaxInteger ||
		expectedDraftRevision <= 0 || expectedDraftRevision > agentDefinitionMaxInteger {
		return nil, ErrAgentDefinitionInvalid
	}
	if current.DraftRevision != expectedDraftRevision {
		return nil, ErrAgentDefinitionRevision
	}
	config, err := canonicalAgentDefinitionObject(configJSON, true)
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256([]byte(config))
	hash := hex.EncodeToString(digest[:])
	if config == AgentDraftPendingJSON || config != current.DraftJSON || hash != current.DraftHash {
		return nil, ErrAgentDefinitionInvalid
	}
	version := &AgentVersion{
		TeamID: facts.TeamID, WorkspaceID: facts.Workspace.ID, AgentID: current.ID, CreatedBy: facts.UserID,
		VersionNo: current.NextVersion, VersionKind: AgentVersionKindRelease,
		SourceDraftRevision: expectedDraftRevision, SchemaVersion: 1,
		ConfigJSON: config, ConfigHash: hash, InputSchemaJSON: inputSchemaJSON, OutputSchemaJSON: outputSchemaJSON,
		ReleaseNote: releaseNote,
	}
	tx = tx.Session(&gorm.Session{Logger: logger.Discard})
	if err := tx.Create(version).Error; err != nil {
		return nil, err
	}
	if version.ID <= 0 || version.PublishedAt == nil || *version.PublishedAt <= 0 || *version.PublishedAt > agentDefinitionMaxInteger {
		return nil, ErrAgentDefinitionInvalid
	}
	updatedAt := max(time.Now().UnixMilli(), current.UpdatedAt)
	if updatedAt <= 0 || updatedAt > agentDefinitionMaxInteger {
		return nil, ErrAgentDefinitionInvalid
	}
	updated := tx.Session(&gorm.Session{SkipHooks: true}).Model(&AgentDefinition{}).
		Where("team_id = ? AND workspace_id = ? AND id = ? AND revision = ? AND draft_revision = ? AND next_version = ? AND "+
			agentWorkspaceExactColumn(tx, "draft_hash")+" = ? AND archived_at IS NULL AND "+agentWorkspaceExactColumn(tx, "status")+" = ?",
			facts.TeamID, facts.Workspace.ID, current.ID, current.Revision, expectedDraftRevision, current.NextVersion, hash, AgentDefinitionStatusActive).
		Updates(map[string]any{"current_version_id": version.ID, "next_version": current.NextVersion + 1,
			"revision": current.Revision + 1, "updated_at": updatedAt, "updated_by": facts.UserID})
	if updated.Error != nil {
		return nil, updated.Error
	}
	if updated.RowsAffected != 1 {
		return nil, ErrAgentDefinitionRevision
	}
	return version, nil
}
