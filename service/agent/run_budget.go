package agent

import (
	"github.com/QuantumNous/new-api/relay/helper"
	runapplication "github.com/QuantumNous/new-api/service/agentrun/application"
)

// AgentModelCallGatewayLimits keeps the host's primary output-token boundary
// at the adapter edge. Budget policy does not own a second gateway limit.
func AgentModelCallGatewayLimits() runapplication.BudgetGatewayLimits {
	return runapplication.BudgetGatewayLimits{
		ExceedsMaxOutputTokens: func(tokens uint) bool {
			return helper.ExceedsMaxTokensLimit(&tokens)
		},
	}
}
