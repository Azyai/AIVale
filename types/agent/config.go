package agent

import "encoding/json"

const AgentConfigSchemaVersion = 1

// AgentConfig is the normalized v1 draft. Schemas are inline JSON objects and
// a missing output constraint is represented by {}. The type grants no access.
type AgentConfig struct {
	SchemaVersion int               `json:"schema_version"`
	Name          string            `json:"name"`
	Instructions  string            `json:"instructions"`
	ModelPolicy   AgentModelPolicy  `json:"model_policy"`
	InputSchema   json.RawMessage   `json:"input_schema"`
	OutputSchema  json.RawMessage   `json:"output_schema"`
	SkillBindings []struct{}        `json:"skill_bindings"`
	ToolBindings  []struct{}        `json:"tool_bindings"`
	Limits        AgentConfigLimits `json:"limits"`
}

type AgentModelPolicy struct {
	Model           string   `json:"model"`
	Temperature     *float64 `json:"temperature,omitempty"`
	MaxOutputTokens uint     `json:"max_output_tokens"`
}

type AgentConfigLimits struct {
	MaxSteps       int64  `json:"max_steps"`
	MaxModelCalls  int64  `json:"max_model_calls"`
	MaxToolCalls   int64  `json:"max_tool_calls"`
	TimeoutSeconds int64  `json:"timeout_seconds"`
	MaxCostQuota   string `json:"max_cost_quota"`
}
