package agent

import "github.com/QuantumNous/new-api/setting/agent_setting"

// CapabilitySnapshot describes global configuration, not workspace permissions.
// Enabled switches do not imply an available execution engine.
type CapabilitySnapshot struct {
	SchemaVersion int `json:"schema_version"`
	agent_setting.Capabilities
	RuntimeReady bool `json:"runtime_ready"`
}

// ProbeResult is internal service output; controllers own the HTTP envelope.
type ProbeResult struct {
	RequestID    string
	Capabilities CapabilitySnapshot
}

// Probe reads only the current global feature switches. It does not resolve a
// caller scope, access a database, initialize an SDK, or start background work.
func Probe(request RequestContext) ProbeResult {
	return ProbeResult{
		RequestID: request.RequestID,
		Capabilities: CapabilitySnapshot{
			SchemaVersion: 1,
			Capabilities:  agent_setting.Snapshot(),
			RuntimeReady:  false,
		},
	}
}
