package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/gin-gonic/gin"
)

// SetAgentRouter registers the public global probe inside the existing API
// middleware chain. Resource and execution handlers are added in later tasks.
func SetAgentRouter(apiRouter *gin.RouterGroup) {
	agentRouter := apiRouter.Group("/agent-platform")
	agentRouter.GET("/capabilities", controller.GetAgentPlatformCapabilities)
}
