package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service/agent"
	"github.com/gin-gonic/gin"
)

// GetAgentPlatformCapabilities exposes global configuration and readiness only.
// It does not resolve an identity, accept a tenant scope or authorize any action.
func GetAgentPlatformCapabilities(c *gin.Context) {
	requestID := c.GetString(common.RequestIdKey)
	if requestID == "" {
		requestID = common.NewRequestId()
		c.Set(common.RequestIdKey, requestID)
		c.Header(common.RequestIdKey, requestID)
	}
	result := agent.Probe(agent.RequestContext{
		Context: c.Request.Context(), RequestID: requestID,
	})
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{
		"success": true, "code": "OK", "message": "",
		"request_id": result.RequestID, "data": result.Capabilities,
	})
}
