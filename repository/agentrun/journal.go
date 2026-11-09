package agentrun

import (
	"context"
	"errors"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/agentrun/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// JournalRepository supplies internal transaction primitives only. A future
// host must authenticate workers and perform live admission before using it.
// There is deliberately no HTTP route, scheduler registration or Run claim.
type JournalRepository struct{ db *gorm.DB }

func NewJournalRepository(db *gorm.DB) *JournalRepository { return &JournalRepository{db: db} }

var _ application.JournalRepository = (*JournalRepository)(nil)
var _ application.RunNotificationRepository = (*JournalRepository)(nil)

func (repo *JournalRepository) withJournal(ctx context.Context, apply func(*gorm.DB) (agenttypes.AgentRunJournalResult, error)) (agenttypes.AgentRunJournalResult, error) {
	var result agenttypes.AgentRunJournalResult
	if repo == nil || repo.db == nil || ctx == nil {
		return result, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	err := model.WithAgentRunJournal(repo.db.Session(&gorm.Session{Context: ctx, Logger: logger.Discard}), func(tx *gorm.DB) error {
		var err error
		result, err = apply(tx)
		return err
	})
	if err != nil {
		return agenttypes.AgentRunJournalResult{}, journalError(err)
	}
	return result, nil
}

func (repo *JournalRepository) InitializeQueued(ctx context.Context, scope agenttypes.AgentRunJournalScope, revision int64, key string) (agenttypes.AgentRunJournalResult, error) {
	return repo.withJournal(ctx, func(tx *gorm.DB) (agenttypes.AgentRunJournalResult, error) {
		return model.InitializeAgentRunJournal(tx, scope, revision, key)
	})
}

func (repo *JournalRepository) EnsurePendingStep(ctx context.Context, fence agenttypes.AgentRunJournalFence, intent agenttypes.AgentRunPendingStepIntent, key string) (agenttypes.AgentRunJournalResult, error) {
	return repo.withJournal(ctx, func(tx *gorm.DB) (agenttypes.AgentRunJournalResult, error) {
		return model.EnsureAgentRunPendingStep(tx, fence, intent, key)
	})
}

func (repo *JournalRepository) AppendReferenceEvent(ctx context.Context, fence agenttypes.AgentRunJournalFence, key, eventType string, stepID *int64) (agenttypes.AgentRunJournalResult, error) {
	return repo.withJournal(ctx, func(tx *gorm.DB) (agenttypes.AgentRunJournalResult, error) {
		return model.AppendAgentRunReferenceEvent(tx, fence, key, eventType, stepID)
	})
}

// SQL errors remain private; none of the typed error messages include input,
// event JSON, lease owners or the database driver's error text.
func journalError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, gorm.ErrRecordNotFound):
		return agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	case errors.Is(err, model.ErrAgentRunJournalConflict), errors.Is(err, model.ErrAgentRunNotificationConflict), model.AgentUniqueConstraint(err):
		return agenttypes.NewError(agenttypes.IdempotencyConflict, nil)
	case errors.Is(err, model.ErrAgentRunJournalState):
		return agenttypes.NewError(agenttypes.InvalidState, nil)
	case errors.Is(err, model.ErrAgentRunJournalInvalid), errors.Is(err, model.ErrAgentRunStepInvalid), errors.Is(err, model.ErrAgentRunEventInvalid), errors.Is(err, model.ErrAgentRunNotificationInvalid):
		return agenttypes.NewError(agenttypes.InvalidArgument, nil)
	case errors.Is(err, model.ErrAgentRunStepReference), errors.Is(err, model.ErrAgentRunEventReference):
		return agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	default:
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
}

func (repo *JournalRepository) ClaimNotification(ctx context.Context, owner string, leaseMS int64) (*application.ClaimedWakeup, error) {
	if repo == nil || repo.db == nil || ctx == nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	row, err := model.ClaimAgentRunNotification(ctx, repo.db, owner, leaseMS)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, journalError(err)
	}
	var refs model.AgentRunNotification
	if err := common.UnmarshalJsonStr(row.PayloadJSON, &refs); err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	runID, runErr := strconv.ParseInt(refs.RunID, 10, 64)
	eventID, eventErr := strconv.ParseInt(refs.EventID, 10, 64)
	if runErr != nil || eventErr != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	wake := agenttypes.AgentRunWakeup{Scope: agenttypes.AgentRunJournalScope{TeamID: row.TeamID, WorkspaceID: row.WorkspaceID, RunID: runID}, EventID: eventID, EventSeq: refs.EventSeq, Kind: row.Kind}
	if refs.StepID != nil {
		wake.StepID, err = strconv.ParseInt(*refs.StepID, 10, 64)
		if err != nil {
			return nil, agenttypes.NewError(agenttypes.InternalError, nil)
		}
	}
	return &application.ClaimedWakeup{Wakeup: wake, Receipt: *row}, nil
}

func (repo *JournalRepository) AckNotification(ctx context.Context, claimed *application.ClaimedWakeup) error {
	if repo == nil || repo.db == nil || ctx == nil || claimed == nil {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	row, ok := claimed.Receipt.(model.AgentOutbox)
	if !ok {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return journalError(model.AckAgentRunNotification(ctx, repo.db, &row))
}

func (repo *JournalRepository) RetryNotification(ctx context.Context, claimed *application.ClaimedWakeup) error {
	if repo == nil || repo.db == nil || ctx == nil || claimed == nil {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	row, ok := claimed.Receipt.(model.AgentOutbox)
	if !ok {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return journalError(model.RetryAgentRunNotification(ctx, repo.db, &row))
}
