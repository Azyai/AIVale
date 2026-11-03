package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/service/agent"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

func CreateAgentWorkspace(c *gin.Context) {
	identity, authenticated := middleware.GetAgentWorkspaceReadIdentity(c)
	if !authenticated {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.AuthRequired, nil))
		return
	}
	fields, err := agentapi.ReadJSONObject(c, "name", "description", "slug")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	name, _, err := agentWorkspaceWriteString(fields, "name", true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	description, _, err := agentWorkspaceWriteString(fields, "description", false)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	slug, hasSlug, err := agentWorkspaceWriteString(fields, "slug", false)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if hasSlug && slug == "" {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("slug", "A supplied slug must not be empty"))
		return
	}
	key, err := agentapi.ReadIdempotencyKey(c)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := agent.CreateWorkspace(c.Request.Context(), model.DB, identity,
		agent.CreateWorkspaceInput{Name: name, Description: description, Slug: slug, IdempotencyKey: key}, agentapi.RequestID(c))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	payload, err := newAgentWorkspaceCreateReceipt(result)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	c.Header("Idempotency-Key-Expires-At", strconv.FormatInt(result.IdempotencyExpiresAt, 10))
	agentapi.WriteSuccess(c, http.StatusCreated, "OK", payload)
}

func UpdateAgentWorkspace(c *gin.Context) {
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
	fields, err := agentapi.ReadJSONObject(c, "name", "description", "expected_revision")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	name, hasName, err := agentWorkspaceWriteString(fields, "name", false)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	description, hasDescription, err := agentWorkspaceWriteString(fields, "description", false)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if !hasName && !hasDescription {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("body", "At least one editable field is required"))
		return
	}
	revision, err := agentapi.ParseJSONRevision(fields["expected_revision"])
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	input := agent.UpdateWorkspaceInput{ExpectedRevision: revision}
	if hasName {
		input.Name = &name
	}
	if hasDescription {
		input.Description = &description
	}
	result, err := agent.UpdateWorkspace(c.Request.Context(), model.DB, identity, workspaceID, input, agentapi.RequestID(c))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if result == nil || result.Workspace == nil || result.Workspace.ID != workspaceID {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
		return
	}
	payload, err := newAgentWorkspaceDetail(result.Workspace)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", payload)
}

func ArchiveAgentWorkspace(c *gin.Context) {
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
	fields, err := agentapi.ReadJSONObject(c, "expected_revision", "reason")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	revision, err := agentapi.ParseJSONRevision(fields["expected_revision"])
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	reason, _, err := agentWorkspaceWriteString(fields, "reason", true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	key, err := agentapi.ReadIdempotencyKey(c)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := agent.ArchiveWorkspace(c.Request.Context(), model.DB, identity, workspaceID,
		agent.ArchiveWorkspaceInput{Reason: reason, ExpectedRevision: revision, IdempotencyKey: key}, agentapi.RequestID(c))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if result == nil || result.ID != workspaceID || result.Status != "archived" || result.Revision < 1 || result.Revision > agenttypes.MaxSafeInteger ||
		result.ArchivedAt < 1 || result.ArchivedAt > agenttypes.MaxSafeInteger || result.IdempotencyExpiresAt < 1 || result.IdempotencyExpiresAt > agenttypes.MaxSafeInteger {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
		return
	}
	payload := dto.AgentWorkspaceArchiveReceipt{ID: strconv.FormatInt(result.ID, 10), Status: result.Status, Revision: result.Revision, ArchivedAt: result.ArchivedAt, BlockingRunCount: 0}
	c.Header("Idempotency-Key-Expires-At", strconv.FormatInt(result.IdempotencyExpiresAt, 10))
	agentapi.WriteSuccess(c, http.StatusOK, "OK", payload)
}

func agentWorkspaceWriteString(fields map[string]common.RawMessage, field string, required bool) (string, bool, error) {
	raw, present := fields[field]
	if !present {
		if required {
			return "", false, agenttypes.NewInvalidArgument(field, "This field is required")
		}
		return "", false, nil
	}
	var value string
	if common.GetJsonType(raw) != "string" || common.Unmarshal(raw, &value) != nil {
		return "", true, agenttypes.NewInvalidArgument(field, "This field must be a JSON string")
	}
	return value, true, nil
}

func newAgentWorkspaceCreateReceipt(value *agent.WriteWorkspaceResult) (dto.AgentWorkspaceCreateReceipt, error) {
	if value == nil || value.ID <= 0 || value.Status != "active" || value.Revision != 1 ||
		value.CreatedAt < 1 || value.CreatedAt > agenttypes.MaxSafeInteger || value.IdempotencyExpiresAt < 1 || value.IdempotencyExpiresAt > agenttypes.MaxSafeInteger ||
		len(value.Slug) < 1 || len(value.Slug) > 64 {
		return dto.AgentWorkspaceCreateReceipt{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	for index, character := range []byte(value.Slug) {
		if (character < 'a' || character > 'z') && (character < '0' || character > '9') &&
			(index == 0 || character != '_' && character != '-') {
			return dto.AgentWorkspaceCreateReceipt{}, agenttypes.NewError(agenttypes.InternalError, nil)
		}
	}
	return dto.AgentWorkspaceCreateReceipt{ID: strconv.FormatInt(value.ID, 10), Slug: value.Slug, Status: value.Status, Revision: value.Revision, CreatedAt: value.CreatedAt}, nil
}
