package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/setting/agent_setting"
	"github.com/gin-gonic/gin"
)

// SetAgentRouter registers the public probe and gated, session-only workspace
// reads inside the existing API middleware chain.
func SetAgentRouter(apiRouter *gin.RouterGroup) {
	agentRouter := apiRouter.Group("/agent-platform")
	agentRouter.GET("/capabilities", controller.GetAgentPlatformCapabilities)
	workspaces := agentRouter.Group("/workspaces")
	workspaces.Use(middleware.RequireAgentFeature(agent_setting.FeaturePlatform))
	workspaces.Use(middleware.AgentWorkspaceManagementAuth()...)
	workspaces.GET("", controller.ListAgentWorkspaces)
	workspaces.GET("/:workspace_id", controller.GetAgentWorkspace)
}
