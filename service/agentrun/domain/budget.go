// Package domain contains read-only Run budget policy. A successful check is
// neither a resource authorization nor a durable reservation or payment.
package domain

import (
	"github.com/QuantumNous/new-api/common"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

// Limits are trusted policy ceilings expressed in existing integer quota,
// counts, output tokens and cumulative execution milliseconds.
type Limits struct {
	MaxCostQuota      int64  `json:"-"`
	MaxModelCalls     int64  `json:"-"`
	MaxToolCalls      int64  `json:"-"`
	MaxSteps          int64  `json:"-"`
	MaxOutputTokens   uint64 `json:"-"`
	ExecutionBudgetMS int64  `json:"-"`
}

// LowerLimits preserves absent versus explicit zero. A request may tighten
// the policy intersection, but it cannot raise a ceiling.
type LowerLimits struct {
	MaxCostQuota      *int64  `json:"-"`
	MaxModelCalls     *int64  `json:"-"`
	MaxToolCalls      *int64  `json:"-"`
	MaxSteps          *int64  `json:"-"`
	MaxOutputTokens   *uint64 `json:"-"`
	ExecutionBudgetMS *int64  `json:"-"`
}

// Usage is current durable Run accounting. StepCount includes the already
// persisted current step; ModelCallCount excludes the proposed new call.
type Usage struct {
	ConsumedQuota   int64 `json:"-"`
	ReservedQuota   int64 `json:"-"`
	ModelCallCount  int64 `json:"-"`
	ToolCallCount   int64 `json:"-"`
	StepCount       int64 `json:"-"`
	ActiveElapsedMS int64 `json:"-"`
	ActiveStartedAt int64 `json:"-"`
}

// Funding is supplied only by a trusted current-facts adapter. Unlimited
// Token quota does not remove the concrete funding balance requirement.
type Funding struct {
	AvailableQuota      int64  `json:"-"`
	TokenUnlimited      bool   `json:"-"`
	TokenRemainingQuota *int64 `json:"-"`
}

// Window carries server time and the current Run deadline and lease fence.
type Window struct {
	NowMS          int64 `json:"-"`
	DeadlineAt     int64 `json:"-"`
	LeaseExpiresAt int64 `json:"-"`
}

// EffectiveLimits intersects version, workspace and platform policy. Current
// text Agents permit one model call, no tools and at most 64 steps/300 seconds.
// The host supplies its gateway output-token validator rather than duplicating
// that boundary here. An explicit zero request remains zero until call checks.
func EffectiveLimits(version, workspace, platform Limits, lower *LowerLimits, validOutput func(uint64) bool) (Limits, error) {
	if validOutput == nil {
		return Limits{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	for _, limits := range []Limits{version, workspace, platform} {
		if limits.MaxCostQuota < 0 || limits.MaxCostQuota > common.MaxQuota ||
			limits.MaxModelCalls != 1 || limits.MaxToolCalls != 0 || limits.MaxSteps < 1 || limits.MaxSteps > 64 ||
			limits.MaxOutputTokens == 0 || !validOutput(limits.MaxOutputTokens) || limits.ExecutionBudgetMS < 1 || limits.ExecutionBudgetMS > 300000 {
			return Limits{}, agenttypes.NewError(agenttypes.InvalidState, nil)
		}
	}
	effective := Limits{
		MaxCostQuota:      min(version.MaxCostQuota, workspace.MaxCostQuota, platform.MaxCostQuota),
		MaxModelCalls:     min(version.MaxModelCalls, workspace.MaxModelCalls, platform.MaxModelCalls),
		MaxToolCalls:      min(version.MaxToolCalls, workspace.MaxToolCalls, platform.MaxToolCalls),
		MaxSteps:          min(version.MaxSteps, workspace.MaxSteps, platform.MaxSteps),
		MaxOutputTokens:   min(version.MaxOutputTokens, workspace.MaxOutputTokens, platform.MaxOutputTokens),
		ExecutionBudgetMS: min(version.ExecutionBudgetMS, workspace.ExecutionBudgetMS, platform.ExecutionBudgetMS),
	}
	if lower == nil {
		return effective, nil
	}
	for _, field := range []struct {
		name      string
		requested *int64
		ceiling   *int64
	}{
		{"max_cost_quota", lower.MaxCostQuota, &effective.MaxCostQuota},
		{"max_model_calls", lower.MaxModelCalls, &effective.MaxModelCalls},
		{"max_tool_calls", lower.MaxToolCalls, &effective.MaxToolCalls},
		{"max_steps", lower.MaxSteps, &effective.MaxSteps},
		{"execution_budget_ms", lower.ExecutionBudgetMS, &effective.ExecutionBudgetMS},
	} {
		if field.requested == nil {
			continue
		}
		if *field.requested < 0 || *field.requested > *field.ceiling {
			return Limits{}, agenttypes.NewInvalidArgument("limits."+field.name, "A requested limit must not raise its effective ceiling")
		}
		*field.ceiling = *field.requested
	}
	if lower.MaxOutputTokens != nil {
		output := *lower.MaxOutputTokens
		if output > effective.MaxOutputTokens || output > 0 && !validOutput(output) {
			return Limits{}, agenttypes.NewInvalidArgument("limits.max_output_tokens", "A requested output limit must not raise its effective ceiling")
		}
		effective.MaxOutputTokens = output
	}
	return effective, nil
}

// CheckCall evaluates a proposed model call without mutating budgets or funds.
// The returned amount is available Run quota before the proposed reservation.
// Limits must first pass EffectiveLimits with the host output-token validator.
// The caller must still obtain a bound for the exact trusted request and then
// persist the reservation with a current lease/authorization fence in P03.
func CheckCall(limits Limits, usage Usage, funding Funding, window Window, upperBoundQuota int64, requestedOutput uint64) (int64, error) {
	if limits.MaxCostQuota < 0 || limits.MaxCostQuota > common.MaxQuota ||
		limits.MaxModelCalls < 0 || limits.MaxModelCalls > 1 || limits.MaxToolCalls != 0 || limits.MaxSteps < 0 || limits.MaxSteps > 64 ||
		limits.ExecutionBudgetMS < 0 || limits.ExecutionBudgetMS > 300000 || upperBoundQuota < 0 || upperBoundQuota > common.MaxQuota {
		return 0, agenttypes.NewError(agenttypes.InvalidState, nil)
	}
	for _, value := range []int64{usage.ConsumedQuota, usage.ReservedQuota, usage.ModelCallCount, usage.ToolCallCount, usage.StepCount} {
		if value < 0 || value > common.MaxQuota {
			return 0, agenttypes.NewError(agenttypes.InvalidState, nil)
		}
	}
	if usage.StepCount == 0 || usage.ActiveElapsedMS < 0 || usage.ActiveElapsedMS > agenttypes.MaxSafeInteger ||
		usage.ActiveStartedAt < 1 || usage.ActiveStartedAt > agenttypes.MaxSafeInteger ||
		window.NowMS < 1 || window.NowMS > agenttypes.MaxSafeInteger || window.DeadlineAt < 1 || window.DeadlineAt > agenttypes.MaxSafeInteger ||
		window.LeaseExpiresAt < 1 || window.LeaseExpiresAt > agenttypes.MaxSafeInteger || usage.ActiveStartedAt > window.NowMS ||
		funding.AvailableQuota < 0 || funding.AvailableQuota > common.MaxWalletQuota {
		return 0, agenttypes.NewError(agenttypes.InvalidState, nil)
	}
	if funding.TokenRemainingQuota != nil && (*funding.TokenRemainingQuota < 0 || *funding.TokenRemainingQuota > common.MaxWalletQuota) {
		return 0, agenttypes.NewError(agenttypes.InvalidState, nil)
	}
	if requestedOutput == 0 {
		return 0, agenttypes.NewInvalidArgument("max_output_tokens", "A positive output limit is required")
	}
	if limits.MaxCostQuota == 0 || limits.MaxModelCalls == 0 || limits.MaxSteps == 0 || limits.MaxOutputTokens == 0 ||
		requestedOutput > limits.MaxOutputTokens || usage.ModelCallCount >= limits.MaxModelCalls || usage.ToolCallCount > limits.MaxToolCalls || usage.StepCount > limits.MaxSteps {
		return 0, agenttypes.NewError(agenttypes.BudgetExceeded, nil)
	}
	// Never sum trusted or malformed accounting values before bounds checks.
	// A saturated wallet, count or reserved value must not wrap into a credit.
	if usage.ConsumedQuota > limits.MaxCostQuota {
		return 0, agenttypes.NewError(agenttypes.BudgetExceeded, nil)
	}
	remaining := limits.MaxCostQuota - usage.ConsumedQuota
	if usage.ReservedQuota > remaining {
		return 0, agenttypes.NewError(agenttypes.BudgetExceeded, nil)
	}
	remaining -= usage.ReservedQuota
	if remaining == 0 || upperBoundQuota > remaining {
		return 0, agenttypes.NewError(agenttypes.BudgetExceeded, nil)
	}
	if funding.AvailableQuota == 0 || upperBoundQuota > funding.AvailableQuota ||
		!funding.TokenUnlimited && (funding.TokenRemainingQuota == nil || *funding.TokenRemainingQuota == 0 || upperBoundQuota > *funding.TokenRemainingQuota) {
		return 0, agenttypes.NewError(agenttypes.FundingUnavailable, nil)
	}
	if window.NowMS >= window.DeadlineAt || window.NowMS >= window.LeaseExpiresAt || usage.ActiveElapsedMS >= limits.ExecutionBudgetMS {
		return 0, agenttypes.NewError(agenttypes.StepTimeout, nil)
	}
	// Both timestamps were checked within the safe positive millisecond domain.
	// Subtract the completed fragments before comparing the current fragment.
	if window.NowMS-usage.ActiveStartedAt >= limits.ExecutionBudgetMS-usage.ActiveElapsedMS {
		return 0, agenttypes.NewError(agenttypes.StepTimeout, nil)
	}
	return remaining, nil
}
