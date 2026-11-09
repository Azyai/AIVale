package agentdefinition

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/agent"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
)

type DraftRepository struct {
	db       *gorm.DB
	identity model.AuthSessionIdentity
}

// NewDraftRepository binds the dashboard management identity from middleware.
func NewDraftRepository(db *gorm.DB, identity model.AuthSessionIdentity) *DraftRepository {
	return &DraftRepository{db: db, identity: identity}
}

var _ application.DraftRepository = (*DraftRepository)(nil)

type draftWorkspace struct {
	tx      *gorm.DB
	facts   *model.AgentWorkspaceWriteFacts
	current *model.AgentDefinition
	audited bool
}

func (repo *DraftRepository) GatewayLimits() application.GatewayLimits {
	return agent.AgentDraftGatewayLimits()
}

func (repo *DraftRepository) WithDraftWorkspace(ctx context.Context, workspaceID int64, apply func(application.DraftWorkspaceTransaction) error) error {
	if repo == nil || apply == nil {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return withDefinitionWorkspace(ctx, repo.db, repo.identity, workspaceID, agent.AuthorizeLockedAgentDraft, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) (bool, error) {
		workspace := &draftWorkspace{tx: tx, facts: facts}
		err := apply(workspace)
		return workspace.audited, err
	})
}

func (workspace *draftWorkspace) LockDraft(agentID int64) (application.StoredDraft, error) {
	record, err := model.LockAgentDraftDefinition(workspace.tx, workspace.facts, agentID)
	if err != nil {
		return application.StoredDraft{}, err
	}
	workspace.current = record
	return application.StoredDraft{
		Name: record.Name, Revision: record.DraftRevision, Config: record.DraftJSON,
		Pending: record.DraftJSON == model.AgentDraftPendingJSON,
	}, nil
}

func (workspace *draftWorkspace) CreatePendingDraft(name, description string) (int64, error) {
	var nonce [16]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return 0, err
	}
	record, err := model.CreateAgentDraftDefinition(workspace.tx, workspace.facts, "agent-"+hex.EncodeToString(nonce[:]), name, description)
	if err != nil {
		return 0, err
	}
	if record.ID <= 0 || record.DraftRevision != 1 || record.DraftJSON != model.AgentDraftPendingJSON {
		return 0, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return record.ID, nil
}

func (workspace *draftWorkspace) ReplaceDraft(agentID, expectedRevision int64, config string) (int64, error) {
	if workspace.current == nil || workspace.current.ID != agentID {
		return 0, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	record, err := model.UpdateLockedAgentDraft(workspace.tx, workspace.facts, workspace.current, expectedRevision, config)
	if err != nil {
		return 0, err
	}
	return record.DraftRevision, nil
}

func (workspace *draftWorkspace) ReadDraftPolicy(ctx context.Context, modelName string) (application.DraftPolicy, error) {
	return agent.ReadLockedAgentDraftPolicy(ctx, workspace.tx, workspace.facts, modelName)
}

func (workspace *draftWorkspace) AuditDraft(operation application.DraftAuditOperation, agentID, previous, revision int64, requestID string) error {
	if err := model.RecordAgentDefinitionAudit(workspace.tx, workspace.facts, agentID, string(operation), previous, revision, requestID); err != nil {
		return err
	}
	workspace.audited = true
	return nil
}

func (workspace *draftWorkspace) FindCreateReceipt(keyDigest, inputDigest string) (*application.DraftCreateReceipt, error) {
	scopeDigest, requestDigest, err := workspace.creationDigests(inputDigest)
	if err != nil {
		return nil, err
	}
	record, err := model.GetAgentIdempotencyKey(workspace.tx, workspace.facts.TeamID, scopeDigest, keyDigest)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if record.TeamID != workspace.facts.TeamID || record.WorkspaceID != workspace.facts.Workspace.ID ||
		record.ScopeHash != scopeDigest || record.KeyHash != keyDigest || record.State != "completed" ||
		record.Operation != string(application.DraftCreated) || record.ResourceType == nil || *record.ResourceType != "agent" ||
		record.ResourceID == nil || *record.ResourceID <= 0 || record.ResponseStatus == nil || *record.ResponseStatus != http.StatusCreated ||
		record.ResponseJSON == nil || record.ExpiresAt <= 0 || record.ExpiresAt > agenttypes.MaxSafeInteger {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	response, err := creationReceiptJSON(*record.ResourceID)
	if err != nil || response != *record.ResponseJSON {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return &application.DraftCreateReceipt{AgentID: *record.ResourceID, ExpiresAt: record.ExpiresAt, RequestMatches: record.RequestHash == requestDigest}, nil
}

func (workspace *draftWorkspace) SaveCreateReceipt(keyDigest, inputDigest string, agentID int64) (int64, error) {
	scopeDigest, requestDigest, err := workspace.creationDigests(inputDigest)
	if err != nil {
		return 0, err
	}
	response, err := creationReceiptJSON(agentID)
	if err != nil {
		return 0, err
	}
	resourceType, status := "agent", int32(http.StatusCreated)
	record := &model.AgentIdempotencyKey{
		TeamID: workspace.facts.TeamID, WorkspaceID: workspace.facts.Workspace.ID, ScopeHash: scopeDigest,
		KeyHash: keyDigest, RequestHash: requestDigest, Operation: string(application.DraftCreated), State: "completed",
		ResourceType: &resourceType, ResourceID: &agentID, ResponseStatus: &status, ResponseJSON: &response,
	}
	if err := workspace.tx.Create(record).Error; err != nil {
		return 0, err
	}
	return record.ExpiresAt, nil
}

func (workspace *draftWorkspace) creationDigests(inputDigest string) (string, string, error) {
	scope, err := common.Marshal(map[string]string{
		"version": "1", "operation": string(application.DraftCreated),
		"team_id": strconv.FormatInt(workspace.facts.TeamID, 10), "workspace_id": strconv.FormatInt(workspace.facts.Workspace.ID, 10),
		"actor_id": strconv.FormatInt(workspace.facts.UserID, 10),
	})
	if err != nil {
		return "", "", err
	}
	scopeSum := sha256.Sum256(scope)
	scopeDigest := hex.EncodeToString(scopeSum[:])
	requestSum := sha256.Sum256([]byte(scopeDigest + ":" + inputDigest))
	return scopeDigest, hex.EncodeToString(requestSum[:]), nil
}

func creationReceiptJSON(agentID int64) (string, error) {
	wire, err := common.Marshal(struct {
		ID       string                  `json:"id"`
		Revision int64                   `json:"revision"`
		Config   *agenttypes.AgentConfig `json:"config"`
	}{ID: strconv.FormatInt(agentID, 10), Revision: 1})
	return string(wire), err
}
