package agentdefinition

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

type LifecycleHandlers struct {
	bind func(model.AuthSessionIdentity) application.LifecycleRepository
}

func NewLifecycleHandlers(bind func(model.AuthSessionIdentity) application.LifecycleRepository) LifecycleHandlers {
	return LifecycleHandlers{bind: bind}
}

func (handler LifecycleHandlers) Restore(c *gin.Context) {
	request, err := readLifecycleRequest(c, "version_id", "expected_revision")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	versionID, err := agentapi.ParseJSONID(request.fields["version_id"])
	if err != nil {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("version_id", "Version ID must be a canonical positive decimal string"))
		return
	}
	result, err := application.RestoreDraft(c.Request.Context(), request.workspaceID, request.agentID,
		application.RestoreDraftInput{VersionID: versionID, ExpectedRevision: request.revision},
		agentapi.RequestID(c), handler.bind(request.identity))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	writeDraft(c, http.StatusOK, result)
}

func (handler LifecycleHandlers) Activate(c *gin.Context) {
	request, err := readLifecycleRequest(c, "version_id", "expected_revision", "reason")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	versionID, err := agentapi.ParseJSONID(request.fields["version_id"])
	if err != nil {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("version_id", "Version ID must be a canonical positive decimal string"))
		return
	}
	reason, err := lifecycleStringField(request.fields, "reason")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := application.ActivateVersion(c.Request.Context(), request.workspaceID, request.agentID,
		application.ActivateVersionInput{VersionID: versionID, ExpectedRevision: request.revision, Reason: reason},
		agentapi.RequestID(c), handler.bind(request.identity))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	writeLifecycleState(c, result)
}

func (handler LifecycleHandlers) SetStatus(c *gin.Context) {
	request, err := readLifecycleRequest(c, "status", "expected_revision", "reason")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	status, err := lifecycleStringField(request.fields, "status")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	reason, err := lifecycleStringField(request.fields, "reason")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := application.SetStatus(c.Request.Context(), request.workspaceID, request.agentID,
		application.SetStatusInput{Status: status, ExpectedRevision: request.revision, Reason: reason},
		agentapi.RequestID(c), handler.bind(request.identity))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	writeLifecycleState(c, result)
}

func (handler LifecycleHandlers) Archive(c *gin.Context) {
	request, err := readLifecycleRequest(c, "expected_revision", "reason")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	reason, err := lifecycleStringField(request.fields, "reason")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := application.ArchiveDefinition(c.Request.Context(), request.workspaceID, request.agentID,
		application.ArchiveDefinitionInput{ExpectedRevision: request.revision, Reason: reason},
		agentapi.RequestID(c), handler.bind(request.identity))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	writeLifecycleState(c, result)
}

type lifecycleRequest struct {
	identity    model.AuthSessionIdentity
	workspaceID int64
	agentID     int64
	revision    int64
	fields      map[string]common.RawMessage
}

func readLifecycleRequest(c *gin.Context, allowedFields ...string) (lifecycleRequest, error) {
	identity, workspaceID, agentID, err := draftRequestScope(c, true)
	if err != nil {
		return lifecycleRequest{}, err
	}
	fields, err := agentapi.ReadJSONObject(c, allowedFields...)
	if err != nil {
		return lifecycleRequest{}, err
	}
	revision, err := agentapi.ParseJSONRevision(fields["expected_revision"])
	if err != nil {
		return lifecycleRequest{}, err
	}
	return lifecycleRequest{identity: identity, workspaceID: workspaceID, agentID: agentID, revision: revision, fields: fields}, nil
}

func lifecycleStringField(fields map[string]common.RawMessage, field string) (string, error) {
	var value string
	if err := common.Unmarshal(fields[field], &value); err != nil {
		return "", agenttypes.NewInvalidArgument(field, "The field must be a JSON string")
	}
	return value, nil
}

func writeLifecycleState(c *gin.Context, result application.LifecycleResult) {
	if result.AgentID <= 0 || result.Revision <= 0 || result.Revision > agenttypes.MaxSafeInteger ||
		(result.Status != "active" && result.Status != "disabled" && result.Status != "archived") ||
		(result.Status == "archived") != (result.ArchivedAt != nil) ||
		result.ArchivedAt != nil && (*result.ArchivedAt <= 0 || *result.ArchivedAt > agenttypes.MaxSafeInteger) {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
		return
	}
	var currentVersionID *string
	if result.CurrentVersionID != nil {
		if *result.CurrentVersionID <= 0 {
			agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
			return
		}
		id := strconv.FormatInt(*result.CurrentVersionID, 10)
		currentVersionID = &id
	}
	agentapi.WriteSuccess(c, http.StatusOK, "OK", dto.AgentLifecycleState{
		ID: strconv.FormatInt(result.AgentID, 10), Status: result.Status, Revision: result.Revision,
		CurrentVersionID: currentVersionID, ArchivedAt: result.ArchivedAt,
	})
}
