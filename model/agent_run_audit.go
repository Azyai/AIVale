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

// RecordAgentRunMetadataAudit 与Run元数据及幂等收据同事务保存脱敏引用。
// 此事实不包含输入、metadata、授权摘要或资金凭据，也不派发运行通知。
func RecordAgentRunMetadataAudit(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, runID, agentID, versionID int64, requestID string) error {
	if !agentDraftWriteScopeValid(tx, facts) || runID <= 0 || agentID <= 0 || versionID <= 0 {
		return ErrAgentDefinitionInvalid
	}
	var entropy [32]byte
	if _, err := rand.Read(entropy[:]); err != nil {
		return err
	}
	eventID := hex.EncodeToString(entropy[:])
	encoded, err := common.Marshal(WorkspaceAuditPayload{
		SchemaVersion:    agentRunMetadataAuditSchemaVersion,
		EventID:          eventID,
		ActorID:          strconv.FormatInt(facts.UserID, 10),
		ActorRole:        facts.ActorRole,
		TeamID:           strconv.FormatInt(facts.TeamID, 10),
		WorkspaceID:      strconv.FormatInt(facts.Workspace.ID, 10),
		RunID:            strconv.FormatInt(runID, 10),
		AgentID:          strconv.FormatInt(agentID, 10),
		VersionID:        strconv.FormatInt(versionID, 10),
		Operation:        "run.metadata.create",
		PreviousRevision: 0, Revision: 1, RequestID: requestID,
		Timestamp: time.Now().UnixMilli(), ChangedFields: []string{},
	})
	if err != nil {
		return err
	}
	return tx.Session(&gorm.Session{Logger: logger.Discard}).Create(&AgentOutbox{
		TeamID: facts.TeamID, WorkspaceID: facts.Workspace.ID, EventKey: eventID,
		Kind: AgentOutboxKindRunMetadataAudit, AggregateType: "run", AggregateID: runID,
		PayloadJSON: string(encoded), Status: "pending",
	}).Error
}
