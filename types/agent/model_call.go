package agent

import (
	"math"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// ModelCallIdentity is server-resolved context for one logical model attempt.
// It is neither a client DTO nor an authorization or settlement permit.
type ModelCallIdentity struct {
	TeamID           int64  `json:"-"`
	WorkspaceID      int64  `json:"-"`
	RunID            int64  `json:"-"`
	StepID           int64  `json:"-"`
	AgentID          int64  `json:"-"`
	AgentVersionID   int64  `json:"-"`
	ExecutionUserID  int64  `json:"-"`
	FundingTokenID   int64  `json:"-"`
	CallerTokenID    *int64 `json:"-"`
	LogicalCallID    string `json:"-"`
	Attempt          int64  `json:"-"`
	LeaseEpoch       int64  `json:"-"`
	GatewayRequestID string `json:"-"`
	RequestHash      string `json:"-"`
}

func ValidateModelCallIdentity(identity ModelCallIdentity) error {
	for _, field := range []struct {
		name string
		id   int64
	}{{"team_id", identity.TeamID}, {"workspace_id", identity.WorkspaceID}, {"run_id", identity.RunID}, {"step_id", identity.StepID}, {"agent_id", identity.AgentID}, {"agent_version_id", identity.AgentVersionID}, {"execution_user_id", identity.ExecutionUserID}, {"funding_token_id", identity.FundingTokenID}} {
		if field.id <= 0 {
			return NewInvalidArgument(field.name, "A positive resource ID is required")
		}
	}
	if identity.CallerTokenID != nil && (*identity.CallerTokenID <= 0 || *identity.CallerTokenID != identity.FundingTokenID) {
		return NewInvalidArgument("caller_token_id", "A caller reference must equal its funding Token")
	}
	if identity.Attempt < 1 || identity.Attempt > math.MaxInt32 {
		return NewInvalidArgument("attempt", "Attempt must be a positive int32 value")
	}
	if identity.LeaseEpoch < 1 || identity.LeaseEpoch > MaxSafeInteger {
		return NewInvalidArgument("lease_epoch", "Lease epoch must be a positive safe integer")
	}
	if !validModelCallReference(identity.LogicalCallID) {
		return NewInvalidArgument("logical_call_id", "A server-generated model call reference is required")
	}
	if !validModelCallReference(identity.GatewayRequestID) {
		return NewInvalidArgument("gateway_request_id", "A server-generated gateway reference is required")
	}
	if !validModelCallDigest(identity.RequestHash) {
		return NewInvalidArgument("request_hash", "A canonical request digest is required")
	}
	return nil
}

// GatewayCallLink is a minimal read projection of the future P03 ledger.
// The database ID is assigned only after trusted persistence. A consume log
// reference is optional and never proves that funding or Token updates applied.
type GatewayCallLink struct {
	GatewayCallID       string  `json:"gateway_call_id"`
	TeamID              string  `json:"team_id"`
	WorkspaceID         string  `json:"workspace_id"`
	RunID               string  `json:"run_id"`
	StepID              string  `json:"step_id"`
	AgentID             string  `json:"agent_id"`
	AgentVersionID      string  `json:"agent_version_id"`
	ExecutionUserID     string  `json:"execution_user_id"`
	FundingTokenID      string  `json:"funding_token_id"`
	CallerTokenID       *string `json:"caller_token_id"`
	LogicalCallID       string  `json:"logical_call_id"`
	Attempt             int64   `json:"attempt"`
	LeaseEpoch          int64   `json:"lease_epoch"`
	GatewayRequestID    string  `json:"gateway_request_id"`
	RequestHash         string  `json:"request_hash"`
	ModelName           string  `json:"model_name"`
	PricingSnapshotHash string  `json:"pricing_snapshot_hash"`
	State               string  `json:"state"`
	FundingState        string  `json:"funding_state"`
	TokenState          string  `json:"token_state"`
	PreconsumeQuota     *string `json:"preconsume_quota"`
	ActualQuota         *string `json:"actual_quota"`
	ConsumeLogID        *string `json:"consume_log_id"`
}

// ValidateGatewayCallLink checks consistency only. It cannot authenticate a
// producer, resolve a real database reference or make an unknown effect final.
func ValidateGatewayCallLink(link GatewayCallLink) error {
	for _, id := range []string{link.GatewayCallID, link.TeamID, link.WorkspaceID, link.RunID, link.StepID, link.AgentID, link.AgentVersionID, link.ExecutionUserID, link.FundingTokenID} {
		if !validModelCallID(id) {
			return NewError(InternalError, nil)
		}
	}
	if link.CallerTokenID != nil && (!validModelCallID(*link.CallerTokenID) || *link.CallerTokenID != link.FundingTokenID) || link.ConsumeLogID != nil && !validModelCallID(*link.ConsumeLogID) ||
		!validModelCallReference(link.LogicalCallID) || !validModelCallReference(link.GatewayRequestID) ||
		link.Attempt < 1 || link.Attempt > math.MaxInt32 || link.LeaseEpoch < 1 || link.LeaseEpoch > MaxSafeInteger ||
		!validModelCallDigest(link.RequestHash) || !validModelCallDigest(link.PricingSnapshotHash) || !validModelCallModelName(link.ModelName) {
		return NewError(InternalError, nil)
	}
	if link.PreconsumeQuota != nil && !validModelCallQuota(*link.PreconsumeQuota) || link.ActualQuota != nil && !validModelCallQuota(*link.ActualQuota) ||
		!validGatewayCommitState(link.FundingState) || !validGatewayCommitState(link.TokenState) {
		return NewError(InternalError, nil)
	}
	switch link.State {
	case "settled":
		if link.ActualQuota == nil || !confirmedGatewayCommitState(link.FundingState) || !confirmedGatewayCommitState(link.TokenState) {
			return NewError(InternalError, nil)
		}
	case "prepared", "dispatched", "responded", "rejected", "outcome_unknown":
		if link.ActualQuota != nil {
			return NewError(InternalError, nil)
		}
	default:
		return NewError(InternalError, nil)
	}
	return nil
}

// ModelUsageLink describes a confirmed model usage projection, never a charge
// instruction. Refunds/corrections append related facts; they do not mutate a
// prior item. Database event deduplication and net-amount checks belong to P03.
type ModelUsageLink struct {
	ID                  string  `json:"id"`
	TeamID              string  `json:"team_id"`
	WorkspaceID         string  `json:"workspace_id"`
	RunID               string  `json:"run_id"`
	StepID              string  `json:"step_id"`
	AgentID             string  `json:"agent_id"`
	AgentVersionID      string  `json:"agent_version_id"`
	ExecutionUserID     string  `json:"execution_user_id"`
	FundingTokenID      string  `json:"funding_token_id"`
	GatewayCallID       string  `json:"gateway_call_id"`
	LogicalCallID       string  `json:"logical_call_id"`
	Attempt             int64   `json:"attempt"`
	GatewayRequestID    string  `json:"gateway_request_id"`
	RequestHash         string  `json:"request_hash"`
	ModelName           string  `json:"model_name"`
	PricingSnapshotHash string  `json:"pricing_snapshot_hash"`
	SourceEventKey      string  `json:"source_event_key"`
	SourceKind          string  `json:"source_kind"`
	ItemKind            string  `json:"item_kind"`
	RelatedItemID       *string `json:"related_item_id"`
	Quota               string  `json:"quota"`
	ConsumeLogID        *string `json:"consume_log_id"`
	OccurredAt          int64   `json:"occurred_at"`
}

func ValidateModelUsageLink(usage ModelUsageLink, gateway GatewayCallLink) error {
	if ValidateGatewayCallLink(gateway) != nil || gateway.State != "settled" || !validModelCallID(usage.ID) ||
		usage.SourceKind != "model" || !validModelCallDigest(usage.SourceEventKey) || !validModelCallQuota(usage.Quota) ||
		usage.OccurredAt < 1 || usage.OccurredAt > MaxSafeInteger {
		return NewError(InternalError, nil)
	}
	for _, pair := range [][2]string{
		{usage.TeamID, gateway.TeamID}, {usage.WorkspaceID, gateway.WorkspaceID}, {usage.RunID, gateway.RunID}, {usage.StepID, gateway.StepID},
		{usage.AgentID, gateway.AgentID}, {usage.AgentVersionID, gateway.AgentVersionID}, {usage.ExecutionUserID, gateway.ExecutionUserID},
		{usage.FundingTokenID, gateway.FundingTokenID}, {usage.GatewayCallID, gateway.GatewayCallID}, {usage.LogicalCallID, gateway.LogicalCallID},
		{usage.GatewayRequestID, gateway.GatewayRequestID}, {usage.RequestHash, gateway.RequestHash}, {usage.ModelName, gateway.ModelName},
		{usage.PricingSnapshotHash, gateway.PricingSnapshotHash},
	} {
		if pair[0] != pair[1] {
			return NewError(InternalError, nil)
		}
	}
	if usage.Attempt != gateway.Attempt || (usage.ConsumeLogID == nil) != (gateway.ConsumeLogID == nil) {
		return NewError(InternalError, nil)
	}
	if usage.ConsumeLogID != nil && *usage.ConsumeLogID != *gateway.ConsumeLogID {
		return NewError(InternalError, nil)
	}
	if usage.RelatedItemID != nil && (!validModelCallID(*usage.RelatedItemID) || *usage.RelatedItemID == usage.ID) {
		return NewError(InternalError, nil)
	}
	switch usage.ItemKind {
	case "charge":
		if usage.Quota != *gateway.ActualQuota {
			return NewError(InternalError, nil)
		}
	case "refund":
		// Both quota strings have already passed canonical int64 validation.
		// Length/lexical comparison preserves exact order without addition or
		// narrowing; aggregate refunds still need a persistent P03 net check.
		actual := *gateway.ActualQuota
		if usage.RelatedItemID == nil || len(usage.Quota) > len(actual) || len(usage.Quota) == len(actual) && usage.Quota > actual {
			return NewError(InternalError, nil)
		}
	default:
		return NewError(InternalError, nil)
	}
	return nil
}

func validModelCallID(value string) bool {
	parsed, err := strconv.ParseInt(value, 10, 64)
	return err == nil && parsed > 0 && strconv.FormatInt(parsed, 10) == value
}

func validModelCallQuota(value string) bool {
	parsed, err := strconv.ParseInt(value, 10, 64)
	return err == nil && parsed >= 0 && strconv.FormatInt(parsed, 10) == value
}

func validModelCallReference(value string) bool {
	if len(value) < 16 || len(value) > 64 {
		return false
	}
	for _, character := range []byte(value) {
		if !(character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' || character >= '0' && character <= '9' || strings.ContainsRune("_.:-", rune(character))) {
			return false
		}
	}
	return true
}

func validModelCallDigest(value string) bool {
	return len(value) == 64 && strings.Trim(value, "0123456789abcdef") == ""
}

func validModelCallModelName(value string) bool {
	return value != "" && len(value) <= 256 && utf8.ValidString(value) && strings.TrimSpace(value) == value && !strings.ContainsFunc(value, unicode.IsControl)
}

func validGatewayCommitState(state string) bool {
	return state == "pending" || state == "applied" || state == "refunded" || state == "unknown"
}

func confirmedGatewayCommitState(state string) bool {
	return state == "applied" || state == "refunded"
}
