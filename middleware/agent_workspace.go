package middleware

import (
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/service/agent"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

const agentWorkspaceAccessContextKey = "agent_workspace_access"

// AgentWorkspaceAccess 必须接在现有UserAuth之后；本批不注册任何客户业务路由。
// 它只读取受信typed管理身份和路径ID，不读取body/header中的team、role或Scope。
func AgentWorkspaceAccess(action agent.WorkspaceAction) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(agentWorkspaceAccessContextKey, nil)
		if c.Request == nil {
			agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
			return
		}
		trusted, authenticated := GetAuthIdentity(c)
		identity, session := GetSessionAuthIdentity(c)
		if !authenticated || !session || trusted != identity || c.GetBool("use_access_token") || strings.HasPrefix(identity.SessionID, "pat:") {
			agentapi.WriteError(c, agenttypes.NewError(agenttypes.AuthRequired, nil))
			return
		}
		workspaceID, err := agentapi.ParseID(c.Param("workspace_id"))
		if err != nil {
			agentapi.WriteError(c, err)
			return
		}
		access, err := agent.AuthorizeWorkspace(c.Request.Context(), model.DB, identity, workspaceID, action)
		if err != nil {
			agentapi.WriteError(c, err)
			return
		}
		c.Set(agentWorkspaceAccessContextKey, *access)
		c.Next()
	}
}

// GetAgentWorkspaceAccess 返回值拷贝，避免下游改写已绑定的本次判定元数据。
// 返回结果不能替代下一次请求/受控步骤的实时AuthorizeWorkspace调用。
func GetAgentWorkspaceAccess(c *gin.Context) (*agent.WorkspaceAccess, bool) {
	value, exists := c.Get(agentWorkspaceAccessContextKey)
	if !exists {
		return nil, false
	}
	access, valid := value.(agent.WorkspaceAccess)
	if !valid {
		return nil, false
	}
	return &access, true
}
