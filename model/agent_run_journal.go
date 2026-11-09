package model

import (
	"bytes"
	"errors"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	ErrAgentRunJournalInvalid  = errors.New("invalid agent run journal operation")
	ErrAgentRunJournalState    = errors.New("agent run journal state does not permit operation")
	ErrAgentRunJournalConflict = errors.New("agent run journal intent conflicts")
)

// AgentRunExecutionSnapshotValid recognizes a persisted internal admission
// snapshot; it does not authenticate its caller or create an execution permit.
// The current public metadata admission never writes this snapshot.
func AgentRunExecutionSnapshotValid(run *AgentRun) bool {
	if run == nil || run.CallerTokenID != nil || len(run.AuthSnapshotJSON) > 16*1024 {
		return false
	}
	auth, err := common.UnmarshalJSONObjectStrict([]byte(run.AuthSnapshotJSON))
	if err != nil || len(auth) != 9 || !bytes.Equal(bytes.TrimSpace(auth["schema_version"]), []byte("1")) ||
		!bytes.Equal(bytes.TrimSpace(auth["admission"]), []byte(`"execution"`)) || !bytes.Equal(bytes.TrimSpace(auth["subject_type"]), []byte(`"session"`)) {
		return false
	}
	for _, ref := range []struct {
		field string
		id    int64
	}{
		{"subject_id", run.CreatedBy}, {"team_id", run.TeamID}, {"workspace_id", run.WorkspaceID},
		{"agent_id", run.AgentID}, {"agent_version_id", run.AgentVersionID}, {"funding_token_id", run.FundingTokenID},
	} {
		encoded, err := common.Marshal(strconv.FormatInt(ref.id, 10))
		if ref.id <= 0 || err != nil || !bytes.Equal(bytes.TrimSpace(auth[ref.field]), encoded) {
			return false
		}
	}
	return true
}

// WithAgentRunJournal retries only transactions known to have rolled back.
// A COMMIT error is ambiguous and is returned without replaying the callback.
func WithAgentRunJournal(db *gorm.DB, apply func(*gorm.DB) error) error {
	if db == nil || db.Statement == nil || db.Statement.ConnPool == nil || db.Error != nil || apply == nil {
		return ErrAgentRunJournalInvalid
	}
	if _, nested := db.Statement.ConnPool.(gorm.TxCommitter); nested {
		return ErrAgentRunJournalInvalid
	}
	db = db.Session(&gorm.Session{Logger: logger.Discard})
	for attempt := range 3 {
		rolledBack, err := agentWorkspaceWriteAttempt(db, apply)
		if err == nil || !rolledBack || !agentWorkspaceWriteRetryable(err) || attempt == 2 {
			return err
		}
		timer := time.NewTimer(time.Duration(attempt+1) * 10 * time.Millisecond)
		select {
		case <-db.Statement.Context.Done():
			timer.Stop()
			return db.Statement.Context.Err()
		case <-timer.C:
		}
	}
	return ErrAgentRunJournalState
}

func lockAgentRunJournal(tx *gorm.DB, scope agenttypes.AgentRunJournalScope) (*AgentRun, error) {
	if tx == nil || tx.Statement == nil || tx.Error != nil || scope.TeamID <= 0 || scope.WorkspaceID <= 0 || scope.RunID <= 0 {
		return nil, ErrAgentRunJournalInvalid
	}
	if _, ok := tx.Statement.ConnPool.(gorm.TxCommitter); !ok {
		return nil, ErrAgentRunJournalInvalid
	}
	var run AgentRun
	err := lockForUpdate(tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard})).Where("id = ? AND team_id = ? AND workspace_id = ?", scope.RunID, scope.TeamID, scope.WorkspaceID).Take(&run).Error
	if err != nil {
		return nil, err
	}
	if !AgentRunExecutionSnapshotValid(&run) || run.Revision < 1 || run.Revision > agenttypes.MaxSafeInteger || run.LastEventSeq < 0 || run.LastEventSeq > agenttypes.MaxSafeInteger {
		return nil, ErrAgentRunJournalState
	}
	return &run, nil
}

func agentRunJournalFenceValid(run *AgentRun, fence agenttypes.AgentRunJournalFence, now int64) bool {
	return run.Status == AgentRunStatusRunning && run.LastEventSeq > 0 && fence.LeaseEpoch > 0 && fence.LeaseEpoch <= agenttypes.MaxSafeInteger && run.LeaseEpoch == fence.LeaseEpoch &&
		fence.LeaseOwner != "" && run.LeaseOwner != nil && *run.LeaseOwner == fence.LeaseOwner &&
		run.LeaseExpiresAt != nil && *run.LeaseExpiresAt > now && run.DeadlineAt > now && run.CancelRequestedAt == nil
}

// InitializeAgentRunJournal joins the caller's transaction, allowing future
// admission to insert Run + first event + notification in one commit. T01 does
// not supply that admission. metadata_only runs always fail closed.
func InitializeAgentRunJournal(tx *gorm.DB, scope agenttypes.AgentRunJournalScope, expectedRevision int64, eventKey string) (agenttypes.AgentRunJournalResult, error) {
	if !agentDigestValid(eventKey) || expectedRevision < 1 || expectedRevision >= agenttypes.MaxSafeInteger {
		return agenttypes.AgentRunJournalResult{}, ErrAgentRunJournalInvalid
	}
	run, err := lockAgentRunJournal(tx, scope)
	if err != nil {
		return agenttypes.AgentRunJournalResult{}, err
	}
	if run.Status != AgentRunStatusQueued || run.LeaseEpoch != 0 || run.LeaseOwner != nil || run.LeaseExpiresAt != nil {
		return agenttypes.AgentRunJournalResult{}, ErrAgentRunJournalState
	}
	payload, _ := common.Marshal(map[string]any{"schema_version": 1, "run_id": strconv.FormatInt(run.ID, 10), "status": AgentRunStatusQueued})
	if old, err := agentRunJournalReplay(tx, run, eventKey, "run.queued", nil, string(payload), AgentOutboxKindRunReady); err != nil || old != nil {
		if old != nil {
			return *old, err
		}
		return agenttypes.AgentRunJournalResult{}, err
	}
	if run.Revision != expectedRevision || run.LastEventSeq != 0 || run.StepCount != 0 {
		return agenttypes.AgentRunJournalResult{}, ErrAgentRunJournalConflict
	}
	return appendAgentRunJournal(tx, run, eventKey, "run.queued", nil, string(payload), AgentOutboxKindRunReady, false)
}

func EnsureAgentRunPendingStep(tx *gorm.DB, fence agenttypes.AgentRunJournalFence, intent agenttypes.AgentRunPendingStepIntent, eventKey string) (agenttypes.AgentRunJournalResult, error) {
	if intent.SideEffectPolicy == "" {
		intent.SideEffectPolicy = AgentRunStepSideEffectUnknown
	}
	if !agentDigestValid(eventKey) || !agentRunStepKey.MatchString(intent.StepKey) {
		return agenttypes.AgentRunJournalResult{}, ErrAgentRunJournalInvalid
	}
	run, err := lockAgentRunJournal(tx, fence.Scope)
	if err != nil {
		return agenttypes.AgentRunJournalResult{}, err
	}
	if !agentRunJournalFenceValid(run, fence, time.Now().UnixMilli()) {
		return agenttypes.AgentRunJournalResult{}, ErrAgentRunJournalState
	}
	var step AgentRunStep
	err = tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard}).Where("run_id = ? AND step_key = ? AND attempt = ?", run.ID, intent.StepKey, 1).Take(&step).Error
	if err == nil {
		if step.TeamID != run.TeamID || step.WorkspaceID != run.WorkspaceID || step.Kind != intent.Kind || step.TargetRefJSON != intent.TargetRefJSON ||
			step.SideEffectPolicy != intent.SideEffectPolicy || step.RetryPolicyJSON != intent.RetryPolicyJSON ||
			!agentJournalPointerEqual(step.ParentStepID, intent.ParentStepID) || !agentJournalPointerEqual(step.InputJSON, intent.InputJSON) || !agentJournalPointerEqual(step.InputHash, intent.InputHash) {
			return agenttypes.AgentRunJournalResult{}, ErrAgentRunJournalConflict
		}
		payload, _ := common.Marshal(map[string]any{"schema_version": 1, "run_id": strconv.FormatInt(run.ID, 10), "step_id": strconv.FormatInt(step.ID, 10), "status": AgentRunStepStatusPending})
		old, err := agentRunJournalReplay(tx, run, eventKey, "step.created", &step.ID, string(payload), AgentOutboxKindRunEvent)
		if old == nil && err == nil {
			err = ErrAgentRunJournalConflict
		}
		if old != nil {
			return *old, err
		}
		return agenttypes.AgentRunJournalResult{}, err
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return agenttypes.AgentRunJournalResult{}, err
	}
	if run.MaxSteps < 1 || run.MaxSteps > 64 || run.StepCount < 0 || run.StepCount >= run.MaxSteps || run.Revision >= agenttypes.MaxSafeInteger || run.LastEventSeq >= agenttypes.MaxSafeInteger {
		return agenttypes.AgentRunJournalResult{}, ErrAgentRunJournalState
	}
	step = AgentRunStep{TeamID: run.TeamID, WorkspaceID: run.WorkspaceID, RunID: run.ID, StepKey: intent.StepKey,
		ParentStepID: intent.ParentStepID, Attempt: 1, Kind: intent.Kind, Status: AgentRunStepStatusPending, LeaseEpoch: run.LeaseEpoch,
		InputJSON: intent.InputJSON, InputHash: intent.InputHash, TargetRefJSON: intent.TargetRefJSON, SideEffectPolicy: intent.SideEffectPolicy, RetryPolicyJSON: intent.RetryPolicyJSON}
	if err := tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard}).Create(&step).Error; err != nil {
		return agenttypes.AgentRunJournalResult{}, err
	}
	payload, _ := common.Marshal(map[string]any{"schema_version": 1, "run_id": strconv.FormatInt(run.ID, 10), "step_id": strconv.FormatInt(step.ID, 10), "status": AgentRunStepStatusPending})
	return appendAgentRunJournal(tx, run, eventKey, "step.created", &step.ID, string(payload), AgentOutboxKindRunEvent, true)
}

// AppendAgentRunReferenceEvent accepts an open event-type vocabulary but builds
// a reference-only payload from durable facts. No caller JSON, prompt, result,
// credential or purported new status can enter this producer.
func AppendAgentRunReferenceEvent(tx *gorm.DB, fence agenttypes.AgentRunJournalFence, eventKey, eventType string, stepID *int64) (agenttypes.AgentRunJournalResult, error) {
	if !agentDigestValid(eventKey) || eventType == "run.queued" || eventType == "step.created" {
		return agenttypes.AgentRunJournalResult{}, ErrAgentRunJournalInvalid
	}
	run, err := lockAgentRunJournal(tx, fence.Scope)
	if err != nil {
		return agenttypes.AgentRunJournalResult{}, err
	}
	if !agentRunJournalFenceValid(run, fence, time.Now().UnixMilli()) {
		return agenttypes.AgentRunJournalResult{}, ErrAgentRunJournalState
	}
	payload := map[string]any{"schema_version": 1, "run_id": strconv.FormatInt(run.ID, 10), "status": run.Status}
	if stepID != nil {
		var step AgentRunStep
		if err := tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard}).Where("id = ? AND run_id = ? AND team_id = ? AND workspace_id = ?", *stepID, run.ID, run.TeamID, run.WorkspaceID).Take(&step).Error; err != nil {
			return agenttypes.AgentRunJournalResult{}, err
		}
		payload["step_id"], payload["step_status"] = strconv.FormatInt(step.ID, 10), step.Status
	}
	encoded, _ := common.Marshal(payload)
	if old, err := agentRunJournalReplay(tx, run, eventKey, eventType, stepID, string(encoded), AgentOutboxKindRunEvent); err != nil || old != nil {
		if old != nil {
			return *old, err
		}
		return agenttypes.AgentRunJournalResult{}, err
	}
	return appendAgentRunJournal(tx, run, eventKey, eventType, stepID, string(encoded), AgentOutboxKindRunEvent, false)
}

func agentJournalPointerEqual[T comparable](a, b *T) bool {
	return a == nil && b == nil || a != nil && b != nil && *a == *b
}

func agentRunJournalReplay(tx *gorm.DB, run *AgentRun, key, eventType string, stepID *int64, payload, kind string) (*agenttypes.AgentRunJournalResult, error) {
	var event AgentRunEvent
	err := tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard}).Where("run_id = ? AND event_key = ?", run.ID, key).Take(&event).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if event.TeamID != run.TeamID || event.WorkspaceID != run.WorkspaceID || event.EventType != eventType || !agentJournalPointerEqual(event.StepID, stepID) || event.PayloadJSON != payload || event.Visibility != AgentRunEventVisibilityUser || event.PayloadSchemaVersion != 1 || event.Seq > run.LastEventSeq {
		return nil, ErrAgentRunJournalConflict
	}
	notice, err := EnqueueAgentRunNotification(tx, &event, kind)
	if err != nil {
		return nil, err
	}
	result := agenttypes.AgentRunJournalResult{RunID: run.ID, RunRevision: run.Revision, EventID: event.ID, EventSeq: event.Seq, OutboxID: notice.ID, Replayed: true}
	if stepID != nil {
		result.StepID = *stepID
	}
	return &result, nil
}

func appendAgentRunJournal(tx *gorm.DB, run *AgentRun, key, eventType string, stepID *int64, payload, kind string, addStep bool) (agenttypes.AgentRunJournalResult, error) {
	if run.Revision >= agenttypes.MaxSafeInteger || run.LastEventSeq >= agenttypes.MaxSafeInteger {
		return agenttypes.AgentRunJournalResult{}, ErrAgentRunJournalState
	}
	event := AgentRunEvent{TeamID: run.TeamID, WorkspaceID: run.WorkspaceID, RunID: run.ID, Seq: run.LastEventSeq + 1, EventKey: key, StepID: stepID, EventType: eventType, PayloadJSON: payload, PayloadSchemaVersion: 1, Visibility: AgentRunEventVisibilityUser}
	if err := tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard}).Create(&event).Error; err != nil {
		return agenttypes.AgentRunJournalResult{}, err
	}
	updates := map[string]any{"last_event_seq": event.Seq, "revision": run.Revision + 1, "updated_at": time.Now().UnixMilli()}
	if addStep {
		updates["step_count"] = run.StepCount + 1
	}
	query := tx.Session(&gorm.Session{NewDB: true, SkipHooks: true, Logger: logger.Discard}).Model(&AgentRun{}).Where("id = ? AND team_id = ? AND workspace_id = ? AND revision = ? AND last_event_seq = ? AND status = ? AND lease_epoch = ?", run.ID, run.TeamID, run.WorkspaceID, run.Revision, run.LastEventSeq, run.Status, run.LeaseEpoch)
	if run.LeaseOwner != nil {
		now := time.Now().UnixMilli()
		query = query.Where(agentWorkspaceExactColumn(tx, "lease_owner")+" = ? AND lease_expires_at > ? AND deadline_at > ? AND cancel_requested_at IS NULL", *run.LeaseOwner, now, now)
	}
	changed := query.Updates(updates)
	if changed.Error != nil {
		return agenttypes.AgentRunJournalResult{}, changed.Error
	}
	if changed.RowsAffected != 1 {
		return agenttypes.AgentRunJournalResult{}, ErrAgentRunJournalConflict
	}
	notice, err := EnqueueAgentRunNotification(tx, &event, kind)
	if err != nil {
		return agenttypes.AgentRunJournalResult{}, err
	}
	result := agenttypes.AgentRunJournalResult{RunID: run.ID, RunRevision: run.Revision + 1, EventID: event.ID, EventSeq: event.Seq, OutboxID: notice.ID}
	if stepID != nil {
		result.StepID = *stepID
	}
	return result, nil
}
