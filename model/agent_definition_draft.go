package model

import (
	"crypto/sha256"
	"encoding/hex"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// AgentDraftPendingJSON is a persisted marker, never an executable config.
// Only the metadata-only creation operation stores it.
const AgentDraftPendingJSON = `{"schema_version":1}`

// CreateAgentDraftDefinition runs after the caller authorizes agent:write using
// the same transaction's locked workspace facts.
func CreateAgentDraftDefinition(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, slug, name, description string) (*AgentDefinition, error) {
	if !agentDraftWriteScopeValid(tx, facts) {
		return nil, ErrAgentDefinitionInvalid
	}
	definition := &AgentDefinition{
		TeamID: facts.TeamID, WorkspaceID: facts.Workspace.ID, CreatedBy: facts.UserID,
		Slug: slug, Name: name, Description: description, Kind: AgentDefinitionKindSingle,
		Status: AgentDefinitionStatusActive, TagsJSON: "[]", DraftJSON: AgentDraftPendingJSON,
	}
	if err := tx.Session(&gorm.Session{Logger: logger.Discard}).Create(definition).Error; err != nil {
		return nil, err
	}
	return definition, nil
}

// LockAgentDraftDefinition selects only the authorized draft data. A caller
// must keep the returned row inside the transaction that established facts.
func LockAgentDraftDefinition(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, agentID int64) (*AgentDefinition, error) {
	if !agentDraftWriteScopeValid(tx, facts) || agentID <= 0 {
		return nil, ErrAgentDefinitionInvalid
	}
	return lockAgentDefinitionDraft(tx, facts.TeamID, facts.Workspace.ID, agentID)
}

func lockAgentDefinitionDraft(tx *gorm.DB, teamID, workspaceID, agentID int64) (*AgentDefinition, error) {
	tx = tx.Session(&gorm.Session{Logger: logger.Discard})
	var current AgentDefinition
	err := lockForUpdate(tx).
		Select("id", "team_id", "workspace_id", "slug", "name", "status", "updated_at", "draft_revision", "draft_json").
		Where("team_id = ? AND workspace_id = ? AND id = ? AND archived_at IS NULL AND "+
			agentWorkspaceExactColumn(tx, "status")+" IN ?", teamID, workspaceID, agentID,
			[]string{AgentDefinitionStatusActive, AgentDefinitionStatusDisabled}).Take(&current).Error
	if err != nil {
		return nil, err
	}
	return &current, nil
}

// UpdateLockedAgentDraft replaces only the draft columns. The caller must
// supply a row loaded by LockAgentDraftDefinition in this transaction and a
// fully validated config; the model still checks canonical storage and CAS.
func UpdateLockedAgentDraft(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, current *AgentDefinition, expectedDraftRevision int64, draftJSON string) (*AgentDefinition, error) {
	if !agentDraftWriteScopeValid(tx, facts) || current == nil || current.ID <= 0 ||
		current.TeamID != facts.TeamID || current.WorkspaceID != facts.Workspace.ID ||
		expectedDraftRevision <= 0 || expectedDraftRevision >= agentDefinitionMaxInteger {
		return nil, ErrAgentDefinitionInvalid
	}
	draft, err := canonicalAgentDefinitionObject(draftJSON, true)
	if err != nil {
		return nil, err
	}
	if draft == AgentDraftPendingJSON {
		return nil, ErrAgentDefinitionInvalid
	}
	return replaceAgentDefinitionDraft(tx, current, facts.UserID, expectedDraftRevision, draft)
}

func replaceAgentDefinitionDraft(tx *gorm.DB, current *AgentDefinition, actorID, expectedDraftRevision int64, draft string) (*AgentDefinition, error) {
	if current.DraftRevision != expectedDraftRevision {
		return nil, ErrAgentDefinitionRevision
	}
	hash := sha256.Sum256([]byte(draft))
	digest := hex.EncodeToString(hash[:])
	updatedAt := max(time.Now().UnixMilli(), current.UpdatedAt)
	tx = tx.Session(&gorm.Session{SkipHooks: true, Logger: logger.Discard})
	updated := tx.Model(&AgentDefinition{}).
		Where("team_id = ? AND workspace_id = ? AND id = ? AND draft_revision = ? AND archived_at IS NULL AND "+
			agentWorkspaceExactColumn(tx, "status")+" IN ?", current.TeamID, current.WorkspaceID, current.ID, expectedDraftRevision,
			[]string{AgentDefinitionStatusActive, AgentDefinitionStatusDisabled}).
		Updates(map[string]any{"draft_json": draft, "draft_hash": digest, "draft_revision": expectedDraftRevision + 1, "updated_at": updatedAt, "updated_by": actorID})
	if updated.Error != nil {
		return nil, updated.Error
	}
	if updated.RowsAffected != 1 {
		return nil, ErrAgentDefinitionRevision
	}
	result := *current
	result.DraftJSON, result.DraftHash, result.DraftRevision, result.UpdatedAt, result.UpdatedBy = draft, digest, expectedDraftRevision+1, updatedAt, &actorID
	return &result, nil
}

func agentDraftWriteScopeValid(tx *gorm.DB, facts *AgentWorkspaceWriteFacts) bool {
	if tx == nil || tx.Statement == nil || facts == nil || facts.TeamID <= 0 || facts.UserID <= 0 ||
		facts.Workspace == nil || facts.Workspace.ID <= 0 || facts.Workspace.TeamID != facts.TeamID ||
		facts.Workspace.Status != AgentWorkspaceStatusActive || facts.Workspace.ArchivedAt != nil {
		return false
	}
	_, transactional := tx.Statement.ConnPool.(gorm.TxCommitter)
	return transactional
}
