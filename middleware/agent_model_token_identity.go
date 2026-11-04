package middleware

import (
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const agentModelTokenIdentityContextKey = "agent_model_token_identity"

// GetAgentModelTokenIdentity returns only the typed fact bound after successful
// TokenAuth. Loose context IDs and dashboard session/PAT identity do not qualify.
func GetAgentModelTokenIdentity(c *gin.Context) (model.AgentModelTokenIdentity, bool) {
	value, _ := c.Get(agentModelTokenIdentityContextKey)
	identity, ok := value.(model.AgentModelTokenIdentity)
	return identity, ok && identity.Valid()
}
