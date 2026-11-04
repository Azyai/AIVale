package controller

import (
	"bytes"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/service/agent"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

func ListAgentWorkspaceTokenGrants(c *gin.Context) {
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
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("query", "Token grant lists only accept token_id, page and page_size"))
		return
	}
	if len(values["token_id"]) != 1 {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("token_id", "One token ID is required"))
		return
	}
	tokenID, err := agentapi.ParseID(values["token_id"][0])
	if err != nil {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("token_id", "Token ID must be a canonical positive decimal string"))
		return
	}
	values.Del("token_id")
	page, err := agentapi.ParsePageQuery(values)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := agent.ListTokenGrants(c.Request.Context(), model.DB, identity, workspaceID, tokenID, page)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	items := make([]dto.AgentWorkspaceTokenGrant, 0, len(result.Items))
	for _, item := range result.Items {
		if item.TokenID != tokenID || item.ResourceID != workspaceID {
			agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
			return
		}
		value, err := newAgentWorkspaceTokenGrant(item)
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

func CreateAgentWorkspaceTokenGrant(c *gin.Context) {
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
	fields, err := agentapi.ReadJSONObject(c, "token_id", "scope", "resource_type", "resource_id", "expires_at")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	tokenID, err := agentapi.ParseJSONID(fields["token_id"])
	if err != nil {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("token_id", "Token ID must be a canonical positive decimal string"))
		return
	}
	resourceID, err := agentapi.ParseJSONID(fields["resource_id"])
	if err != nil || resourceID != workspaceID {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("resource_id", "Resource ID must match the workspace path"))
		return
	}
	resourceType, _, err := agentWorkspaceWriteString(fields, "resource_type", true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if resourceType != model.AgentTokenGrantResourceWorkspace {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("resource_type", "Only workspace grants are supported"))
		return
	}
	scope, _, err := agentWorkspaceWriteString(fields, "scope", true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if !model.ValidAgentTokenGrantScope(scope) {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("scope", "Unsupported token grant scope"))
		return
	}
	var expiresAt *int64
	if raw, present := fields["expires_at"]; present {
		millis, err := agentapi.ParseID(string(bytes.TrimSpace(raw)))
		if err != nil || millis > agenttypes.MaxSafeInteger {
			agentapi.WriteError(c, agenttypes.NewInvalidArgument("expires_at", "Expiry must be a positive safe JSON integer in UTC milliseconds"))
			return
		}
		expiresAt = &millis
	}
	key, err := agentapi.ReadIdempotencyKey(c)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := agent.CreateTokenGrant(c.Request.Context(), model.DB, identity, workspaceID,
		agent.CreateTokenGrantInput{TokenID: tokenID, ResourceID: resourceID, Scope: scope, ResourceType: resourceType, ExpiresAt: expiresAt, IdempotencyKey: key}, agentapi.RequestID(c))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if result == nil || result.Grant.TokenID != tokenID || result.Grant.ResourceID != resourceID || result.Grant.Scope != scope || result.Grant.Status != model.AgentTokenGrantStatusActive ||
		(result.HTTPStatus != http.StatusCreated && result.HTTPStatus != http.StatusOK) ||
		result.IdempotencyExpiresAt < 1 || result.IdempotencyExpiresAt > agenttypes.MaxSafeInteger {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
		return
	}
	payload, err := newAgentWorkspaceTokenGrant(result.Grant)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	c.Header("Idempotency-Key-Expires-At", strconv.FormatInt(result.IdempotencyExpiresAt, 10))
	agentapi.WriteSuccess(c, result.HTTPStatus, "OK", payload)
}

func RevokeAgentWorkspaceTokenGrant(c *gin.Context) {
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
	grantID, err := agentapi.ParseID(c.Param("grant_id"))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	fields, err := agentapi.ReadJSONObject(c, "reason")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	reason, _, err := agentWorkspaceWriteString(fields, "reason", true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := agent.RevokeTokenGrant(c.Request.Context(), model.DB, identity, workspaceID, grantID, strings.TrimSpace(reason), agentapi.RequestID(c))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if result == nil || result.ID != grantID || result.ResourceID != workspaceID || result.Status != model.AgentTokenGrantStatusRevoked {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
		return
	}
	value, err := newAgentWorkspaceTokenGrant(*result)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	payload := dto.AgentWorkspaceTokenGrantRevocation{ID: value.ID, Status: value.Status, Revision: value.Revision, RevokedAt: *value.RevokedAt}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", payload)
}

func newAgentWorkspaceTokenGrant(value agent.TokenGrantView) (dto.AgentWorkspaceTokenGrant, error) {
	if value.ID <= 0 || value.TokenID <= 0 || value.ResourceID <= 0 || value.ResourceType != model.AgentTokenGrantResourceWorkspace || !model.ValidAgentTokenGrantScope(value.Scope) ||
		value.Revision < 1 || value.Revision > agenttypes.MaxSafeInteger || value.CreatedAt < 1 || value.UpdatedAt < value.CreatedAt || value.UpdatedAt > agenttypes.MaxSafeInteger ||
		(value.ExpiresAt != nil && (*value.ExpiresAt <= value.CreatedAt || *value.ExpiresAt > agenttypes.MaxSafeInteger)) {
		return dto.AgentWorkspaceTokenGrant{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	switch value.Status {
	case model.AgentTokenGrantStatusActive:
		if value.RevokedAt != nil {
			return dto.AgentWorkspaceTokenGrant{}, agenttypes.NewError(agenttypes.InternalError, nil)
		}
	case model.AgentTokenGrantStatusRevoked:
		if value.RevokedAt == nil || *value.RevokedAt < value.CreatedAt || *value.RevokedAt > value.UpdatedAt {
			return dto.AgentWorkspaceTokenGrant{}, agenttypes.NewError(agenttypes.InternalError, nil)
		}
	default:
		return dto.AgentWorkspaceTokenGrant{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return dto.AgentWorkspaceTokenGrant{
		ID: strconv.FormatInt(value.ID, 10), TokenID: strconv.FormatInt(value.TokenID, 10), Scope: value.Scope,
		ResourceType: value.ResourceType, ResourceID: strconv.FormatInt(value.ResourceID, 10), Status: value.Status,
		ExpiresAt: value.ExpiresAt, Revision: value.Revision, CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt, RevokedAt: value.RevokedAt,
	}, nil
}
