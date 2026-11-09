package agentdefinition

import (
	"net/http"
	"net/url"
	"strconv"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

type VersionReadHandlers struct {
	bind func(model.AuthSessionIdentity) (application.VersionReader, application.VersionReadAuthorizer)
}

func NewVersionReadHandlers(bind func(model.AuthSessionIdentity) (application.VersionReader, application.VersionReadAuthorizer)) VersionReadHandlers {
	return VersionReadHandlers{bind: bind}
}

func (handler VersionReadHandlers) List(c *gin.Context) {
	identity, workspaceID, agentID, err := draftRequestScope(c, true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	values, err := url.ParseQuery(c.Request.URL.RawQuery)
	if err != nil {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("query", "Query encoding is invalid"))
		return
	}
	page, err := agentapi.ParsePageQuery(values)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	reader, authorize := handler.bind(identity)
	result, err := application.ListVersions(c.Request.Context(), workspaceID, agentID, page, authorize, reader)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	items := make([]dto.AgentVersionSummary, 0, len(result.Items))
	for _, item := range result.Items {
		items = append(items, versionSummary(item))
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", agenttypes.Page[dto.AgentVersionSummary]{Items: items, Total: result.Total, Page: result.Page, PageSize: result.PageSize})
}

func (handler VersionReadHandlers) Detail(c *gin.Context) {
	identity, workspaceID, agentID, err := draftRequestScope(c, true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	if c.Request.URL.RawQuery != "" || c.Request.URL.ForceQuery {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("query", "Version detail does not accept query parameters"))
		return
	}
	versionID, err := agentapi.ParseID(c.Param("version_id"))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	reader, authorize := handler.bind(identity)
	result, err := application.GetVersion(c.Request.Context(), workspaceID, agentID, versionID, authorize, reader)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", dto.AgentVersionDetail{
		AgentVersionSummary: versionSummary(result.VersionMetadata), Config: result.Config, ReleaseNote: result.ReleaseNote,
		ValidationSummary: dto.AgentVersionValidationSummary{SchemaVersion: 1, ConfigHashVerified: true},
	})
}

func versionSummary(value application.VersionMetadata) dto.AgentVersionSummary {
	return dto.AgentVersionSummary{
		ID: strconv.FormatInt(value.ID, 10), AgentID: strconv.FormatInt(value.AgentID, 10),
		VersionNo: value.VersionNo, VersionKind: value.VersionKind, SourceDraftRevision: value.SourceDraftRevision,
		ConfigHash: value.ConfigHash, PublishedAt: value.PublishedAt, RevokedAt: value.RevokedAt,
		PublishedBy: strconv.FormatInt(value.PublishedBy, 10),
	}
}
