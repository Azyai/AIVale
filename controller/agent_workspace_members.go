package controller

import (
	"bytes"
	"io"
	"net/http"
	"net/url"
	"strconv"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/service/agent"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

func ListAgentWorkspaceMembers(c *gin.Context) {
	identity, authenticated := middleware.GetAgentWorkspaceReadIdentity(c)
	if !authenticated {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.AuthRequired, nil))
		return
	}
	workspaceID, err := agentapi.ParseID(c.Param("workspace_id"))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	values, err := url.ParseQuery(c.Request.URL.RawQuery)
	if err != nil || c.Request.URL.ForceQuery {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("query", "Query encoding is invalid"))
		return
	}
	if values.Has("sort") {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("query", "Member lists only accept page and page_size"))
		return
	}
	page, err := agentapi.ParsePageQuery(values)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := agent.ListWorkspaceMembers(c.Request.Context(), model.DB, identity, workspaceID, page)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	items := make([]dto.AgentWorkspaceMember, 0, len(result.Items))
	for _, item := range result.Items {
		value, err := newAgentWorkspaceMember(item)
		if err != nil {
			agentapi.WriteError(c, err)
			return
		}
		items = append(items, value)
	}
	payload, err := agenttypes.NewPage(items, result.Total, page)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", payload)
}

func PutAgentWorkspaceMember(c *gin.Context) {
	identity, authenticated := middleware.GetAgentWorkspaceReadIdentity(c)
	if !authenticated {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.AuthRequired, nil))
		return
	}
	workspaceID, userID, err := agentWorkspaceMemberPath(c)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	fields, err := agentapi.ReadJSONObject(c, "role", "expected_revision")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	role, _, err := agentWorkspaceWriteString(fields, "role", true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if agent.WorkspacePermissionForRole(role, agent.WorkspaceRead).Scope == agent.WorkspaceScopeNone {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("role", "Role must be admin, developer, operator or viewer"))
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
	requestID := agentapi.RequestID(c)
	result, err := agent.PutWorkspaceMember(c.Request.Context(), model.DB, identity, workspaceID, userID,
		agent.PutWorkspaceMemberInput{Role: role, ExpectedRevision: revision}, requestID)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if result == nil || result.UserID != userID || result.Role != role || result.Status != model.AgentWorkspaceMemberStatusActive {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
		return
	}
	payload, err := newAgentWorkspaceMember(*result)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", payload)
}

func DeleteAgentWorkspaceMember(c *gin.Context) {
	identity, authenticated := middleware.GetAgentWorkspaceReadIdentity(c)
	if !authenticated {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.AuthRequired, nil))
		return
	}
	workspaceID, userID, err := agentWorkspaceMemberPath(c)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if c.Request.URL.RawQuery != "" || c.Request.URL.ForceQuery {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("query", "This operation does not accept query parameters"))
		return
	}
	// Length is not sufficient for chunked requests. Probe a single byte without
	// retaining or interpreting unexpected input; a read failure is not absence.
	if c.Request.ContentLength > 0 {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("body", "This operation does not accept a request body"))
		return
	}
	if c.Request.Body != nil && c.Request.Body != http.NoBody {
		var probe [1]byte
		if _, err := io.ReadFull(c.Request.Body, probe[:]); err != io.EOF {
			agentapi.WriteError(c, agenttypes.NewInvalidArgument("body", "This operation does not accept a request body"))
			return
		}
	}
	requestID := agentapi.RequestID(c)
	if err := agent.RemoveWorkspaceMember(c.Request.Context(), model.DB, identity, workspaceID, userID, requestID); err != nil {
		agentapi.WriteError(c, err)
		return
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", dto.AgentWorkspaceMemberRemoval{UserID: strconv.FormatInt(userID, 10), Revoked: true})
}

func agentWorkspaceMemberPath(c *gin.Context) (int64, int64, error) {
	workspaceID, err := agentapi.ParseID(c.Param("workspace_id"))
	if err != nil {
		return 0, 0, err
	}
	userID, err := agentapi.ParseID(c.Param("user_id"))
	return workspaceID, userID, err
}

func newAgentWorkspaceMember(value agent.WorkspaceMemberView) (dto.AgentWorkspaceMember, error) {
	if value.UserID <= 0 || value.Revision < 1 || value.Revision > agenttypes.MaxSafeInteger ||
		value.CreatedAt < 1 || value.CreatedAt > agenttypes.MaxSafeInteger || value.UpdatedAt < value.CreatedAt || value.UpdatedAt > agenttypes.MaxSafeInteger ||
		(value.Status != model.AgentWorkspaceMemberStatusActive && value.Status != model.AgentWorkspaceMemberStatusBlocked) ||
		agent.WorkspacePermissionForRole(value.Role, agent.WorkspaceRead).Scope == agent.WorkspaceScopeNone {
		return dto.AgentWorkspaceMember{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return dto.AgentWorkspaceMember{UserID: strconv.FormatInt(value.UserID, 10), Role: value.Role, Status: value.Status,
		Revision: value.Revision, CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}, nil
}
