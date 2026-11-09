package agentdefinition

import (
	"net/http"
	"net/url"
	"strconv"

	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

type EditorHandlers struct {
	bind func(model.AuthSessionIdentity) application.EditorRepository
}

func NewEditorHandlers(bind func(model.AuthSessionIdentity) application.EditorRepository) EditorHandlers {
	return EditorHandlers{bind: bind}
}

func (handler EditorHandlers) Validate(c *gin.Context) {
	identity, workspaceID, agentID, err := draftRequestScope(c, true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	fields, err := agentapi.ReadJSONObject(c, "draft_revision")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	revision, err := agentapi.ParseJSONRevision(fields["draft_revision"])
	if err != nil {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("draft_revision", "Draft revision must be a positive safe JSON integer"))
		return
	}
	report, err := application.ValidateStoredDraft(c.Request.Context(), workspaceID, agentID, revision, handler.bind(identity))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", struct {
		ID            string                        `json:"id"`
		DraftRevision int64                         `json:"draft_revision"`
		Valid         bool                          `json:"valid"`
		Errors        []application.ValidationIssue `json:"errors"`
		Warnings      []application.ValidationIssue `json:"warnings"`
	}{ID: strconv.FormatInt(report.AgentID, 10), DraftRevision: report.DraftRevision, Valid: report.Valid, Errors: report.Errors, Warnings: report.Warnings})
}

func (handler EditorHandlers) ModelOptions(c *gin.Context) {
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
	if err != nil {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("query", "Query encoding is invalid"))
		return
	}
	query := ""
	if value, provided := values["q"]; provided {
		if len(value) != 1 {
			agentapi.WriteError(c, agenttypes.NewInvalidArgument("q", "Model filter must have one value"))
			return
		}
		query = value[0]
		delete(values, "q")
	}
	if _, supplied := values["sort"]; supplied {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("sort", "Model options use a fixed model-name order"))
		return
	}
	page, err := agentapi.ParsePageQuery(values)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := application.ListModelOptions(c.Request.Context(), workspaceID, page, query, handler.bind(identity))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", result)
}
