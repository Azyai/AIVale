package agent

import (
	"context"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// AuthorizeLockedAgentDraft uses the session and resource facts locked by
// WithAgentWorkspaceWriteFacts. It does not authorize publication or execution.
func AuthorizeLockedAgentDraft(facts *model.AgentWorkspaceWriteFacts) error {
	return authorizeLockedAgentDefinition(facts, AgentWrite)
}

// AuthorizeLockedAgentPublish checks publication as a separate action from
// editing, even while both currently share the admin/developer candidate roles.
func AuthorizeLockedAgentPublish(facts *model.AgentWorkspaceWriteFacts) error {
	return authorizeLockedAgentDefinition(facts, AgentPublish)
}

func authorizeLockedAgentDefinition(facts *model.AgentWorkspaceWriteFacts, action WorkspaceAction) error {
	if facts == nil || facts.TeamID <= 0 || facts.TeamOwnerUserID <= 0 ||
		facts.UserID <= 0 || facts.Workspace == nil || facts.Workspace.TeamID != facts.TeamID ||
		facts.Workspace.ArchivedAt != nil {
		return agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	status := facts.Workspace.Status
	if status != model.AgentWorkspaceStatusActive && status != model.AgentWorkspaceStatusSuspended {
		return agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	role := ""
	if facts.TeamOwnerUserID == facts.UserID {
		if facts.TeamMemberRole == model.TeamRoleOwner {
			role = model.AgentWorkspaceRoleAdmin
		}
	} else if facts.TeamMemberRole == model.TeamRoleMember && facts.Member != nil && facts.Member.Status == model.AgentWorkspaceMemberStatusActive {
		role = facts.Member.Role
	}
	if WorkspacePermissionForRole(role, WorkspaceRead).Scope == WorkspaceScopeNone {
		return agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if !workspaceActionPermitted(role, status, action) {
		return agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	return nil
}

// ReadLockedAgentDraftPolicy uses the same model eligibility rules as the
// read-only validator, with the transaction's current editor/workspace facts.
func ReadLockedAgentDraftPolicy(ctx context.Context, tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts, modelName string) (application.DraftPolicy, error) {
	return readLockedAgentDefinitionPolicy(ctx, tx, facts, modelName, AgentWrite)
}

// ReadLockedAgentPublicationPolicy rechecks model eligibility and workspace
// constraints without selecting credentials, reserving money or running a model.
func ReadLockedAgentPublicationPolicy(ctx context.Context, tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts, modelName string) (application.DraftPolicy, error) {
	return readLockedAgentDefinitionPolicy(ctx, tx, facts, modelName, AgentPublish)
}

func readLockedAgentDefinitionPolicy(ctx context.Context, tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts, modelName string, action WorkspaceAction) (application.DraftPolicy, error) {
	if ctx == nil || tx == nil || tx.Statement == nil {
		return application.DraftPolicy{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if _, transactional := tx.Statement.ConnPool.(gorm.TxCommitter); !transactional {
		return application.DraftPolicy{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if err := authorizeLockedAgentDefinition(facts, action); err != nil {
		return application.DraftPolicy{}, err
	}
	return loadAgentConfigModelPolicy(ctx, tx.Session(&gorm.Session{Logger: logger.Discard}), facts.AgentModelGroup, modelName, application.DraftPolicy{
		DefaultCostQuota: facts.Workspace.DefaultRunBudgetQuota,
		MaxCostQuota:     facts.Workspace.MaxRunBudgetQuota,
		MaxRunSeconds:    facts.Workspace.MaxRunSeconds,
	})
}
