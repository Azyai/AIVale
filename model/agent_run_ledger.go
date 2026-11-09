package model

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"slices"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	ErrAgentRunLedgerInvalid  = errors.New("invalid model call ledger operation")
	ErrAgentRunLedgerState    = errors.New("model call ledger state does not permit operation")
	ErrAgentRunLedgerConflict = errors.New("model call ledger intent conflicts")
	ErrAgentRunLedgerBudget   = errors.New("model call ledger budget exhausted")
)

func agentLedgerIdentityMatches(run *AgentRun, identity agenttypes.ModelCallIdentity) bool {
	return run.ID == identity.RunID && run.TeamID == identity.TeamID && run.WorkspaceID == identity.WorkspaceID &&
		run.AgentID == identity.AgentID && run.AgentVersionID == identity.AgentVersionID && run.CreatedBy == identity.ExecutionUserID &&
		run.FundingTokenID == identity.FundingTokenID && agentJournalPointerEqual(run.CallerTokenID, identity.CallerTokenID)
}

func lockAgentRunLedger(tx *gorm.DB, identity agenttypes.ModelCallIdentity) (*AgentRun, *AgentRunStep, error) {
	if err := agenttypes.ValidateModelCallIdentity(identity); err != nil || identity.Attempt != 1 {
		return nil, nil, ErrAgentRunLedgerInvalid
	}
	run, err := lockAgentRunJournal(tx, agenttypes.AgentRunJournalScope{TeamID: identity.TeamID, WorkspaceID: identity.WorkspaceID, RunID: identity.RunID})
	if err != nil {
		return nil, nil, err
	}
	if !agentLedgerIdentityMatches(run, identity) {
		return nil, nil, ErrAgentRunLedgerConflict
	}
	var step AgentRunStep
	err = lockForUpdate(tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard})).Where("id = ? AND run_id = ? AND team_id = ? AND workspace_id = ?", identity.StepID, run.ID, run.TeamID, run.WorkspaceID).Take(&step).Error
	if err != nil {
		return nil, nil, err
	}
	if step.Kind != AgentRunStepKindModel || step.Attempt != 1 {
		return nil, nil, ErrAgentRunLedgerState
	}
	return run, &step, nil
}

func agentLedgerFenceValid(run *AgentRun, owner string, epoch int64, finishing bool, now int64) bool {
	if run.LeaseEpoch != epoch || epoch < 1 || run.LeaseOwner == nil || *run.LeaseOwner != owner || owner == "" ||
		run.LeaseExpiresAt == nil || *run.LeaseExpiresAt <= now || run.LastEventSeq < 1 {
		return false
	}
	if finishing {
		return run.Status == AgentRunStatusRunning || run.Status == AgentRunStatusCancelling
	}
	return run.Status == AgentRunStatusRunning && run.CancelRequestedAt == nil && run.DeadlineAt > now
}

// ReserveAgentModelCall joins a caller-owned transaction. The supplied intent
// must come from a trusted admission/price adapter; this foundation does not
// authenticate workers, prove a price bound or authorize an external dispatch.
func ReserveAgentModelCall(tx *gorm.DB, intent agenttypes.ModelCallReservationIntent) (agenttypes.ModelCallLedgerResult, error) {
	var empty agenttypes.ModelCallLedgerResult
	if !agentDigestValid(intent.EventKey) || !agentDigestValid(intent.ConfigHash) || !agentDigestValid(intent.PricingSnapshotHash) ||
		intent.ExpectedRunRevision < 1 || intent.ExpectedRunRevision >= agenttypes.MaxSafeInteger || intent.UpperBoundQuota < 0 || intent.UpperBoundQuota > common.MaxQuota {
		return empty, ErrAgentRunLedgerInvalid
	}
	run, step, err := lockAgentRunLedger(tx, intent.Identity)
	if err != nil {
		return empty, err
	}
	encoded, err := common.Marshal(map[string]any{"schema_version": 1, "config_hash": intent.ConfigHash, "pricing_snapshot_hash": intent.PricingSnapshotHash, "request_hash": intent.Identity.RequestHash,
		"model_name": intent.ModelName, "upper_bound_quota": strconv.FormatInt(intent.UpperBoundQuota, 10), "max_output_tokens": strconv.FormatUint(intent.MaxOutputTokens, 10),
		"execution_budget_ms": intent.ExecutionBudgetMS, "quote_expires_at": intent.QuoteExpiresAt, "valid_until": intent.ValidUntil,
		"max_cost_quota": strconv.FormatInt(intent.Limits.MaxCostQuota, 10), "max_model_calls": intent.Limits.MaxModelCalls, "max_tool_calls": intent.Limits.MaxToolCalls, "max_steps": intent.Limits.MaxSteps,
		"effective_max_output_tokens": strconv.FormatUint(intent.Limits.MaxOutputTokens, 10), "effective_execution_budget_ms": intent.Limits.ExecutionBudgetMS})
	if err != nil {
		return empty, err
	}
	var call AgentGatewayCall
	err = tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard}).Where("team_id = ? AND workspace_id = ? AND run_id = ? AND "+agentWorkspaceExactColumn(tx, "logical_call_id")+" = ? AND attempt = ?", run.TeamID, run.WorkspaceID, run.ID, intent.Identity.LogicalCallID, 1).Take(&call).Error
	if err == nil {
		if !agentLedgerCallMatches(&call, intent.Identity) || call.ModelName != intent.ModelName || step.LogicalCallID == nil || *step.LogicalCallID != call.LogicalCallID {
			return empty, ErrAgentRunLedgerConflict
		}
		reservation, err := lockAgentLedgerReservation(tx, &call)
		if err != nil {
			return empty, err
		}
		if reservation.EstimateSnapshotJSON != string(encoded) || reservation.EstimatedQuota != intent.UpperBoundQuota {
			return empty, ErrAgentRunLedgerConflict
		}
		return replayAgentLedgerEvent(tx, run, step, &call, reservation, intent.EventKey, "model_call.reserved")
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return empty, err
	}
	now := time.Now().UnixMilli()
	if !agentLedgerFenceValid(run, intent.LeaseOwner, intent.Identity.LeaseEpoch, false, now) || run.Revision != intent.ExpectedRunRevision || step.LeaseEpoch != run.LeaseEpoch ||
		step.Status != AgentRunStepStatusPending || step.LogicalCallID != nil || run.RequiresReconcile != 0 || (run.UsageState != "pending" && run.UsageState != "partial") || run.ToolCallCount != 0 {
		return empty, ErrAgentRunLedgerState
	}
	limits := intent.Limits
	if run.BudgetLimitQuota < 1 || run.BudgetLimitQuota > common.MaxQuota || run.MaxSteps < 1 || run.MaxSteps > 64 || run.ExecutionBudgetMS < 1 || run.ExecutionBudgetMS > 300000 || run.MaxModelCalls != 1 || run.MaxToolCalls != 0 ||
		limits.MaxCostQuota < 1 || limits.MaxCostQuota > common.MaxQuota || limits.MaxCostQuota > run.BudgetLimitQuota || limits.MaxModelCalls != 1 || limits.MaxModelCalls > int64(run.MaxModelCalls) || limits.MaxToolCalls != 0 ||
		limits.MaxSteps < 1 || limits.MaxSteps > int64(run.MaxSteps) || limits.MaxOutputTokens == 0 || intent.MaxOutputTokens == 0 || intent.MaxOutputTokens > limits.MaxOutputTokens ||
		limits.ExecutionBudgetMS < 1 || limits.ExecutionBudgetMS > run.ExecutionBudgetMS || intent.ExecutionBudgetMS < 1 || intent.ExecutionBudgetMS > limits.ExecutionBudgetMS ||
		intent.QuoteExpiresAt <= now || intent.QuoteExpiresAt > agenttypes.MaxSafeInteger || intent.ValidUntil <= now || intent.ValidUntil > min(intent.QuoteExpiresAt, run.DeadlineAt, *run.LeaseExpiresAt) ||
		run.ActiveElapsedMS < 0 || run.ActiveStartedAt == nil || *run.ActiveStartedAt < 1 || *run.ActiveStartedAt > now || run.ActiveElapsedMS >= limits.ExecutionBudgetMS || now-*run.ActiveStartedAt >= limits.ExecutionBudgetMS-run.ActiveElapsedMS {
		return empty, ErrAgentRunLedgerInvalid
	}
	if run.BudgetConsumedQuota < 0 || run.BudgetReservedQuota < 0 || run.ModelCallCount < 0 || run.StepCount < 1 || run.StepCount > run.MaxSteps || run.BudgetConsumedQuota > limits.MaxCostQuota ||
		run.BudgetReservedQuota > limits.MaxCostQuota-run.BudgetConsumedQuota || run.ModelCallCount >= run.MaxModelCalls || int64(run.ModelCallCount) >= limits.MaxModelCalls || int64(run.StepCount) > limits.MaxSteps {
		return empty, ErrAgentRunLedgerBudget
	}
	remaining := limits.MaxCostQuota - run.BudgetConsumedQuota - run.BudgetReservedQuota
	if remaining == 0 || intent.UpperBoundQuota > remaining {
		return empty, ErrAgentRunLedgerBudget
	}
	var version AgentVersion
	if err := tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard}).Where("id = ? AND team_id = ? AND workspace_id = ? AND agent_id = ?", run.AgentVersionID, run.TeamID, run.WorkspaceID, run.AgentID).Take(&version).Error; err != nil {
		return empty, err
	}
	var config agenttypes.AgentConfig
	digest := sha256.Sum256([]byte(version.ConfigJSON))
	_, objectErr := common.UnmarshalJSONObjectStrict([]byte(version.ConfigJSON))
	if objectErr != nil || hex.EncodeToString(digest[:]) != version.ConfigHash || version.ConfigHash != intent.ConfigHash || version.VersionKind != AgentVersionKindRelease || version.RevokedAt != nil || common.UnmarshalJsonStr(version.ConfigJSON, &config) != nil ||
		config.ModelPolicy.Model != intent.ModelName || limits.MaxOutputTokens > uint64(config.ModelPolicy.MaxOutputTokens) || config.Limits.TimeoutSeconds < 1 || config.Limits.TimeoutSeconds > 300 ||
		limits.ExecutionBudgetMS > config.Limits.TimeoutSeconds*1000 || limits.MaxSteps > config.Limits.MaxSteps || limits.MaxModelCalls > config.Limits.MaxModelCalls || limits.MaxToolCalls > config.Limits.MaxToolCalls {
		return empty, ErrAgentRunLedgerState
	}
	versionQuota, quotaErr := strconv.ParseInt(config.Limits.MaxCostQuota, 10, 64)
	if quotaErr != nil || versionQuota < 1 || versionQuota > common.MaxQuota || limits.MaxCostQuota > versionQuota {
		return empty, ErrAgentRunLedgerState
	}
	call = AgentGatewayCall{TeamID: run.TeamID, WorkspaceID: run.WorkspaceID, RunID: run.ID, StepID: step.ID, LogicalCallID: intent.Identity.LogicalCallID, Attempt: 1,
		GatewayRequestID: intent.Identity.GatewayRequestID, FundingTokenID: run.FundingTokenID, LeaseEpoch: run.LeaseEpoch, RequestHash: intent.Identity.RequestHash, ModelName: intent.ModelName,
		State: AgentGatewayCallStatePrepared, FundingState: AgentGatewayCallCommitStatePending, TokenState: AgentGatewayCallCommitStatePending, ReconcileStatus: AgentGatewayCallReconcilePending}
	if err := tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard}).Create(&call).Error; err != nil {
		return empty, err
	}
	reservation := AgentBudgetReservation{TeamID: run.TeamID, WorkspaceID: run.WorkspaceID, RunID: run.ID, StepID: step.ID, LogicalCallID: call.LogicalCallID, Attempt: 1,
		CostKind: AgentBudgetReservationCostKindModel, EstimatedQuota: intent.UpperBoundQuota, Status: AgentBudgetReservationStatusReserved, EstimateSnapshotJSON: string(encoded), ExpiresAt: intent.ValidUntil}
	if err := tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard}).Create(&reservation).Error; err != nil {
		return empty, err
	}
	if err := updateAgentLedgerStep(tx, step, map[string]any{"logical_call_id": call.LogicalCallID}); err != nil {
		return empty, err
	}
	return appendAgentLedgerEvent(tx, run, step, &call, &reservation, intent.EventKey, "model_call.reserved", intent.LeaseOwner, false, intent.ValidUntil,
		map[string]any{"budget_reserved_quota": run.BudgetReservedQuota + intent.UpperBoundQuota, "model_call_count": run.ModelCallCount + 1})
}

func agentLedgerCallMatches(call *AgentGatewayCall, identity agenttypes.ModelCallIdentity) bool {
	return call.TeamID == identity.TeamID && call.WorkspaceID == identity.WorkspaceID && call.RunID == identity.RunID && call.StepID == identity.StepID &&
		call.LogicalCallID == identity.LogicalCallID && int64(call.Attempt) == identity.Attempt && call.GatewayRequestID == identity.GatewayRequestID &&
		call.FundingTokenID == identity.FundingTokenID && call.LeaseEpoch == identity.LeaseEpoch && call.RequestHash == identity.RequestHash
}

func lockAgentLedgerReservation(tx *gorm.DB, call *AgentGatewayCall) (*AgentBudgetReservation, error) {
	var reservation AgentBudgetReservation
	err := lockForUpdate(tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard})).Where("run_id = ? AND step_id = ? AND team_id = ? AND workspace_id = ? AND "+agentWorkspaceExactColumn(tx, "logical_call_id")+" = ? AND attempt = ? AND "+agentWorkspaceExactColumn(tx, "cost_kind")+" = ?",
		call.RunID, call.StepID, call.TeamID, call.WorkspaceID, call.LogicalCallID, call.Attempt, AgentBudgetReservationCostKindModel).Take(&reservation).Error
	return &reservation, err
}

// MarkAgentModelCallDispatched records intent before a future broker may send.
// T02 has no transport registration or real model request.
func MarkAgentModelCallDispatched(tx *gorm.DB, cmd agenttypes.ModelCallLedgerCommand) (agenttypes.ModelCallLedgerResult, error) {
	return transitionAgentModelCall(tx, cmd, "dispatch")
}
func ReleaseAgentModelCallUnissued(tx *gorm.DB, cmd agenttypes.ModelCallLedgerCommand) (agenttypes.ModelCallLedgerResult, error) {
	return transitionAgentModelCall(tx, cmd, "release")
}
func MarkAgentModelCallOutcomeUnknown(tx *gorm.DB, cmd agenttypes.ModelCallLedgerCommand) (agenttypes.ModelCallLedgerResult, error) {
	return transitionAgentModelCall(tx, cmd, "unknown")
}

func transitionAgentModelCall(tx *gorm.DB, cmd agenttypes.ModelCallLedgerCommand, operation string) (agenttypes.ModelCallLedgerResult, error) {
	var empty agenttypes.ModelCallLedgerResult
	if !agentDigestValid(cmd.EventKey) {
		return empty, ErrAgentRunLedgerInvalid
	}
	run, step, err := lockAgentRunLedger(tx, cmd.Identity)
	if err != nil {
		return empty, err
	}
	var call AgentGatewayCall
	err = lockForUpdate(tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard})).Where("team_id = ? AND workspace_id = ? AND run_id = ? AND step_id = ? AND "+agentWorkspaceExactColumn(tx, "logical_call_id")+" = ? AND attempt = ?", run.TeamID, run.WorkspaceID, run.ID, step.ID, cmd.Identity.LogicalCallID, 1).Take(&call).Error
	if err != nil {
		return empty, err
	}
	if !agentLedgerCallMatches(&call, cmd.Identity) || step.LogicalCallID == nil || *step.LogicalCallID != call.LogicalCallID {
		return empty, ErrAgentRunLedgerConflict
	}
	reservation, err := lockAgentLedgerReservation(tx, &call)
	if err != nil {
		return empty, err
	}
	eventType := map[string]string{"dispatch": "model_call.dispatched", "release": "model_call.released", "unknown": "model_call.outcome_unknown"}[operation]
	var previous AgentRunEvent
	err = tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard}).Where("run_id = ? AND event_key = ?", run.ID, cmd.EventKey).Take(&previous).Error
	if err == nil {
		return replayAgentLedgerEvent(tx, run, step, &call, reservation, cmd.EventKey, eventType)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return empty, err
	}
	now := time.Now().UnixMilli()
	finishing := operation != "dispatch"
	if !agentLedgerFenceValid(run, cmd.LeaseOwner, cmd.Identity.LeaseEpoch, finishing, now) || reservation.Status != AgentBudgetReservationStatusReserved ||
		reservation.EstimatedQuota < 0 || reservation.EstimatedQuota > common.MaxQuota || reservation.SettledQuota != nil || reservation.SettledAt != nil || reservation.ReleasedAt != nil ||
		run.BudgetReservedQuota < reservation.EstimatedQuota || run.BudgetReservedQuota > common.MaxQuota || run.BudgetConsumedQuota < 0 || step.LeaseEpoch != run.LeaseEpoch {
		return empty, ErrAgentRunLedgerState
	}
	callUpdates, reservationUpdates, stepUpdates, runUpdates := map[string]any{}, map[string]any{}, map[string]any{}, map[string]any{}
	validUntil := int64(0)
	switch operation {
	case "dispatch":
		if !agentLedgerPreparedUnobserved(&call) || step.Status != AgentRunStepStatusPending || reservation.ExpiresAt <= now ||
			run.ExecutionBudgetMS < 1 || run.ExecutionBudgetMS > 300000 || run.ActiveElapsedMS < 0 || run.ActiveElapsedMS >= run.ExecutionBudgetMS || run.ActiveStartedAt == nil || *run.ActiveStartedAt < 1 || *run.ActiveStartedAt > now || now-*run.ActiveStartedAt >= run.ExecutionBudgetMS-run.ActiveElapsedMS {
			return empty, ErrAgentRunLedgerState
		}
		var estimate struct {
			EffectiveMS int64 `json:"effective_execution_budget_ms"`
			RequestMS   int64 `json:"execution_budget_ms"`
		}
		if common.UnmarshalJsonStr(reservation.EstimateSnapshotJSON, &estimate) != nil || estimate.EffectiveMS < 1 || estimate.EffectiveMS > run.ExecutionBudgetMS || estimate.RequestMS < 1 || estimate.RequestMS > estimate.EffectiveMS ||
			run.ActiveElapsedMS >= estimate.EffectiveMS || now-*run.ActiveStartedAt >= estimate.EffectiveMS-run.ActiveElapsedMS || reservation.CreatedAt < 1 || reservation.CreatedAt > now || now-reservation.CreatedAt >= estimate.RequestMS {
			return empty, ErrAgentRunLedgerState
		}
		validUntil = min(reservation.ExpiresAt, reservation.CreatedAt+estimate.RequestMS, *run.ActiveStartedAt+estimate.EffectiveMS-run.ActiveElapsedMS)
		callUpdates["state"], callUpdates["dispatched_at"] = AgentGatewayCallStateDispatched, now
		stepUpdates["status"], stepUpdates["started_at"] = AgentRunStepStatusRunning, now
	case "release":
		if !agentLedgerPreparedUnobserved(&call) || step.Status != AgentRunStepStatusPending {
			return empty, ErrAgentRunLedgerState
		}
		callUpdates["state"] = AgentGatewayCallStateRejected
		reservationUpdates["status"], reservationUpdates["released_at"] = AgentBudgetReservationStatusReleased, now
		stepUpdates["status"], stepUpdates["finished_at"], stepUpdates["error_code"] = AgentRunStepStatusFailed, now, "MODEL_CALL_NOT_DISPATCHED"
		runUpdates["budget_reserved_quota"] = run.BudgetReservedQuota - reservation.EstimatedQuota
	case "unknown":
		if call.State != AgentGatewayCallStateDispatched || call.DispatchedAt == nil || call.ActualQuota != nil || call.SettledAt != nil || step.Status != AgentRunStepStatusRunning ||
			!slices.Contains([]string{AgentGatewayCallCommitStatePending, AgentGatewayCallCommitStateUnknown, AgentGatewayCallCommitStateApplied, AgentGatewayCallCommitStateRefunded}, call.FundingState) ||
			!slices.Contains([]string{AgentGatewayCallCommitStatePending, AgentGatewayCallCommitStateUnknown, AgentGatewayCallCommitStateApplied, AgentGatewayCallCommitStateRefunded}, call.TokenState) {
			return empty, ErrAgentRunLedgerState
		}
		callUpdates["state"], callUpdates["reconcile_status"] = AgentGatewayCallStateOutcomeUnknown, AgentGatewayCallReconcileManualRequired
		if call.FundingState == AgentGatewayCallCommitStatePending {
			callUpdates["funding_state"] = AgentGatewayCallCommitStateUnknown
		}
		if call.TokenState == AgentGatewayCallCommitStatePending {
			callUpdates["token_state"] = AgentGatewayCallCommitStateUnknown
		}
		reservationUpdates["status"] = AgentBudgetReservationStatusOutcomeUnknown
		stepUpdates["status"], stepUpdates["finished_at"], stepUpdates["error_code"] = AgentRunStepStatusOutcomeUnknown, now, "CALL_OUTCOME_UNKNOWN"
		elapsed := run.ActiveElapsedMS
		if elapsed < 0 || elapsed > agenttypes.MaxSafeInteger || run.ActiveStartedAt == nil || *run.ActiveStartedAt < 1 || *run.ActiveStartedAt > now || now-*run.ActiveStartedAt > agenttypes.MaxSafeInteger-elapsed {
			return empty, ErrAgentRunLedgerInvalid
		}
		elapsed += now - *run.ActiveStartedAt
		runUpdates = map[string]any{"status": AgentRunStatusFailed, "error_code": "CALL_OUTCOME_UNKNOWN", "usage_state": "reconciliation_required", "requires_reconcile": 1,
			"finished_at": now, "active_elapsed_ms": elapsed, "active_started_at": nil, "lease_owner": nil, "lease_expires_at": nil, "heartbeat_at": nil}
	default:
		return empty, ErrAgentRunLedgerInvalid
	}
	if call.Revision < 1 || call.Revision >= agenttypes.MaxSafeInteger || reservation.Revision < 1 || reservation.Revision >= agenttypes.MaxSafeInteger {
		return empty, ErrAgentRunLedgerState
	}
	callUpdates["revision"], callUpdates["updated_at"] = call.Revision+1, now
	changed := tx.Session(&gorm.Session{NewDB: true, SkipHooks: true, Logger: logger.Discard}).Model(&AgentGatewayCall{}).Where("id = ? AND team_id = ? AND workspace_id = ? AND run_id = ? AND step_id = ? AND revision = ? AND "+agentWorkspaceExactColumn(tx, "state")+" = ?", call.ID, run.TeamID, run.WorkspaceID, run.ID, step.ID, call.Revision, call.State).Updates(callUpdates)
	if changed.Error != nil {
		return empty, changed.Error
	}
	if changed.RowsAffected != 1 {
		return empty, ErrAgentRunLedgerConflict
	}
	if len(reservationUpdates) > 0 {
		reservationUpdates["revision"], reservationUpdates["updated_at"] = reservation.Revision+1, now
		changed = tx.Session(&gorm.Session{NewDB: true, SkipHooks: true, Logger: logger.Discard}).Model(&AgentBudgetReservation{}).Where("id = ? AND team_id = ? AND workspace_id = ? AND run_id = ? AND revision = ? AND status = ?", reservation.ID, run.TeamID, run.WorkspaceID, run.ID, reservation.Revision, reservation.Status).Updates(reservationUpdates)
		if changed.Error != nil {
			return empty, changed.Error
		}
		if changed.RowsAffected != 1 {
			return empty, ErrAgentRunLedgerConflict
		}
	}
	if err := updateAgentLedgerStep(tx, step, stepUpdates); err != nil {
		return empty, err
	}
	call.State = callUpdates["state"].(string)
	if status, ok := reservationUpdates["status"].(string); ok {
		reservation.Status = status
	}
	return appendAgentLedgerEvent(tx, run, step, &call, reservation, cmd.EventKey, eventType, cmd.LeaseOwner, finishing, validUntil, runUpdates)
}

func agentLedgerPreparedUnobserved(call *AgentGatewayCall) bool {
	return call.State == AgentGatewayCallStatePrepared && call.DispatchedAt == nil && call.RespondedAt == nil && call.SettledAt == nil && call.PreconsumeQuota == nil && call.ActualQuota == nil &&
		call.ChannelID == nil && call.UpstreamRequestID == nil && call.ConsumeLogID == nil && call.FundingState == AgentGatewayCallCommitStatePending && call.TokenState == AgentGatewayCallCommitStatePending &&
		call.FundingSource == nil && call.UsageJSON == nil && call.PricingSnapshotJSON == nil && call.ReconcileStatus == AgentGatewayCallReconcilePending && call.ReconciledBy == nil && call.ReconcileNote == nil
}

func updateAgentLedgerStep(tx *gorm.DB, step *AgentRunStep, updates map[string]any) error {
	if step.Revision < 1 || step.Revision >= agenttypes.MaxSafeInteger {
		return ErrAgentRunLedgerState
	}
	updates["revision"], updates["updated_at"] = step.Revision+1, time.Now().UnixMilli()
	changed := tx.Session(&gorm.Session{NewDB: true, SkipHooks: true, Logger: logger.Discard}).Model(&AgentRunStep{}).Where("id = ? AND team_id = ? AND workspace_id = ? AND run_id = ? AND revision = ? AND lease_epoch = ? AND status = ?", step.ID, step.TeamID, step.WorkspaceID, step.RunID, step.Revision, step.LeaseEpoch, step.Status).Updates(updates)
	if changed.Error != nil {
		return changed.Error
	}
	if changed.RowsAffected != 1 {
		return ErrAgentRunLedgerConflict
	}
	step.Revision++
	if status, ok := updates["status"].(string); ok {
		step.Status = status
	}
	return nil
}

func replayAgentLedgerEvent(tx *gorm.DB, run *AgentRun, step *AgentRunStep, call *AgentGatewayCall, reservation *AgentBudgetReservation, key, eventType string) (agenttypes.ModelCallLedgerResult, error) {
	var event AgentRunEvent
	err := tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard}).Where("run_id = ? AND event_key = ?", run.ID, key).Take(&event).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return agenttypes.ModelCallLedgerResult{}, ErrAgentRunLedgerConflict
	}
	if err != nil {
		return agenttypes.ModelCallLedgerResult{}, err
	}
	var refs struct {
		RunID         string `json:"run_id"`
		StepID        string `json:"step_id"`
		GatewayCallID string `json:"gateway_call_id"`
		ReservationID string `json:"reservation_id"`
	}
	if event.TeamID != run.TeamID || event.WorkspaceID != run.WorkspaceID || event.EventType != eventType || event.StepID == nil || *event.StepID != step.ID ||
		common.UnmarshalJsonStr(event.PayloadJSON, &refs) != nil || refs.RunID != strconv.FormatInt(run.ID, 10) || refs.StepID != strconv.FormatInt(step.ID, 10) || refs.GatewayCallID != strconv.FormatInt(call.ID, 10) || refs.ReservationID != strconv.FormatInt(reservation.ID, 10) {
		return agenttypes.ModelCallLedgerResult{}, ErrAgentRunLedgerConflict
	}
	notice, err := EnqueueAgentRunNotification(tx, &event, AgentOutboxKindRunEvent)
	if err != nil {
		return agenttypes.ModelCallLedgerResult{}, err
	}
	return agenttypes.ModelCallLedgerResult{ReservationID: reservation.ID, GatewayCallID: call.ID, StepID: step.ID, RunRevision: run.Revision, EventID: event.ID, EventSeq: event.Seq, OutboxID: notice.ID,
		State: call.State, ReservationState: reservation.Status, ReservedQuota: run.BudgetReservedQuota, Replayed: true}, nil
}

func appendAgentLedgerEvent(tx *gorm.DB, run *AgentRun, step *AgentRunStep, call *AgentGatewayCall, reservation *AgentBudgetReservation, key, eventType, owner string, finishing bool, validUntil int64, updates map[string]any) (agenttypes.ModelCallLedgerResult, error) {
	var empty agenttypes.ModelCallLedgerResult
	now := time.Now().UnixMilli()
	if run.Revision >= agenttypes.MaxSafeInteger || run.LastEventSeq >= agenttypes.MaxSafeInteger || !agentLedgerFenceValid(run, owner, call.LeaseEpoch, finishing, now) {
		return empty, ErrAgentRunLedgerState
	}
	status := run.Status
	if next, ok := updates["status"].(string); ok {
		status = next
	}
	payload, _ := common.Marshal(map[string]any{"schema_version": 1, "run_id": strconv.FormatInt(run.ID, 10), "step_id": strconv.FormatInt(step.ID, 10), "gateway_call_id": strconv.FormatInt(call.ID, 10), "reservation_id": strconv.FormatInt(reservation.ID, 10), "status": status, "step_status": step.Status, "call_state": call.State, "reservation_state": reservation.Status})
	event := AgentRunEvent{TeamID: run.TeamID, WorkspaceID: run.WorkspaceID, RunID: run.ID, Seq: run.LastEventSeq + 1, EventKey: key, StepID: &step.ID, EventType: eventType, PayloadJSON: string(payload), PayloadSchemaVersion: 1, Visibility: AgentRunEventVisibilityUser}
	if err := tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard}).Create(&event).Error; err != nil {
		return empty, err
	}
	now = time.Now().UnixMilli()
	updates["revision"], updates["last_event_seq"], updates["updated_at"] = run.Revision+1, event.Seq, now
	query := tx.Session(&gorm.Session{NewDB: true, SkipHooks: true, Logger: logger.Discard}).Model(&AgentRun{}).Where("id = ? AND team_id = ? AND workspace_id = ? AND revision = ? AND last_event_seq = ? AND status = ? AND lease_epoch = ? AND "+agentWorkspaceExactColumn(tx, "lease_owner")+" = ? AND lease_expires_at > ?", run.ID, run.TeamID, run.WorkspaceID, run.Revision, run.LastEventSeq, run.Status, run.LeaseEpoch, owner, now)
	if !finishing {
		query = query.Where("deadline_at > ? AND cancel_requested_at IS NULL", now)
	}
	if validUntil > 0 {
		query = query.Where("? > ?", validUntil, now)
	}
	changed := query.Updates(updates)
	if changed.Error != nil {
		return empty, changed.Error
	}
	if changed.RowsAffected != 1 {
		return empty, ErrAgentRunLedgerConflict
	}
	notice, err := EnqueueAgentRunNotification(tx, &event, AgentOutboxKindRunEvent)
	if err != nil {
		return empty, err
	}
	reserved := run.BudgetReservedQuota
	if next, ok := updates["budget_reserved_quota"].(int64); ok {
		reserved = next
	}
	return agenttypes.ModelCallLedgerResult{ReservationID: reservation.ID, GatewayCallID: call.ID, StepID: step.ID, RunRevision: run.Revision + 1, EventID: event.ID, EventSeq: event.Seq, OutboxID: notice.ID, State: call.State, ReservationState: reservation.Status, ReservedQuota: reserved}, nil
}
