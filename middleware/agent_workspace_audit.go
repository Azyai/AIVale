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

// AgentWorkspaceRejectedAudit records only failed lifecycle writes. It runs
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
