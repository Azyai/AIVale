package agentdefinition

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

type PublishHandlers struct {
	bind func(model.AuthSessionIdentity) application.PublishRepository
}

func NewPublishHandlers(bind func(model.AuthSessionIdentity) application.PublishRepository) PublishHandlers {
	return PublishHandlers{bind: bind}
}

func (handler PublishHandlers) Publish(c *gin.Context) {
	identity, workspaceID, agentID, err := draftRequestScope(c, true)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	fields, err := agentapi.ReadJSONObject(c, "draft_revision", "release_note")
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	revision, err := agentapi.ParseJSONRevision(fields["draft_revision"])
	if err != nil {
		agentapi.WriteError(c, agenttypes.NewInvalidArgument("draft_revision", "Draft revision must be a positive safe JSON integer"))
		return
	}
	input := application.PublishInput{DraftRevision: revision}
	if raw, supplied := fields["release_note"]; supplied {
		if err := common.Unmarshal(raw, &input.ReleaseNote); err != nil {
			agentapi.WriteError(c, agenttypes.NewInvalidArgument("release_note", "Release note must be a JSON string"))
			return
		}
	}
	input.IdempotencyKey, err = agentapi.ReadIdempotencyKey(c)
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	result, err := application.Publish(c.Request.Context(), workspaceID, agentID, input, agentapi.RequestID(c), handler.bind(identity))
	if err != nil {
		agentapi.WriteError(c, err)
		return
	}
	version := result.Version
	if version.ID <= 0 || version.AgentID != agentID || version.VersionKind != "release" ||
		version.VersionNo <= 0 || version.VersionNo > agenttypes.MaxSafeInteger ||
		version.SourceDraftRevision <= 0 || version.SourceDraftRevision > agenttypes.MaxSafeInteger ||
		version.PublishedAt <= 0 || version.PublishedAt > agenttypes.MaxSafeInteger ||
		len(version.ConfigHash) != 64 || strings.Trim(version.ConfigHash, "0123456789abcdef") != "" ||
		result.IdempotencyExpiresAt <= 0 || result.IdempotencyExpiresAt > agenttypes.MaxSafeInteger {
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
		return
	}
	c.Header("Idempotency-Key-Expires-At", strconv.FormatInt(result.IdempotencyExpiresAt, 10))
	agentapi.WriteSuccess(c, http.StatusCreated, "OK", dto.AgentPublishedVersion{
		ID: strconv.FormatInt(version.ID, 10), AgentID: strconv.FormatInt(version.AgentID, 10),
		VersionNo: version.VersionNo, VersionKind: version.VersionKind,
		SourceDraftRevision: version.SourceDraftRevision, ConfigHash: version.ConfigHash, PublishedAt: version.PublishedAt,
	})
}
