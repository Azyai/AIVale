package agent

import (
	"context"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
)

// ValidateAgentConfig validates and normalizes a draft against the current
// workspace and model catalog. It does not save, publish, reserve funds or run
// a model. Revalidate live dependencies at the eventual write/run boundary.
func ValidateAgentConfig(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID int64, raw []byte) (*agenttypes.AgentConfig, error) {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return nil, err
	}

	readPolicy := func(ctx context.Context, workspaceID int64, modelName string) (application.DraftPolicy, error) {
		return loadAgentConfigPolicy(ctx, db, identity, workspaceID, modelName)
	}
	return application.ValidateDraft(ctx, workspaceID, raw, readPolicy, AgentDraftGatewayLimits())
}

// AgentDraftGatewayLimits applies the same output-token boundary as the gateway.
func AgentDraftGatewayLimits() application.GatewayLimits {
	return application.GatewayLimits{
		TimeoutSeconds: common.RelayTimeout,
		ExceedsMaxOutputTokens: func(tokens uint) bool {
			return helper.ExceedsMaxTokensLimit(&tokens)
		},
	}
}
