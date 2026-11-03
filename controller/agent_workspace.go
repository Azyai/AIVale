package controller

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/service/agent"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

func ListAgentWorkspaces(c *gin.Context) {
	identity, authenticated := middleware.GetAgentWorkspaceReadIdentity(c)
	if !authenticated {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.AuthRequired, nil))
		return
	}
	values, err := url.ParseQuery(c.Request.URL.RawQuery)
	if err != nil {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("query", "Query encoding is invalid"))
		return
	}
	q := ""
	if entries, present := values["q"]; present {
		if len(entries) != 1 {
			agentapi.WriteError(c, agenttypes.NewInvalidArgument("q", "Name filter must have one value"))
			return
		}
		q = entries[0]
		delete(values, "q")
	}
	page, err := agentapi.ParsePageQuery(values)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := agent.ListWorkspaces(c.Request.Context(), model.DB, identity, page, q)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	payload, err := newAgentWorkspaceList(result)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", payload)
}

func GetAgentWorkspace(c *gin.Context) {
	identity, authenticated := middleware.GetAgentWorkspaceReadIdentity(c)
	if !authenticated {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.AuthRequired, nil))
		return
	}
	values, err := url.ParseQuery(c.Request.URL.RawQuery)
	if err != nil || len(values) != 0 || c.Request.URL.RawQuery != "" {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("query", "Workspace detail does not accept query parameters"))
		return
	}
	workspaceID, err := agentapi.ParseID(c.Param("workspace_id"))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := agent.GetWorkspace(c.Request.Context(), model.DB, identity, workspaceID)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	payload, err := newAgentWorkspaceDetail(result)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", payload)
}

func agentWorkspaceSummary(value agent.WorkspaceView) (dto.AgentWorkspaceSummary, error) {
	if value.ID <= 0 || value.CreatedAt < 0 || value.CreatedAt > agenttypes.MaxSafeInteger ||
		value.UpdatedAt < 0 || value.UpdatedAt > agenttypes.MaxSafeInteger || value.Revision < 1 || value.Revision > agenttypes.MaxSafeInteger ||
		!utf8.ValidString(value.Name) || value.Name == "" || utf8.RuneCountInString(value.Name) > 128 || strings.ContainsRune(value.Name, 0) ||
		len(value.Slug) == 0 || len(value.Slug) > 64 ||
		(value.Status != "active" && value.Status != "suspended") {
		return dto.AgentWorkspaceSummary{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	for index, character := range []byte(value.Slug) {
		if (character < 'a' || character > 'z') && (character < '0' || character > '9') &&
			(index == 0 || (character != '_' && character != '-')) {
			return dto.AgentWorkspaceSummary{}, agenttypes.NewError(agenttypes.InternalError, nil)
		}
	}
	if agent.WorkspacePermissionForRole(value.Role, agent.WorkspaceRead).Scope == agent.WorkspaceScopeNone {
		return dto.AgentWorkspaceSummary{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	permissions := make([]string, 0, len(value.EffectivePermissions))
	seen := make(map[agent.WorkspaceAction]bool, len(value.EffectivePermissions))
	for _, action := range value.EffectivePermissions {
		permission := agent.WorkspacePermissionForRole(value.Role, action)
		if permission.Scope == agent.WorkspaceScopeNone || permission.RequiresResourceCheck || seen[action] {
			return dto.AgentWorkspaceSummary{}, agenttypes.NewError(agenttypes.InternalError, nil)
		}
		seen[action] = true
		permissions = append(permissions, string(action))
	}
	approved := agent.WorkspaceEffectivePermissions(value.Role, value.Status)
	if len(approved) != len(permissions) || !seen[agent.WorkspaceRead] {
		return dto.AgentWorkspaceSummary{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	for _, action := range approved {
		if !seen[action] {
			return dto.AgentWorkspaceSummary{}, agenttypes.NewError(agenttypes.InternalError, nil)
		}
	}
	return dto.AgentWorkspaceSummary{ID: strconv.FormatInt(value.ID, 10), Slug: value.Slug, Name: value.Name, Status: value.Status,
		CurrentRole: value.Role, CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt, Revision: value.Revision, EffectivePermissions: permissions}, nil
}

func newAgentWorkspaceList(value *agent.WorkspaceList) (dto.AgentWorkspaceList, error) {
	if value == nil || value.Total < 0 || value.Total > agenttypes.MaxSafeInteger || value.Page < 1 || value.Page > agenttypes.MaxSafeInteger ||
		value.PageSize < 1 || value.PageSize > 100 || len(value.Items) > value.PageSize || value.Total < int64(len(value.Items)) ||
		(value.NoTeam && (value.Total != 0 || len(value.Items) != 0)) {
		return dto.AgentWorkspaceList{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	result := dto.AgentWorkspaceList{Items: make([]dto.AgentWorkspaceSummary, 0, len(value.Items)), Total: value.Total, Page: value.Page, PageSize: value.PageSize}
	for _, item := range value.Items {
		projected, err := agentWorkspaceSummary(item)
		if err != nil {
			return dto.AgentWorkspaceList{}, err
		}
		result.Items = append(result.Items, projected)
	}
	if len(result.Items) == 0 {
		reason := "no_results"
		if value.NoTeam {
			reason = "no_team"
		} else if value.Total > 0 {
			reason = "page_out_of_range"
		}
		result.EmptyReason = &reason
	}
	return result, nil
}

func newAgentWorkspaceDetail(value *agent.WorkspaceView) (dto.AgentWorkspaceDetail, error) {
	if value == nil || !utf8.ValidString(value.Description) || len(value.Description) > 4096 || strings.ContainsRune(value.Description, 0) {
		return dto.AgentWorkspaceDetail{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	summary, err := agentWorkspaceSummary(*value)
	if err != nil {
		return dto.AgentWorkspaceDetail{}, err
	}
	return dto.AgentWorkspaceDetail{AgentWorkspaceSummary: summary, Description: value.Description}, nil
}
