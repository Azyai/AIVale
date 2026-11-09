package application

import (
	"context"

	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

type ModelCallLedgerRepository interface {
	ReserveModelCall(context.Context, agenttypes.ModelCallReservationIntent) (agenttypes.ModelCallLedgerResult, error)
	MarkDispatched(context.Context, agenttypes.ModelCallLedgerCommand) (agenttypes.ModelCallLedgerResult, error)
	ReleaseUnissued(context.Context, agenttypes.ModelCallLedgerCommand) (agenttypes.ModelCallLedgerResult, error)
	MarkOutcomeUnknown(context.Context, agenttypes.ModelCallLedgerCommand) (agenttypes.ModelCallLedgerResult, error)
}

// ModelCallLedgerAdmission must authenticate the trusted caller and recheck live
// resource/funding control, applicable policy and a certified full-call price
// bound before reservation. A read-only BudgetPreparation is not sufficient.
// Replay must be authorized too. T02 installs no production implementation;
// nil fails closed, and none of these operations dispatches or settles a model.
type ModelCallLedgerAdmission interface {
	AuthorizeReservation(context.Context, agenttypes.ModelCallReservationIntent) error
	AuthorizeLedgerTransition(context.Context, string, agenttypes.ModelCallLedgerCommand) error
}

func ReserveModelCall(ctx context.Context, repo ModelCallLedgerRepository, admission ModelCallLedgerAdmission, intent agenttypes.ModelCallReservationIntent) (agenttypes.ModelCallLedgerResult, error) {
	if ctx == nil || repo == nil {
		return agenttypes.ModelCallLedgerResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if admission == nil {
		return agenttypes.ModelCallLedgerResult{}, agenttypes.NewError(agenttypes.RuntimeUnavailable, nil)
	}
	if err := ctx.Err(); err != nil {
		return agenttypes.ModelCallLedgerResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	intent.Identity = copyBudgetIdentity(intent.Identity)
	checked := intent
	checked.Identity = copyBudgetIdentity(intent.Identity)
	if err := admission.AuthorizeReservation(ctx, checked); err != nil {
		return agenttypes.ModelCallLedgerResult{}, budgetDependencyError(err)
	}
	return repo.ReserveModelCall(ctx, intent)
}

func MarkModelCallDispatched(ctx context.Context, repo ModelCallLedgerRepository, admission ModelCallLedgerAdmission, cmd agenttypes.ModelCallLedgerCommand) (agenttypes.ModelCallLedgerResult, error) {
	return applyModelCallTransition(ctx, repo, admission, cmd, "dispatch")
}
func ReleaseUnissuedModelCall(ctx context.Context, repo ModelCallLedgerRepository, admission ModelCallLedgerAdmission, cmd agenttypes.ModelCallLedgerCommand) (agenttypes.ModelCallLedgerResult, error) {
	return applyModelCallTransition(ctx, repo, admission, cmd, "release")
}
func MarkModelCallOutcomeUnknown(ctx context.Context, repo ModelCallLedgerRepository, admission ModelCallLedgerAdmission, cmd agenttypes.ModelCallLedgerCommand) (agenttypes.ModelCallLedgerResult, error) {
	return applyModelCallTransition(ctx, repo, admission, cmd, "unknown")
}

func applyModelCallTransition(ctx context.Context, repo ModelCallLedgerRepository, admission ModelCallLedgerAdmission, cmd agenttypes.ModelCallLedgerCommand, operation string) (agenttypes.ModelCallLedgerResult, error) {
	if ctx == nil || repo == nil {
		return agenttypes.ModelCallLedgerResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if admission == nil {
		return agenttypes.ModelCallLedgerResult{}, agenttypes.NewError(agenttypes.RuntimeUnavailable, nil)
	}
	if err := ctx.Err(); err != nil {
		return agenttypes.ModelCallLedgerResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	cmd.Identity = copyBudgetIdentity(cmd.Identity)
	checked := cmd
	checked.Identity = copyBudgetIdentity(cmd.Identity)
	if err := admission.AuthorizeLedgerTransition(ctx, operation, checked); err != nil {
		return agenttypes.ModelCallLedgerResult{}, budgetDependencyError(err)
	}
	switch operation {
	case "dispatch":
		return repo.MarkDispatched(ctx, cmd)
	case "release":
		return repo.ReleaseUnissued(ctx, cmd)
	case "unknown":
		return repo.MarkOutcomeUnknown(ctx, cmd)
	default:
		return agenttypes.ModelCallLedgerResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
}
