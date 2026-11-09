package router

import (
	"context"

	"github.com/QuantumNous/new-api/controller"
	agentdefinitioncontroller "github.com/QuantumNous/new-api/controller/agentdefinition"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	agentdefinitionrepo "github.com/QuantumNous/new-api/repository/agentdefinition"
	"github.com/QuantumNous/new-api/service/agent"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
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
	definitionReads := agentdefinitioncontroller.NewReadHandlers(func(identity model.AuthSessionIdentity) (application.DefinitionReader, application.DefinitionReadAuthorizer) {
		db := model.DB
		authorize := func(ctx context.Context, workspaceID int64) (application.DefinitionReadAccess, error) {
			access, err := agent.AuthorizeWorkspace(ctx, db, identity, workspaceID, agent.AgentRead)
			if err != nil {
				return application.DefinitionReadAccess{}, err
			}
			return application.DefinitionReadAccess{TeamID: access.Scope.TeamID}, nil
		}
		return agentdefinitionrepo.New(db, identity), authorize
	})
	workspaces.GET("/:workspace_id/agents", definitionReads.List)
	workspaces.GET("/:workspace_id/agents/:agent_id", definitionReads.Detail)
	drafts := agentdefinitioncontroller.NewDraftHandlers(func(identity model.AuthSessionIdentity) application.DraftRepository {
		return agentdefinitionrepo.NewDraftRepository(model.DB, identity)
	})
	workspaces.POST("/:workspace_id/agents", drafts.Create)
	workspaces.GET("/:workspace_id/agents/:agent_id/draft", drafts.Get)
	workspaces.PUT("/:workspace_id/agents/:agent_id/draft", drafts.Update)
	publishing := agentdefinitioncontroller.NewPublishHandlers(func(identity model.AuthSessionIdentity) application.PublishRepository {
		return agentdefinitionrepo.NewPublishRepository(model.DB, identity)
	})
	workspaces.POST("/:workspace_id/agents/:agent_id/publish", publishing.Publish)
	versions := agentdefinitioncontroller.NewVersionReadHandlers(func(identity model.AuthSessionIdentity) (application.VersionReader, application.VersionReadAuthorizer) {
		db := model.DB
		authorize := func(ctx context.Context, workspaceID int64, content bool) (application.DefinitionReadAccess, error) {
			action := agent.AgentRead
			if content {
				action = agent.AgentWrite
			}
			access, err := agent.AuthorizeWorkspace(ctx, db, identity, workspaceID, action)
			if err != nil {
				return application.DefinitionReadAccess{}, err
			}
			return application.DefinitionReadAccess{TeamID: access.Scope.TeamID}, nil
		}
		return agentdefinitionrepo.NewVersionRepository(db, identity), authorize
	})
	workspaces.GET("/:workspace_id/agents/:agent_id/versions", versions.List)
	workspaces.GET("/:workspace_id/agents/:agent_id/versions/:version_id", versions.Detail)
	lifecycle := agentdefinitioncontroller.NewLifecycleHandlers(func(identity model.AuthSessionIdentity) application.LifecycleRepository {
		return agentdefinitionrepo.NewLifecycleRepository(model.DB, identity)
	})
	workspaces.POST("/:workspace_id/agents/:agent_id/restore-draft", lifecycle.Restore)
	workspaces.POST("/:workspace_id/agents/:agent_id/activate-version", lifecycle.Activate)
	workspaces.PATCH("/:workspace_id/agents/:agent_id/status", lifecycle.SetStatus)
	workspaces.POST("/:workspace_id/agents/:agent_id/archive", lifecycle.Archive)
	editor := agentdefinitioncontroller.NewEditorHandlers(func(identity model.AuthSessionIdentity) application.EditorRepository {
		return agentdefinitionrepo.NewEditorRepository(model.DB, identity)
	})
	workspaces.POST("/:workspace_id/agents/:agent_id/validate", editor.Validate)
	workspaces.GET("/:workspace_id/model-options", editor.ModelOptions)
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
