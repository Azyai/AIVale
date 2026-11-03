package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/service/agent"
	"github.com/gin-gonic/gin"
)

// GetAgentPlatformCapabilities exposes global configuration and readiness only.
// It does not resolve an identity, accept a tenant scope or authorize any action.
func GetAgentPlatformCapabilities(c *gin.Context) {
	result := agent.Probe(agent.RequestContext{
		Context: c.Request.Context(), RequestID: agentapi.RequestID(c),
	})
	agentapi.WriteSuccess(c, http.StatusOK, "OK", result.Capabilities)
}
