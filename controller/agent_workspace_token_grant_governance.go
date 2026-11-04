package controller

import (
	"bytes"
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

func RenewAgentWorkspaceTokenGrant(c *gin.Context) {
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
	fields, err := agentapi.ReadJSONObject(c, "expected_revision", "expires_at")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	revision, err := agentapi.ParseJSONRevision(fields["expected_revision"])
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	expiresAt, err := agentapi.ParseID(string(bytes.TrimSpace(fields["expires_at"])))
	if err != nil || expiresAt > agenttypes.MaxSafeInteger {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("expires_at", "Expiry must be a positive safe JSON integer in UTC milliseconds"))
		return
	}
	key, err := agentapi.ReadIdempotencyKey(c)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := agent.RenewTokenGrant(c.Request.Context(), model.DB, identity, workspaceID, grantID,
		agent.RenewTokenGrantInput{ExpectedRevision: revision, ExpiresAt: expiresAt, IdempotencyKey: key}, agentapi.RequestID(c))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if result == nil || result.Grant.ID != grantID || result.Grant.ResourceID != workspaceID ||
		result.Grant.Status != model.AgentTokenGrantStatusActive || result.Grant.Revision != revision+1 ||
		result.Grant.ExpiresAt == nil || *result.Grant.ExpiresAt != expiresAt || result.HTTPStatus != http.StatusOK ||
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
	agentapi.WriteSuccess(c, http.StatusOK, "OK", payload)
}

func GetAgentWorkspaceTokenGrantPermissions(c *gin.Context) {
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
	if err != nil || c.Request.URL.ForceQuery || len(values) != 1 || len(values["token_id"]) != 1 {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("query", "Permission summary requires only one token_id"))
		return
	}
	tokenID, err := agentapi.ParseID(values["token_id"][0])
	if err != nil {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("token_id", "Token ID must be a canonical positive decimal string"))
		return
	}
	result, err := agent.TokenGrantPermissions(c.Request.Context(), model.DB, identity, workspaceID, tokenID)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if result == nil || result.TokenID != tokenID || len(result.Scopes) > 4 {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
		return
	}
	payload := dto.AgentWorkspaceTokenGrantPermissions{
		TokenID: strconv.FormatInt(tokenID, 10), Scopes: make([]dto.AgentWorkspaceTokenGrantPermission, 0, len(result.Scopes)),
	}
	previous := ""
	for _, item := range result.Scopes {
		if !model.ValidAgentTokenGrantScope(item.Scope) || item.Scope <= previous || item.GrantID <= 0 ||
			item.Revision < 1 || item.Revision > agenttypes.MaxSafeInteger ||
			(item.Revision > 1 && item.ExpiresAt == nil) ||
			(item.ExpiresAt != nil && (*item.ExpiresAt < 1 || *item.ExpiresAt > agenttypes.MaxSafeInteger)) {
			agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
			return
		}
		payload.Scopes = append(payload.Scopes, dto.AgentWorkspaceTokenGrantPermission{
			Scope: item.Scope, GrantID: strconv.FormatInt(item.GrantID, 10), Revision: item.Revision, ExpiresAt: item.ExpiresAt,
		})
		previous = item.Scope
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", payload)
}
