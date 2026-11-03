package middleware

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

const (
	agentWorkspaceAuthWriterKey   = "agent_workspace_auth_writer"
	agentWorkspaceReadIdentityKey = "agent_workspace_read_identity"
)

// AgentWorkspaceManagementAuth reuses UserAuth unchanged. Its first and final
// handlers adapt only authentication failures to the Agent wire contract; the
// original writer is restored before any business handler can write a response.
func AgentWorkspaceManagementAuth() []gin.HandlerFunc {
	return []gin.HandlerFunc{agentWorkspaceAuthEnvelope, UserAuth(), agentWorkspaceReadSession}
}

// agentWorkspaceAuthWriter discards only writes made by the authentication
// phase. It never stores a token, old error body, or downstream business output.
type agentWorkspaceAuthWriter struct {
	gin.ResponseWriter
	status int
	size   int
}

func (writer *agentWorkspaceAuthWriter) WriteHeader(status int) { writer.status = status }
func (writer *agentWorkspaceAuthWriter) WriteHeaderNow() {
	if writer.size < 0 {
		writer.size = 0
	}
}
func (writer *agentWorkspaceAuthWriter) Written() bool { return writer.size >= 0 }
func (writer *agentWorkspaceAuthWriter) Status() int   { return writer.status }
func (writer *agentWorkspaceAuthWriter) Size() int     { return writer.size }
func (writer *agentWorkspaceAuthWriter) Write(data []byte) (int, error) {
	writer.WriteHeaderNow()
	writer.size += len(data)
	return len(data), nil
}
func (writer *agentWorkspaceAuthWriter) WriteString(value string) (int, error) {
	return writer.Write([]byte(value))
}
func (writer *agentWorkspaceAuthWriter) Flush() { writer.WriteHeaderNow() }

func agentWorkspaceAuthEnvelope(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	original := c.Writer
	writer := &agentWorkspaceAuthWriter{ResponseWriter: original, status: http.StatusOK, size: -1}
	c.Set(agentWorkspaceReadIdentityKey, nil)
	c.Set(agentWorkspaceAuthWriterKey, writer)
	c.Writer = writer
	defer func() {
		if c.Writer == writer {
			c.Writer = original
			c.Set(agentWorkspaceAuthWriterKey, nil)
		}
	}()
	c.Next()
	if c.Writer != writer {
		return // the authenticated continuation restored the real writer.
	}
	c.Writer = original
	c.Set(agentWorkspaceAuthWriterKey, nil)
	code := agenttypes.AuthRequired
	if writer.status >= http.StatusInternalServerError || writer.status < http.StatusBadRequest {
		code = agenttypes.InternalError
	}
	agentapi.WriteError(c, agenttypes.NewError(code, nil))
}

func agentWorkspaceReadSession(c *gin.Context) {
	value, exists := c.Get(agentWorkspaceAuthWriterKey)
	writer, valid := value.(*agentWorkspaceAuthWriter)
	if !exists || !valid || c.Writer != writer {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
		return
	}
	c.Writer = writer.ResponseWriter
	c.Set(agentWorkspaceAuthWriterKey, nil)
	if writer.Written() {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
		return
	}
	trusted, authenticated := GetAuthIdentity(c)
	identity, session := GetSessionAuthIdentity(c)
	if !authenticated || !session || trusted != identity || c.GetBool("use_access_token") || strings.HasPrefix(identity.SessionID, "pat:") {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.AuthRequired, nil))
		return
	}
	c.Set(agentWorkspaceReadIdentityKey, identity)
	c.Next()
}

// GetAgentWorkspaceReadIdentity accepts only this chain's typed session result,
// never user_id/team_id/body fields. Services still revalidate current DB facts.
func GetAgentWorkspaceReadIdentity(c *gin.Context) (model.AuthSessionIdentity, bool) {
	value, exists := c.Get(agentWorkspaceReadIdentityKey)
	identity, valid := value.(model.AuthSessionIdentity)
	return identity, exists && valid
}
