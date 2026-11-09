package agentdefinition

import (
	"context"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/agent"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
)

type EditorRepository struct {
	db       *gorm.DB
	identity model.AuthSessionIdentity
}

func NewEditorRepository(db *gorm.DB, identity model.AuthSessionIdentity) *EditorRepository {
	return &EditorRepository{db: db, identity: identity}
}

var _ application.EditorRepository = (*EditorRepository)(nil)

type editorWorkspace struct {
	*draftWorkspace
}

func (repo *EditorRepository) GatewayLimits() application.GatewayLimits {
	return agent.AgentDraftGatewayLimits()
}

func (repo *EditorRepository) WithEditorWorkspace(ctx context.Context, workspaceID int64, apply func(application.EditorTransaction) error) error {
	if repo == nil || apply == nil {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return withDefinitionWorkspace(ctx, repo.db, repo.identity, workspaceID, agent.AuthorizeLockedAgentDraft, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) (bool, error) {
		return false, apply(&editorWorkspace{draftWorkspace: &draftWorkspace{tx: tx, facts: facts}})
	})
}

func (workspace *editorWorkspace) ModelOptions(ctx context.Context, query string, offset int64, limit int) ([]application.ModelOption, int64, error) {
	groups, err := agent.AgentEditorModelGroups(workspace.facts)
	if err != nil {
		return nil, 0, err
	}
	names, total, err := model.ReadAgentEditorModelNames(workspace.tx.WithContext(ctx), workspace.facts, groups, query, offset, limit)
	if err != nil {
		return nil, 0, err
	}
	available, err := agent.AgentEditorModelsAvailable(ctx, workspace.tx, workspace.facts, names, groups)
	if err != nil {
		return nil, 0, err
	}
	items := make([]application.ModelOption, 0, len(names))
	for _, name := range names {
		option := application.ModelOption{Model: name, Available: available[name]}
		if !option.Available {
			reason := "unavailable"
			option.UnavailableReason = &reason
		}
		items = append(items, option)
	}
	return items, total, nil
}
