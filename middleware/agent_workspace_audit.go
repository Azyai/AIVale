package middleware

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/gin-gonic/gin"
)

// AgentWorkspaceRejectedAudit records only failed workspace, member and grant writes. It runs
// before authentication so anonymous rejections are visible, and does not read
// or retain request/response bodies. Successful changes use the atomic outbox.
func AgentWorkspaceRejectedAudit() gin.HandlerFunc {
	return func(c *gin.Context) {
		var action, method, route string
		switch c.Request.Method + " " + c.FullPath() {
		case "POST /api/agent-platform/workspaces":
			action, method, route = "workspace.create.rejected", http.MethodPost, "/api/agent-platform/workspaces"
		case "PATCH /api/agent-platform/workspaces/:workspace_id":
			action, method, route = "workspace.update.rejected", http.MethodPatch, "/api/agent-platform/workspaces/:workspace_id"
		case "POST /api/agent-platform/workspaces/:workspace_id/archive":
			action, method, route = "workspace.archive.rejected", http.MethodPost, "/api/agent-platform/workspaces/:workspace_id/archive"
		case "PUT /api/agent-platform/workspaces/:workspace_id/members/:user_id":
			action, method, route = "workspace.member.put.rejected", http.MethodPut, "/api/agent-platform/workspaces/:workspace_id/members/:user_id"
		case "DELETE /api/agent-platform/workspaces/:workspace_id/members/:user_id":
			action, method, route = "workspace.member.remove.rejected", http.MethodDelete, "/api/agent-platform/workspaces/:workspace_id/members/:user_id"
		case "POST /api/agent-platform/workspaces/:workspace_id/token-grants":
			action, method, route = "token_grant.create.rejected", http.MethodPost, "/api/agent-platform/workspaces/:workspace_id/token-grants"
		case "DELETE /api/agent-platform/workspaces/:workspace_id/token-grants/:grant_id":
			action, method, route = "token_grant.revoke.rejected", http.MethodDelete, "/api/agent-platform/workspaces/:workspace_id/token-grants/:grant_id"
		case "POST /api/agent-platform/workspaces/:workspace_id/token-grants/:grant_id/renew":
			action, method, route = "token_grant.renew.rejected", http.MethodPost, "/api/agent-platform/workspaces/:workspace_id/token-grants/:grant_id/renew"
		default:
			c.Next()
			return
		}
		c.Next()
		status := c.Writer.Status()
		if status < http.StatusBadRequest {
			return
		}
		params := model.AuditFields{"http_status": status}
		if workspaceID, err := agentapi.ParseID(c.Param("workspace_id")); err == nil {
			params["attempted_workspace_id"] = strconv.FormatInt(workspaceID, 10)
		}
		if userID, err := agentapi.ParseID(c.Param("user_id")); err == nil {
			params["attempted_user_id"] = strconv.FormatInt(userID, 10)
		}
		if grantID, err := agentapi.ParseID(c.Param("grant_id")); err == nil {
			params["attempted_grant_id"] = strconv.FormatInt(grantID, 10)
		}
		entry := model.AuditLog{
			AuthMethod: "unknown", Category: model.AuditCategorySecurity,
			Action: action, Content: action, Method: method, Route: route,
			Status: status, Success: false, RequestId: agentapi.RequestID(c),
			Other: model.AuditOther{Op: &model.AuditOperation{Action: action, Params: params}},
		}
		identity, authenticated := GetAuthIdentity(c)
		verified, session := GetAgentWorkspaceReadIdentity(c)
		if authenticated && session && identity == verified && identity.UserID > 0 {
			entry.UserId = identity.UserID
			entry.AuthMethod = "session"
			if username := c.GetString("username"); username != "" {
				entry.Username = username
			}
			if role := c.GetInt("role"); common.IsValidateRole(role) {
				entry.ActorRole = role
			}
		}
		// The dedicated entry point cannot copy IP, User-Agent or headers, and
		// this short independent context survives cancellation of the request.
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		model.RecordAuditLogWithContext(ctx, entry)
	}
}
