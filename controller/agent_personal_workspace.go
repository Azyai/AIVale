package controller

import (
	"bytes"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/service/agent"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

type agentPersonalWorkspaceResponse struct {
	Workspace *agentPersonalWorkspaceView `json:"workspace"`
}

type agentPersonalWorkspaceView struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Revision    int64  `json:"revision"`
	UpdatedAt   int64  `json:"updated_at"`
}

func GetAgentPersonalWorkspace(c *gin.Context) {
	identity, ok := agentPersonalWorkspaceIdentity(c)
	if !ok {
		return
	}
	if c.Request.URL.RawQuery != "" || c.Request.URL.ForceQuery {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("query", "This operation does not accept query parameters"))
		return
	}
	workspace, err := agent.ReadPersonalWorkspace(c.Request.Context(), model.DB, identity)
	writeAgentPersonalWorkspace(c, workspace, err)
}

func PutAgentPersonalWorkspace(c *gin.Context) {
	identity, ok := agentPersonalWorkspaceIdentity(c)
	if !ok {
		return
	}
	fields, err := agentapi.ReadJSONObject(c, "name", "description", "expected_revision")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	name, _, err := agentWorkspaceWriteString(fields, "name", true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	description, _, err := agentWorkspaceWriteString(fields, "description", true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	var revision int64
	rawRevision := bytes.TrimSpace(fields["expected_revision"])
	if !bytes.Equal(rawRevision, []byte("0")) {
		revision, err = agentapi.ParseJSONRevision(rawRevision)
		if err != nil {
			agentapi.WriteError(c, agenttypes.NewInvalidArgument("expected_revision", "Expected revision must be a canonical nonnegative safe JSON integer"))
			return
		}
	}
	workspace, err := agent.SavePersonalWorkspace(c.Request.Context(), model.DB, identity, name, description, revision)
	writeAgentPersonalWorkspace(c, workspace, err)
}

func agentPersonalWorkspaceIdentity(c *gin.Context) (model.AuthSessionIdentity, bool) {
	// The shared management guard validates the session. This endpoint also
	// requires one explicit Bearer header; ambient credentials are insufficient.
	identity, authenticated := middleware.GetAgentWorkspaceReadIdentity(c)
	values := c.Request.Header.Values("Authorization")
	if authenticated && len(values) == 1 {
		parts := strings.Fields(values[0])
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			return identity, true
		}
	}
	agentapi.WriteError(c, agenttypes.NewError(agenttypes.AuthRequired, nil))
	return model.AuthSessionIdentity{}, false
}

func writeAgentPersonalWorkspace(c *gin.Context, workspace *model.AgentPersonalWorkspace, err error) {
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	var result agentPersonalWorkspaceResponse
	if workspace != nil {
		result.Workspace = &agentPersonalWorkspaceView{
			Name: workspace.Name, Description: workspace.Description, Revision: workspace.Revision, UpdatedAt: workspace.UpdatedAt,
		}
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", result)
}
