package agentrun

import (
	"context"
	"errors"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/agentrun/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// LedgerRepository is a trusted internal storage adapter. Public/worker hosts
// must use the application admission port; T02 wires no such host or route.
type LedgerRepository struct{ db *gorm.DB }

func NewLedgerRepository(db *gorm.DB) *LedgerRepository { return &LedgerRepository{db: db} }

var _ application.ModelCallLedgerRepository = (*LedgerRepository)(nil)

func (repo *LedgerRepository) withLedger(ctx context.Context, apply func(*gorm.DB) (agenttypes.ModelCallLedgerResult, error)) (agenttypes.ModelCallLedgerResult, error) {
	var result agenttypes.ModelCallLedgerResult
	if repo == nil || repo.db == nil || ctx == nil {
		return result, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	err := model.WithAgentRunJournal(repo.db.Session(&gorm.Session{Context: ctx, Logger: logger.Discard}), func(tx *gorm.DB) error {
		var err error
		result, err = apply(tx)
		return err
	})
	if err == nil {
		return result, nil
	}
	switch {
	case errors.Is(err, model.ErrAgentRunLedgerInvalid), errors.Is(err, model.ErrAgentBudgetReservationInvalid), errors.Is(err, model.ErrAgentGatewayCallInvalid), errors.Is(err, model.ErrAgentUsageItemInvalid):
		return agenttypes.ModelCallLedgerResult{}, agenttypes.NewError(agenttypes.InvalidArgument, nil)
	case errors.Is(err, model.ErrAgentRunLedgerState):
		return agenttypes.ModelCallLedgerResult{}, agenttypes.NewError(agenttypes.InvalidState, nil)
	case errors.Is(err, model.ErrAgentRunLedgerConflict):
		return agenttypes.ModelCallLedgerResult{}, agenttypes.NewError(agenttypes.IdempotencyConflict, nil)
	case errors.Is(err, model.ErrAgentRunLedgerBudget):
		return agenttypes.ModelCallLedgerResult{}, agenttypes.NewError(agenttypes.BudgetExceeded, nil)
	case errors.Is(err, model.ErrAgentBudgetReservationReference), errors.Is(err, model.ErrAgentGatewayCallReference), errors.Is(err, model.ErrAgentUsageItemReference):
		return agenttypes.ModelCallLedgerResult{}, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	default:
		return agenttypes.ModelCallLedgerResult{}, journalError(err)
	}
}

func (repo *LedgerRepository) ReserveModelCall(ctx context.Context, intent agenttypes.ModelCallReservationIntent) (agenttypes.ModelCallLedgerResult, error) {
	return repo.withLedger(ctx, func(tx *gorm.DB) (agenttypes.ModelCallLedgerResult, error) {
		return model.ReserveAgentModelCall(tx, intent)
	})
}
func (repo *LedgerRepository) MarkDispatched(ctx context.Context, cmd agenttypes.ModelCallLedgerCommand) (agenttypes.ModelCallLedgerResult, error) {
	return repo.withLedger(ctx, func(tx *gorm.DB) (agenttypes.ModelCallLedgerResult, error) {
		return model.MarkAgentModelCallDispatched(tx, cmd)
	})
}
func (repo *LedgerRepository) ReleaseUnissued(ctx context.Context, cmd agenttypes.ModelCallLedgerCommand) (agenttypes.ModelCallLedgerResult, error) {
	return repo.withLedger(ctx, func(tx *gorm.DB) (agenttypes.ModelCallLedgerResult, error) {
		return model.ReleaseAgentModelCallUnissued(tx, cmd)
	})
}
func (repo *LedgerRepository) MarkOutcomeUnknown(ctx context.Context, cmd agenttypes.ModelCallLedgerCommand) (agenttypes.ModelCallLedgerResult, error) {
	return repo.withLedger(ctx, func(tx *gorm.DB) (agenttypes.ModelCallLedgerResult, error) {
		return model.MarkAgentModelCallOutcomeUnknown(tx, cmd)
	})
}
