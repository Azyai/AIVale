package application

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/service/agentrun/domain"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

type ModelBudgetRequest struct {
	Identity              agenttypes.ModelCallIdentity `json:"-"`
	RequestedOutputTokens uint64                       `json:"-"`
	LowerLimits           *domain.LowerLimits          `json:"-"`
}

// BudgetGatewayLimits keeps gateway policy in the host adapter. Application
// code must not duplicate or depend directly on the relay implementation.
type BudgetGatewayLimits struct {
	ExceedsMaxOutputTokens func(uint) bool `json:"-"`
}

// CallBudgetSnapshot is supplied only by a trusted, live resource/funding
// adapter. It is not a client request, authorization cache or payment receipt.
// P02 supplies no production implementation of this port.
type CallBudgetSnapshot struct {
	Identity          agenttypes.ModelCallIdentity `json:"-"`
	RunRevision       int64                        `json:"-"`
	Admission         string                       `json:"-"`
	Status            string                       `json:"-"`
	CallState         string                       `json:"-"`
	UsageState        string                       `json:"-"`
	RequiresReconcile bool                         `json:"-"`
	Model             string                       `json:"-"`
	ConfigHash        string                       `json:"-"`
	FundingSource     string                       `json:"-"`
	RunLimits         domain.Limits                `json:"-"`
	VersionLimits     domain.Limits                `json:"-"`
	WorkspaceLimits   domain.Limits                `json:"-"`
	PlatformLimits    domain.Limits                `json:"-"`
	Usage             domain.Usage                 `json:"-"`
	Funding           domain.Funding               `json:"-"`
	DeadlineAt        int64                        `json:"-"`
	LeaseExpiresAt    int64                        `json:"-"`
}

type CallBudgetSource interface {
	ReadCallBudget(context.Context, agenttypes.ModelCallIdentity) (CallBudgetSnapshot, error)
}

type ModelQuoteRequest struct {
	Identity          agenttypes.ModelCallIdentity `json:"-"`
	RunRevision       int64                        `json:"-"`
	Model             string                       `json:"-"`
	ConfigHash        string                       `json:"-"`
	MaxOutputTokens   uint64                       `json:"-"`
	ExecutionBudgetMS int64                        `json:"-"`
}

// ModelPriceQuote is a certified full-call upper bound from a trusted price
// adapter. The gateway's input-only pre-consume estimate cannot fill this port.
// Arbitrary expressions require a proof of the bound, not one evaluation at
// maximum output. No production estimator is installed in P02.
type ModelPriceQuote struct {
	Request             ModelQuoteRequest `json:"-"`
	State               string            `json:"-"` // bounded, unconfigured, unbounded
	UpperBoundQuota     *int64            `json:"-"`
	PricingSnapshotHash string            `json:"-"`
	IssuedAt            int64             `json:"-"`
	ExpiresAt           int64             `json:"-"`
}

type ModelPriceQuoter interface {
	QuoteModelCall(context.Context, ModelQuoteRequest) (ModelPriceQuote, error)
}

// BudgetPreparation is a read-only calculation. The future P03 transaction
// must recheck live authorization/lease/policy, reserve quota, increment counts
// and persist the call intent before any broker can dispatch a model request.
type BudgetPreparation struct {
	Mode                       string                       `json:"-"`
	Identity                   agenttypes.ModelCallIdentity `json:"-"`
	ExpectedRunRevision        int64                        `json:"-"`
	Model                      string                       `json:"-"`
	ConfigHash                 string                       `json:"-"`
	Limits                     domain.Limits                `json:"-"`
	RequestedOutputTokens      uint64                       `json:"-"`
	ExecutionBudgetMS          int64                        `json:"-"`
	UpperBoundQuota            int64                        `json:"-"`
	RemainingBeforeReservation int64                        `json:"-"`
	PricingSnapshotHash        string                       `json:"-"`
	QuoteExpiresAt             int64                        `json:"-"`
	ValidUntil                 int64                        `json:"-"`
}

// PrepareModelCall cannot reserve, dispatch, settle or refund. A nil adapter
// fails closed; a metadata_only Run never becomes executable by passing math.
func PrepareModelCall(ctx context.Context, request ModelBudgetRequest, source CallBudgetSource, quoter ModelPriceQuoter, gateway BudgetGatewayLimits, clock func() int64) (BudgetPreparation, error) {
	if ctx == nil || clock == nil || gateway.ExceedsMaxOutputTokens == nil {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	validOutput := func(value uint64) bool {
		return value > 0 && value <= uint64(^uint(0)) && !gateway.ExceedsMaxOutputTokens(uint(value))
	}
	if err := ctx.Err(); err != nil {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if source == nil || quoter == nil {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.RuntimeUnavailable, nil)
	}
	request.Identity = copyBudgetIdentity(request.Identity)
	if request.LowerLimits != nil {
		lower := *request.LowerLimits
		for _, field := range []struct {
			original *int64
			copied   **int64
		}{
			{lower.MaxCostQuota, &lower.MaxCostQuota}, {lower.MaxModelCalls, &lower.MaxModelCalls},
			{lower.MaxToolCalls, &lower.MaxToolCalls}, {lower.MaxSteps, &lower.MaxSteps},
			{lower.ExecutionBudgetMS, &lower.ExecutionBudgetMS},
		} {
			if field.original != nil {
				value := *field.original
				*field.copied = &value
			}
		}
		if lower.MaxOutputTokens != nil {
			value := *lower.MaxOutputTokens
			lower.MaxOutputTokens = &value
		}
		request.LowerLimits = &lower
	}
	if err := agenttypes.ValidateModelCallIdentity(request.Identity); err != nil {
		return BudgetPreparation{}, err
	}
	if !validOutput(request.RequestedOutputTokens) {
		return BudgetPreparation{}, agenttypes.NewInvalidArgument("max_output_tokens", "Output limit exceeds the model gateway boundary")
	}
	snapshot, err := source.ReadCallBudget(ctx, copyBudgetIdentity(request.Identity))
	if err != nil {
		return BudgetPreparation{}, budgetDependencyError(err)
	}
	if ctx.Err() != nil {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	snapshot.Identity = copyBudgetIdentity(snapshot.Identity)
	if snapshot.Funding.TokenRemainingQuota != nil {
		remaining := *snapshot.Funding.TokenRemainingQuota
		snapshot.Funding.TokenRemainingQuota = &remaining
	}
	if !reflect.DeepEqual(snapshot.Identity, request.Identity) {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if snapshot.Admission != "execution" || snapshot.Status != "running" {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.InvalidState, nil)
	}
	if snapshot.RunRevision < 1 || snapshot.RunRevision > agenttypes.MaxSafeInteger {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.InvalidState, nil)
	}
	if snapshot.RequiresReconcile || snapshot.UsageState == "reconciliation_required" {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.ReconciliationPending, nil)
	}
	if snapshot.CallState == "outcome_unknown" {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.CallOutcomeUnknown, nil)
	}
	if snapshot.CallState != "new" || snapshot.UsageState != "pending" && snapshot.UsageState != "partial" {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.InvalidState, nil)
	}
	if snapshot.FundingSource != "team_wallet" && snapshot.FundingSource != "subscription" {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.FundingUnavailable, nil)
	}
	if snapshot.Model == "" || len(snapshot.Model) > 256 || strings.TrimSpace(snapshot.Model) != snapshot.Model || !utf8.ValidString(snapshot.Model) || strings.ContainsFunc(snapshot.Model, unicode.IsControl) || !budgetDigestValid(snapshot.ConfigHash) {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	ceilings, err := domain.EffectiveLimits(snapshot.VersionLimits, snapshot.WorkspaceLimits, snapshot.PlatformLimits, nil, validOutput)
	if err != nil {
		return BudgetPreparation{}, err
	}
	limits, err := domain.EffectiveLimits(ceilings, snapshot.RunLimits, ceilings, request.LowerLimits, validOutput)
	if err != nil {
		return BudgetPreparation{}, err
	}
	window := domain.Window{NowMS: clock(), DeadlineAt: snapshot.DeadlineAt, LeaseExpiresAt: snapshot.LeaseExpiresAt}
	// Reject invalid state/zero funds before requesting a price certificate.
	if _, err := domain.CheckCall(limits, snapshot.Usage, snapshot.Funding, window, 0, request.RequestedOutputTokens); err != nil {
		return BudgetPreparation{}, err
	}
	remainingMS := min(limits.ExecutionBudgetMS-snapshot.Usage.ActiveElapsedMS-(window.NowMS-snapshot.Usage.ActiveStartedAt), window.DeadlineAt-window.NowMS)
	quoteRequest := ModelQuoteRequest{
		Identity: copyBudgetIdentity(request.Identity), Model: snapshot.Model, ConfigHash: snapshot.ConfigHash,
		RunRevision:     snapshot.RunRevision,
		MaxOutputTokens: request.RequestedOutputTokens, ExecutionBudgetMS: remainingMS,
	}
	quotedAt := window.NowMS
	priceInput := quoteRequest
	priceInput.Identity = copyBudgetIdentity(quoteRequest.Identity)
	quote, err := quoter.QuoteModelCall(ctx, priceInput)
	if err != nil {
		return BudgetPreparation{}, budgetDependencyError(err)
	}
	if ctx.Err() != nil {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if quote.State != "bounded" {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.DependencyUnavailable, nil)
	}
	if !reflect.DeepEqual(quote.Request, quoteRequest) || quote.UpperBoundQuota == nil || !budgetDigestValid(quote.PricingSnapshotHash) {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.DependencyUnavailable, nil)
	}
	upperBound := *quote.UpperBoundQuota
	window.NowMS = clock()
	if window.NowMS < quotedAt {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.StepTimeout, nil)
	}
	if quote.IssuedAt <= 0 || quote.IssuedAt > agenttypes.MaxSafeInteger || quote.ExpiresAt <= quote.IssuedAt || quote.ExpiresAt > agenttypes.MaxSafeInteger || quote.IssuedAt > window.NowMS || quote.ExpiresAt <= window.NowMS {
		return BudgetPreparation{}, agenttypes.NewError(agenttypes.DependencyUnavailable, nil)
	}
	remainingQuota, err := domain.CheckCall(limits, snapshot.Usage, snapshot.Funding, window, upperBound, request.RequestedOutputTokens)
	if err != nil {
		return BudgetPreparation{}, err
	}
	remainingMS = min(limits.ExecutionBudgetMS-snapshot.Usage.ActiveElapsedMS-(window.NowMS-snapshot.Usage.ActiveStartedAt), window.DeadlineAt-window.NowMS)
	return BudgetPreparation{
		Mode: "preparation_only", Identity: copyBudgetIdentity(request.Identity), Model: snapshot.Model, ConfigHash: snapshot.ConfigHash, Limits: limits,
		ExpectedRunRevision:   snapshot.RunRevision,
		RequestedOutputTokens: request.RequestedOutputTokens, ExecutionBudgetMS: remainingMS,
		UpperBoundQuota: upperBound, RemainingBeforeReservation: remainingQuota,
		PricingSnapshotHash: quote.PricingSnapshotHash, QuoteExpiresAt: quote.ExpiresAt, ValidUntil: min(quote.ExpiresAt, window.DeadlineAt, window.LeaseExpiresAt),
	}, nil
}

func copyBudgetIdentity(identity agenttypes.ModelCallIdentity) agenttypes.ModelCallIdentity {
	if identity.CallerTokenID != nil {
		caller := *identity.CallerTokenID
		identity.CallerTokenID = &caller
	}
	return identity
}

func budgetDigestValid(value string) bool {
	return len(value) == 64 && strings.Trim(value, "0123456789abcdef") == ""
}

func budgetDependencyError(err error) error {
	var controlled *agenttypes.Error
	if errors.As(err, &controlled) {
		return agenttypes.NewError(controlled.Code(), nil)
	}
	return agenttypes.NewError(agenttypes.InternalError, nil)
}
