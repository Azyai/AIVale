package model

import (
	"crypto/rand"
	"encoding/hex"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// RecordAgentDefinitionAudit persists a redacted fact with the draft mutation.
// Only identifiers, draft revisions and the fixed action reach the log store.
func RecordAgentDefinitionAudit(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, agentID int64, operation string, previous, revision int64, requestID string) error {
	if !agentDraftWriteScopeValid(tx, facts) || agentID <= 0 {
		return ErrAgentDefinitionInvalid
	}
	var entropy [32]byte
	if _, err := rand.Read(entropy[:]); err != nil {
		return err
	}
	eventID := hex.EncodeToString(entropy[:])
	encoded, err := common.Marshal(WorkspaceAuditPayload{
		SchemaVersion: agentDefinitionAuditSchemaVersion,
		EventID:       eventID,
		ActorID:       strconv.FormatInt(facts.UserID, 10),
		ActorRole:     facts.ActorRole,
		TeamID:        strconv.FormatInt(facts.TeamID, 10),
		WorkspaceID:   strconv.FormatInt(facts.Workspace.ID, 10),
		AgentID:       strconv.FormatInt(agentID, 10),
		Operation:     operation, PreviousRevision: previous, Revision: revision,
		RequestID: requestID, Timestamp: time.Now().UnixMilli(), ChangedFields: []string{},
	})
	if err != nil {
		return err
	}
	return tx.Session(&gorm.Session{Logger: logger.Discard}).Create(&AgentOutbox{
		TeamID: facts.TeamID, WorkspaceID: facts.Workspace.ID, EventKey: eventID,
		Kind: AgentOutboxKindDefinitionAudit, AggregateType: "agent", AggregateID: agentID,
		PayloadJSON: string(encoded), Status: "pending",
	}).Error
}

// RecordAgentPublicationAudit records only immutable references and revisions.
// It commits with the release, public pointer and acceptance receipt.
func RecordAgentPublicationAudit(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, agentID, versionID, sourceDraftRevision, previousMetadataRevision, newMetadataRevision int64, requestID string) error {
	if !agentDraftWriteScopeValid(tx, facts) || agentID <= 0 || versionID <= 0 {
		return ErrAgentDefinitionInvalid
	}
	var entropy [32]byte
	if _, err := rand.Read(entropy[:]); err != nil {
		return err
	}
	eventID := hex.EncodeToString(entropy[:])
	encoded, err := common.Marshal(WorkspaceAuditPayload{
		SchemaVersion: agentPublicationAuditSchemaVersion,
		EventID:       eventID,
		ActorID:       strconv.FormatInt(facts.UserID, 10),
		ActorRole:     facts.ActorRole,
		TeamID:        strconv.FormatInt(facts.TeamID, 10),
		WorkspaceID:   strconv.FormatInt(facts.Workspace.ID, 10),
		AgentID:       strconv.FormatInt(agentID, 10),
		VersionID:     strconv.FormatInt(versionID, 10), SourceDraftRevision: sourceDraftRevision,
		Operation: "agent.publish", PreviousRevision: previousMetadataRevision, Revision: newMetadataRevision,
		RequestID: requestID, Timestamp: time.Now().UnixMilli(), ChangedFields: []string{},
	})
	if err != nil {
		return err
	}
	return tx.Session(&gorm.Session{Logger: logger.Discard}).Create(&AgentOutbox{
		TeamID: facts.TeamID, WorkspaceID: facts.Workspace.ID, EventKey: eventID,
		Kind: AgentOutboxKindPublicationAudit, AggregateType: "agent", AggregateID: agentID,
		PayloadJSON: string(encoded), Status: "pending",
	}).Error
}

// RecordAgentLifecycleAudit commits fixed references, revisions and states with
// the mutation; the human reason is represented only by its normalized digest.
func RecordAgentLifecycleAudit(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, agentID, versionID int64, operation string, previous, revision int64, previousStatus, status, reasonHash, requestID string) error {
	if !agentDraftWriteScopeValid(tx, facts) || agentID <= 0 || versionID < 0 {
		return ErrAgentDefinitionInvalid
	}
	var entropy [32]byte
	if _, err := rand.Read(entropy[:]); err != nil {
		return err
	}
	eventID := hex.EncodeToString(entropy[:])
	payload := WorkspaceAuditPayload{
		SchemaVersion: agentLifecycleAuditSchemaVersion, EventID: eventID,
		ActorID: strconv.FormatInt(facts.UserID, 10), ActorRole: facts.ActorRole,
		TeamID: strconv.FormatInt(facts.TeamID, 10), WorkspaceID: strconv.FormatInt(facts.Workspace.ID, 10),
		AgentID: strconv.FormatInt(agentID, 10), Operation: operation,
		PreviousRevision: previous, Revision: revision, PreviousAgentStatus: previousStatus, AgentStatus: status,
		ReasonHash: reasonHash, RequestID: requestID, Timestamp: time.Now().UnixMilli(), ChangedFields: []string{},
	}
	if versionID != 0 {
		payload.VersionID = strconv.FormatInt(versionID, 10)
	}
	encoded, err := common.Marshal(payload)
	if err != nil {
		return err
	}
	return tx.Session(&gorm.Session{Logger: logger.Discard}).Create(&AgentOutbox{
		TeamID: facts.TeamID, WorkspaceID: facts.Workspace.ID, EventKey: eventID,
		Kind: AgentOutboxKindLifecycleAudit, AggregateType: "agent", AggregateID: agentID,
		PayloadJSON: string(encoded), Status: "pending",
	}).Error
}
