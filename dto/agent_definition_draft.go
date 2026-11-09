package dto

import agenttypes "github.com/QuantumNous/new-api/types/agent"

// AgentDefinitionDraft is the editor response. A new draft deliberately has no
// executable configuration until an editor chooses a model and saves it.
type AgentDefinitionDraft struct {
	ID       string                  `json:"id"`
	Revision int64                   `json:"revision"`
	Config   *agenttypes.AgentConfig `json:"config"`
}
