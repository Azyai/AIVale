package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/setting/agent_setting"
	"github.com/gin-gonic/gin"
)

// SetAgentRouter registers the public probe and gated, session-only workspace
// management operations inside the existing API middleware chain.
func SetAgentRouter(apiRouter *gin.RouterGroup) {
	agentRouter := apiRouter.Group("/agent-platform")
	agentRouter.GET("/capabilities", controller.GetAgentPlatformCapabilities)
	personal := agentRouter.Group("/personal-workspace")
	personal.Use(middleware.RequireAgentFeature(agent_setting.FeaturePlatform))
	personal.Use(middleware.AgentWorkspaceManagementAuth()...)
	personal.GET("", controller.GetAgentPersonalWorkspace)
	personal.PUT("", controller.PutAgentPersonalWorkspace)

	workspaces := agentRouter.Group("/workspaces")
	workspaces.Use(middleware.RequireAgentFeature(agent_setting.FeaturePlatform))
	workspaces.Use(middleware.AgentWorkspaceRejectedAudit())
	workspaces.Use(middleware.AgentWorkspaceManagementAuth()...)
	workspaces.GET("", controller.ListAgentWorkspaces)
	workspaces.GET("/create-eligibility", controller.GetAgentWorkspaceCreateEligibility)
	workspaces.GET("/:workspace_id", controller.GetAgentWorkspace)
	workspaces.POST("", controller.CreateAgentWorkspace)
	workspaces.PATCH("/:workspace_id", controller.UpdateAgentWorkspace)
	workspaces.POST("/:workspace_id/archive", controller.ArchiveAgentWorkspace)
	workspaces.GET("/:workspace_id/members", controller.ListAgentWorkspaceMembers)
	workspaces.PUT("/:workspace_id/members/:user_id", controller.PutAgentWorkspaceMember)
	workspaces.DELETE("/:workspace_id/members/:user_id", controller.DeleteAgentWorkspaceMember)
	workspaces.GET("/:workspace_id/token-grants", controller.ListAgentWorkspaceTokenGrants)
	workspaces.GET("/:workspace_id/token-grants/permissions", controller.GetAgentWorkspaceTokenGrantPermissions)
	workspaces.POST("/:workspace_id/token-grants", controller.CreateAgentWorkspaceTokenGrant)
	workspaces.POST("/:workspace_id/token-grants/:grant_id/renew", controller.RenewAgentWorkspaceTokenGrant)
	workspaces.DELETE("/:workspace_id/token-grants/:grant_id", controller.RevokeAgentWorkspaceTokenGrant)
}
