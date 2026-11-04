package agent

import (
	"context"
	"errors"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/agent_setting"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
)

// RunTokenGrantAccess is a one-time workspace-scope decision. It conveys no
// permission to bypass Run ownership, model restrictions, tools or billing.
type RunTokenGrantAccess struct {
	TokenID       int64  `json:"-"`
	UserID        int64  `json:"-"`
	TeamID        int64  `json:"-"`
	WorkspaceID   int64  `json:"-"`
	GrantID       int64  `json:"-"`
	GrantRevision int64  `json:"-"`
	Scope         string `json:"-"`
}

// ResolveRunTokenGrant must receive an identity produced by TokenAuth. Each
// request/controlled step resolves fresh main DB facts; a prior result is not
// an authorization cache. P01 does not register a public Run endpoint.
func ResolveRunTokenGrant(ctx context.Context, db *gorm.DB, identity model.AgentModelTokenIdentity, workspaceID int64, scope string) (*RunTokenGrantAccess, error) {
	if !agent_setting.Snapshot().Enabled {
		return nil, agenttypes.NewError(agenttypes.RuntimeUnavailable, nil)
	}
	if !identity.Valid() {
		return nil, agenttypes.NewError(agenttypes.AuthRequired, nil)
	}
	if workspaceID <= 0 || !model.ValidAgentTokenGrantScope(scope) {
		return nil, agenttypes.NewInvalidArgument("scope", "A workspace ID and a supported run token scope are required")
	}
	if ctx == nil || db == nil || db.Config == nil || db.Dialector == nil || db.Statement == nil || db.Statement.ConnPool == nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if _, transactional := db.Statement.ConnPool.(gorm.TxCommitter); transactional {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	facts, err := model.LoadAgentRunTokenFacts(db.WithContext(ctx), identity, workspaceID, scope)
	if errors.Is(err, gorm.ErrRecordNotFound) || errors.Is(err, model.ErrTokenInvalid) {
		return nil, agenttypes.NewError(agenttypes.AuthRequired, nil)
	}
	if err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	if err := ctx.Err(); err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	if facts.TeamID <= 0 {
		return nil, agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	if facts.TeamOwnerUserID == nil || *facts.TeamOwnerUserID <= 0 || facts.WorkspaceID == nil || *facts.WorkspaceID != workspaceID || facts.ArchivedAt != nil || facts.WorkspaceStatus != model.AgentWorkspaceStatusActive {
		return nil, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	role := ""
	if facts.UserID == *facts.TeamOwnerUserID && facts.TeamMemberRole == model.TeamRoleOwner {
		role = model.AgentWorkspaceRoleAdmin
	} else if facts.UserID != *facts.TeamOwnerUserID && facts.TeamMemberRole == model.TeamRoleMember && facts.MemberStatus == model.AgentWorkspaceMemberStatusActive {
		role = facts.MemberRole
	}
	if WorkspacePermissionForRole(role, WorkspaceRead).Scope == WorkspaceScopeNone {
		return nil, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if !runTokenScopePermitted(role, scope) || facts.GrantID == nil || *facts.GrantID <= 0 || facts.GrantScope != scope || facts.GrantStatus != model.AgentTokenGrantStatusActive ||
		!model.ValidAgentTokenGrantVersion(facts.GrantStatus, facts.GrantRevision, facts.GrantCreatedAt, facts.GrantUpdatedAt, facts.GrantExpiresAt, facts.GrantRevokedAt) ||
		(facts.GrantExpiresAt != nil && *facts.GrantExpiresAt <= time.Now().UnixMilli()) {
		return nil, agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	return &RunTokenGrantAccess{TokenID: facts.TokenID, UserID: facts.UserID, TeamID: facts.TeamID, WorkspaceID: workspaceID,
		GrantID: *facts.GrantID, GrantRevision: facts.GrantRevision, Scope: scope}, nil
}

// RecheckRunTokenGrant fences a previously admitted operation to its original
// grant revision. A fresh request can use a renewal, but an older operation
// must never acquire its authority by silently switching to the new revision.
// Future Run handlers still need resource/policy checks and a transaction for
// their own effects; no production Run handler calls this in P01.
func RecheckRunTokenGrant(ctx context.Context, db *gorm.DB, identity model.AgentModelTokenIdentity, admitted RunTokenGrantAccess) (*RunTokenGrantAccess, error) {
	if admitted.TokenID <= 0 || admitted.UserID <= 0 || admitted.TeamID <= 0 || admitted.WorkspaceID <= 0 || admitted.GrantID <= 0 || admitted.GrantRevision < 1 || admitted.GrantRevision > agenttypes.MaxSafeInteger || !model.ValidAgentTokenGrantScope(admitted.Scope) {
		return nil, agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	current, err := ResolveRunTokenGrant(ctx, db, identity, admitted.WorkspaceID, admitted.Scope)
	if err != nil {
		return nil, err
	}
	if *current != admitted {
		return nil, agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	return current, nil
}

// These are only workspace-layer candidates. Run reads/cancels and artifact
// reads also need their own persisted resource facts before execution.
func runTokenScopePermitted(role, scope string) bool {
	return model.ValidAgentTokenGrantScope(scope) && (role == model.AgentWorkspaceRoleAdmin || role == model.AgentWorkspaceRoleDeveloper || role == model.AgentWorkspaceRoleOperator)
}
