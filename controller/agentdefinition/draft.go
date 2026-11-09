package agentdefinition

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

type DraftHandlers struct {
	bind func(model.AuthSessionIdentity) application.DraftRepository
}

func NewDraftHandlers(bind func(model.AuthSessionIdentity) application.DraftRepository) DraftHandlers {
	return DraftHandlers{bind: bind}
}

func (handler DraftHandlers) Create(c *gin.Context) {
	identity, workspaceID, _, err := draftRequestScope(c, false)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	fields, err := agentapi.ReadJSONObject(c, "name", "description", "kind")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	var input application.CreateDraftInput
	for _, field := range []struct {
		name     string
		value    *string
		optional bool
	}{{"name", &input.Name, false}, {"description", &input.Description, true}, {"kind", &input.Kind, false}} {
		raw, supplied := fields[field.name]
		if !supplied && field.optional {
			continue
		}
		if err := common.Unmarshal(raw, field.value); err != nil {
			agentapi.WriteError(c, agenttypes.NewInvalidArgument(field.name, "The field must be a JSON string"))
			return
		}
	}
	input.IdempotencyKey, err = agentapi.ReadIdempotencyKey(c)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := application.CreateDraft(c.Request.Context(), workspaceID, input, agentapi.RequestID(c), handler.bind(identity))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if result.Config != nil || result.Revision != 1 || result.IdempotencyExpiresAt <= 0 || result.IdempotencyExpiresAt > agenttypes.MaxSafeInteger {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
		return
	}
	c.Header("Idempotency-Key-Expires-At", strconv.FormatInt(result.IdempotencyExpiresAt, 10))
	writeDraft(c, http.StatusCreated, result)
}

func (handler DraftHandlers) Get(c *gin.Context) {
	identity, workspaceID, agentID, err := draftRequestScope(c, true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if c.Request.URL.RawQuery != "" || c.Request.URL.ForceQuery {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("query", "Agent draft does not accept query parameters"))
		return
	}
	result, err := application.GetDraft(c.Request.Context(), workspaceID, agentID, handler.bind(identity))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	writeDraft(c, http.StatusOK, result)
}

func (handler DraftHandlers) Update(c *gin.Context) {
	identity, workspaceID, agentID, err := draftRequestScope(c, true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	fields, err := agentapi.ReadJSONObject(c, "expected_revision", "config")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	revision, err := agentapi.ParseJSONRevision(fields["expected_revision"])
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	input := application.UpdateDraftInput{ExpectedRevision: revision, Config: fields["config"]}
	result, err := application.UpdateDraft(c.Request.Context(), workspaceID, agentID, input, agentapi.RequestID(c), handler.bind(identity))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	writeDraft(c, http.StatusOK, result)
}

func draftRequestScope(c *gin.Context, withAgent bool) (model.AuthSessionIdentity, int64, int64, error) {
	identity, authenticated := middleware.GetAgentWorkspaceReadIdentity(c)
	if !authenticated {
		return model.AuthSessionIdentity{}, 0, 0, agenttypes.NewError(agenttypes.AuthRequired, nil)
	}
	workspaceID, err := agentapi.ParseID(c.Param("workspace_id"))
	if err != nil || !withAgent {
		return identity, workspaceID, 0, err
	}
	agentID, err := agentapi.ParseID(c.Param("agent_id"))
	return identity, workspaceID, agentID, err
}

func writeDraft(c *gin.Context, status int, result application.DraftResult) {
	if result.AgentID <= 0 || result.Revision < 1 || result.Revision > agenttypes.MaxSafeInteger {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
		return
	}
	agentapi.WriteSuccess(c, status, "OK", dto.AgentDefinitionDraft{
		ID: strconv.FormatInt(result.AgentID, 10), Revision: result.Revision, Config: result.Config,
	})
}
