package application

import (
	"bytes"
	"context"
	"math"
	"slices"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

const (
	agentConfigMaxBytes     = 60 * 1024
	agentConfigMaxSteps     = 64
	agentConfigMaxTimeout   = 300
	agentConfigDefaultQuota = 1000
)

// DraftPolicy contains the live workspace limits and model eligibility for a
// single configuration check. It does not authorize publishing or running.
type DraftPolicy struct {
	ModelAvailable   bool
	DefaultCostQuota int64
	MaxCostQuota     int64
	MaxRunSeconds    int32
}

// DraftPolicyReader must reauthorize the current editor for this workspace and
// check live model eligibility on every call. The adapter binds the trusted
// editor; it must not reuse a cached permission or accept one from the draft.
type DraftPolicyReader func(ctx context.Context, workspaceID int64, modelName string) (DraftPolicy, error)

// GatewayLimits supplies the current relay limits without making the
// application depend on a gateway implementation.
type GatewayLimits struct {
	TimeoutSeconds         int
	ExceedsMaxOutputTokens func(uint) bool
}

// ValidateDraft normalizes a single draft against live policy. It does not
// write, reserve funds, select a channel credential or execute a model.
func ValidateDraft(ctx context.Context, workspaceID int64, raw []byte, readPolicy DraftPolicyReader, gateway GatewayLimits) (*agenttypes.AgentConfig, error) {
	if ctx == nil || readPolicy == nil || gateway.ExceedsMaxOutputTokens == nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if err := ctx.Err(); err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	if workspaceID <= 0 {
		return nil, agenttypes.NewInvalidArgument("workspace_id", "Workspace ID must be positive")
	}
	config, err := parseAgentConfig(raw, gateway.ExceedsMaxOutputTokens)
	if err != nil {
		return nil, err
	}
	policy, err := readPolicy(ctx, workspaceID, config.ModelPolicy.Model)
	if err != nil {
		return nil, err
	}
	if !policy.ModelAvailable {
		return nil, agenttypes.NewError(agenttypes.DependencyUnavailable, nil)
	}
	if err := applyAgentConfigLimits(&config.Limits, policy, gateway.TimeoutSeconds); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	wire, err := common.Marshal(config)
	if err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	if len(wire) > agentConfigMaxBytes {
		return nil, agenttypes.NewError(agenttypes.PayloadTooLarge, nil)
	}
	return config, nil
}

func parseAgentConfig(raw []byte, exceedsMaxOutputTokens func(uint) bool) (*agenttypes.AgentConfig, error) {
	if len(raw) > agentConfigMaxBytes {
		return nil, agenttypes.NewError(agenttypes.PayloadTooLarge, nil)
	}
	fields, err := agentConfigObject(raw, "config", "schema_version", "name", "instructions", "model_policy", "input_schema", "output_schema", "skill_bindings", "tool_bindings", "limits")
	if err != nil {
		return nil, err
	}
	version, ok := agentConfigInteger(bytes.TrimSpace(fields["schema_version"]), agenttypes.AgentConfigSchemaVersion, agenttypes.AgentConfigSchemaVersion)
	if !ok {
		return nil, agenttypes.NewInvalidArgument("schema_version", "Only integer schema version 1 is supported")
	}
	var name, instructions string
	if err := common.Unmarshal(fields["name"], &name); err != nil || strings.ContainsRune(name, 0) {
		return nil, agenttypes.NewInvalidArgument("name", "Name must contain 1 to 128 valid characters")
	}
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 512 || utf8.RuneCountInString(name) > 128 {
		return nil, agenttypes.NewInvalidArgument("name", "Name must contain 1 to 128 valid characters")
	}
	if err := common.Unmarshal(fields["instructions"], &instructions); err != nil || len(instructions) > 32*1024 || strings.ContainsRune(instructions, 0) || strings.TrimSpace(instructions) == "" {
		return nil, agenttypes.NewInvalidArgument("instructions", "Instructions must be nonblank and no larger than 32 KiB in UTF-8")
	}
	modelPolicy, err := parseAgentModelPolicy(fields["model_policy"], exceedsMaxOutputTokens)
	if err != nil {
		return nil, err
	}
	input, err := normalizeAgentConfigSchema(fields["input_schema"])
	if err != nil {
		return nil, agenttypes.NewInvalidArgument("input_schema", "Input Schema must use the supported inline object rules")
	}
	outputRaw := fields["output_schema"]
	if bytes.Equal(bytes.TrimSpace(outputRaw), []byte("null")) {
		outputRaw = []byte("{}")
	}
	output, err := normalizeAgentConfigSchema(outputRaw)
	if err != nil {
		return nil, agenttypes.NewInvalidArgument("output_schema", "Output Schema must be null or use the supported inline object rules")
	}
	for _, field := range []string{"skill_bindings", "tool_bindings"} {
		var bindings []common.RawMessage
		if common.Unmarshal(fields[field], &bindings) != nil || bindings == nil || len(bindings) != 0 {
			return nil, agenttypes.NewInvalidArgument(field, "Bindings must be an empty array for a v1 text Agent")
		}
	}
	limits, err := parseAgentConfigLimits(fields["limits"])
	if err != nil {
		return nil, err
	}
	return &agenttypes.AgentConfig{SchemaVersion: int(version), Name: name, Instructions: instructions, ModelPolicy: modelPolicy,
		InputSchema: input, OutputSchema: output, SkillBindings: []struct{}{}, ToolBindings: []struct{}{}, Limits: limits}, nil
}

func parseAgentModelPolicy(raw []byte, exceedsMaxOutputTokens func(uint) bool) (agenttypes.AgentModelPolicy, error) {
	fields, err := agentConfigObject(raw, "model_policy", "model", "temperature", "max_output_tokens")
	if err != nil {
		return agenttypes.AgentModelPolicy{}, err
	}
	var policy agenttypes.AgentModelPolicy
	if common.Unmarshal(fields["model"], &policy.Model) != nil || policy.Model == "" || len(policy.Model) > 256 || strings.TrimSpace(policy.Model) != policy.Model || strings.ContainsFunc(policy.Model, unicode.IsControl) {
		return agenttypes.AgentModelPolicy{}, agenttypes.NewInvalidArgument("model_policy.model", "Model must be a valid exact catalog name")
	}
	value, ok := agentConfigInteger(bytes.TrimSpace(fields["max_output_tokens"]), 1, math.MaxUint32)
	if !ok {
		return agenttypes.AgentModelPolicy{}, agenttypes.NewInvalidArgument("model_policy.max_output_tokens", "Output token limit must be a positive integer within the gateway limit")
	}
	policy.MaxOutputTokens = uint(value) // Parse upper bound also fits on 32-bit hosts.
	if exceedsMaxOutputTokens(policy.MaxOutputTokens) {
		return agenttypes.AgentModelPolicy{}, agenttypes.NewInvalidArgument("model_policy.max_output_tokens", "Output token limit must be a positive integer within the gateway limit")
	}
	if rawTemperature, supplied := fields["temperature"]; supplied {
		_, number, err := normalizeAgentSchemaNumber(rawTemperature, false)
		if err != nil {
			return agenttypes.AgentModelPolicy{}, agenttypes.NewInvalidArgument("model_policy.temperature", "Temperature must be a decimal between 0 and 2 with at most six fractional digits")
		}
		temperature, _ := number.Float64()
		if temperature < 0 || temperature > 2 {
			return agenttypes.AgentModelPolicy{}, agenttypes.NewInvalidArgument("model_policy.temperature", "Temperature must be a decimal between 0 and 2 with at most six fractional digits")
		}
		policy.Temperature = &temperature
	}
	return policy, nil
}

func parseAgentConfigLimits(raw []byte) (agenttypes.AgentConfigLimits, error) {
	fields, err := agentConfigObject(raw, "limits", "max_steps", "max_model_calls", "max_tool_calls", "timeout_seconds", "max_cost_quota")
	if err != nil {
		return agenttypes.AgentConfigLimits{}, err
	}
	var limits agenttypes.AgentConfigLimits
	for _, rule := range []struct {
		key, message     string
		minimum, maximum int64
		value            *int64
	}{
		{"max_steps", "Step limit must be an integer between 1 and 64", 1, agentConfigMaxSteps, &limits.MaxSteps},
		{"max_model_calls", "A v1 text Agent allows exactly one model call", 1, 1, &limits.MaxModelCalls},
		{"max_tool_calls", "A v1 text Agent does not allow tool calls", 0, 0, &limits.MaxToolCalls},
		{"timeout_seconds", "Timeout must be an integer between 1 and 300 seconds", 1, agentConfigMaxTimeout, &limits.TimeoutSeconds},
	} {
		value, ok := agentConfigInteger(bytes.TrimSpace(fields[rule.key]), rule.minimum, rule.maximum)
		if !ok {
			return agenttypes.AgentConfigLimits{}, agenttypes.NewInvalidArgument("limits."+rule.key, rule.message)
		}
		*rule.value = value
	}
	if rawBudget, supplied := fields["max_cost_quota"]; supplied {
		if err := common.Unmarshal(rawBudget, &limits.MaxCostQuota); err != nil {
			return agenttypes.AgentConfigLimits{}, agenttypes.NewInvalidArgument("limits.max_cost_quota", "Budget must be a canonical nonnegative quota string within the platform limit")
		}
		if _, ok := agentConfigInteger([]byte(limits.MaxCostQuota), 0, common.MaxQuota); !ok {
			return agenttypes.AgentConfigLimits{}, agenttypes.NewInvalidArgument("limits.max_cost_quota", "Budget must be a canonical nonnegative quota string within the platform limit")
		}
	}
	return limits, nil
}

func applyAgentConfigLimits(limits *agenttypes.AgentConfigLimits, policy DraftPolicy, relayTimeout int) error {
	if policy.MaxCostQuota < 0 || policy.DefaultCostQuota < 0 || policy.DefaultCostQuota > policy.MaxCostQuota || policy.MaxRunSeconds < 0 {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	maxTimeout := int64(agentConfigMaxTimeout)
	if policy.MaxRunSeconds > 0 {
		maxTimeout = min(maxTimeout, int64(policy.MaxRunSeconds))
	}
	if relayTimeout > 0 {
		maxTimeout = min(maxTimeout, int64(relayTimeout))
	}
	if limits.TimeoutSeconds > maxTimeout {
		return agenttypes.NewInvalidArgument("limits.timeout_seconds", "Timeout exceeds the current workspace or gateway limit")
	}
	maxBudget, defaultBudget := int64(common.MaxQuota), int64(agentConfigDefaultQuota)
	// P01 workspaces have zero-valued runtime settings. For validation only,
	// keep drafts usable with a bounded platform policy, never unlimited funds.
	if policy.MaxCostQuota > 0 {
		maxBudget = min(maxBudget, policy.MaxCostQuota)
		defaultBudget = min(maxBudget, policy.DefaultCostQuota)
	}
	if limits.MaxCostQuota == "" {
		limits.MaxCostQuota = strconv.FormatInt(defaultBudget, 10)
		return nil
	}
	budget, ok := agentConfigInteger([]byte(limits.MaxCostQuota), 0, maxBudget)
	if !ok {
		return agenttypes.NewInvalidArgument("limits.max_cost_quota", "Budget exceeds the current workspace or platform limit")
	}
	limits.MaxCostQuota = strconv.FormatInt(budget, 10)
	return nil
}

func agentConfigObject(raw []byte, path string, allowed ...string) (map[string]common.RawMessage, error) {
	fields, err := common.UnmarshalJSONObjectStrict(raw)
	if err != nil {
		return nil, agenttypes.NewInvalidArgument(path, "A JSON object with unique fields is required")
	}
	for field := range fields {
		if !slices.Contains(allowed, field) {
			return nil, agenttypes.NewInvalidArgument(path, "The object contains an unsupported field")
		}
	}
	return fields, nil
}

// agentConfigInteger accepts only canonical ASCII nonnegative integers. JSON
// callers trim wire whitespace before parsing; quota strings must not have it.
func agentConfigInteger(raw []byte, minimum, maximum int64) (int64, bool) {
	if len(raw) == 0 || len(raw) > 19 || len(raw) > 1 && raw[0] == '0' {
		return 0, false
	}
	for _, character := range raw {
		if character < '0' || character > '9' {
			return 0, false
		}
	}
	value, err := strconv.ParseInt(string(raw), 10, 64)
	return value, err == nil && value >= minimum && value <= maximum
}
