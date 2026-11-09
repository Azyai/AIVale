package agentdefinition

import (
	"net/http"
	"net/url"
	"strconv"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

type ReadHandlers struct {
	bind func(model.AuthSessionIdentity) (application.DefinitionReader, application.DefinitionReadAuthorizer)
}

// NewReadHandlers binds the use case only after the existing management
// middleware has produced a trusted session identity.
func NewReadHandlers(bind func(model.AuthSessionIdentity) (application.DefinitionReader, application.DefinitionReadAuthorizer)) ReadHandlers {
	return ReadHandlers{bind: bind}
}

func (handler ReadHandlers) List(c *gin.Context) {
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
	var filter application.DefinitionFilter
	for _, field := range []struct {
		name  string
		value *string
	}{{"q", &filter.Query}, {"status", &filter.Status}, {"tag", &filter.Tag}} {
		if entries, supplied := values[field.name]; supplied {
			if len(entries) != 1 || (field.name != "q" && entries[0] == "") {
				agentapi.WriteError(c, agenttypes.NewInvalidArgument(field.name, "The filter must have one valid value"))
				return
			}
			*field.value = entries[0]
			delete(values, field.name)
		}
	}
	page, err := agentapi.ParsePageQuery(values)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	reader, authorize := handler.bind(identity)
	result, err := application.ListDefinitions(c.Request.Context(), workspaceID, page, filter, authorize, reader)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	items := make([]dto.AgentDefinitionSummary, 0, len(result.Items))
	for _, item := range result.Items {
		items = append(items, summary(item))
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", agenttypes.Page[dto.AgentDefinitionSummary]{
		Items: items, Total: result.Total, Page: result.Page, PageSize: result.PageSize,
	})
}

func (handler ReadHandlers) Detail(c *gin.Context) {
	identity, authenticated := middleware.GetAgentWorkspaceReadIdentity(c)
	if !authenticated {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.AuthRequired, nil))
		return
	}
	if c.Request.URL.RawQuery != "" || c.Request.URL.ForceQuery {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("query", "Agent detail does not accept query parameters"))
		return
	}
	workspaceID, err := agentapi.ParseID(c.Param("workspace_id"))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	agentID, err := agentapi.ParseID(c.Param("agent_id"))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	reader, authorize := handler.bind(identity)
	result, err := application.GetDefinition(c.Request.Context(), workspaceID, agentID, authorize, reader)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", dto.AgentDefinitionDetail{
		AgentDefinitionSummary: summary(result), Description: result.Description,
		Revision: result.Revision, DraftRevision: result.DraftRevision,
	})
}

func summary(value application.DefinitionMetadata) dto.AgentDefinitionSummary {
	var currentVersion *string
	if value.CurrentVersionID != nil {
		id := strconv.FormatInt(*value.CurrentVersionID, 10)
		currentVersion = &id
	}
	return dto.AgentDefinitionSummary{
		ID: strconv.FormatInt(value.ID, 10), Slug: value.Slug, Name: value.Name, Kind: value.Kind,
		Status: value.Status, Tags: value.Tags, CurrentVersionID: currentVersion, CreatedAt: value.CreatedAt,
		UpdatedAt: value.UpdatedAt, EffectivePermissions: value.EffectivePermissions,
	}
}
