package agent

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
)

type WorkspaceMemberView model.AgentWorkspaceMemberRecord

type PutWorkspaceMemberInput struct {
	Role             string `json:"-"`
	ExpectedRevision int64  `json:"-"`
}

// ListWorkspaceMembers locks the caller's current authority for the short
// scoped roster read. Explicit grants are visible only while their subject is
// still an eligible member of this Team.
func ListWorkspaceMembers(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID int64, page agenttypes.PageQuery) (agenttypes.Page[WorkspaceMemberView], error) {
	var result agenttypes.Page[WorkspaceMemberView]
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return result, err
	}
	if workspaceID <= 0 {
		return result, agenttypes.NewInvalidArgument("workspace_id", "Workspace ID must be positive")
	}
	offset, err := page.Offset()
	if err != nil {
		return result, err
	}
	orders := make([]string, 0, 2)
	for _, term := range page.Sort() {
		orders = append(orders, "ag_workspace_members."+string(term.Field)+" "+strings.ToUpper(string(term.Direction)))
	}
	err = model.WithAgentWorkspaceWriteFacts(db.WithContext(ctx), identity, workspaceID, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) error {
		if err := requireWorkspaceMemberManager(facts); err != nil {
			return err
		}
		records, total, err := model.ReadAgentWorkspaceMembers(tx, facts, offset, page.PageSize(), orders)
		if err != nil {
			return err
		}
		views := make([]WorkspaceMemberView, 0, len(records))
		for _, record := range records {
			view := WorkspaceMemberView(record)
			if !workspaceMemberViewValid(view) {
				return agenttypes.NewError(agenttypes.InternalError, nil)
			}
			views = append(views, view)
		}
		result, err = agenttypes.NewPage(views, total, page)
		return err
	})
	if err != nil {
		return agenttypes.Page[WorkspaceMemberView]{}, workspaceWriteError(err)
	}
	return result, nil
}

// PutWorkspaceMember creates a grant at expected revision zero or replaces its
// role at the exact current revision. Regranting a tombstone advances the same
// row's revision, so an earlier PUT cannot recreate access.
func PutWorkspaceMember(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID, userID int64, input PutWorkspaceMemberInput, requestID string) (*WorkspaceMemberView, error) {
	if err := validateWorkspaceMemberRequest(ctx, db, identity, workspaceID, userID); err != nil {
		return nil, err
	}
	if !workspaceMemberRoleValid(input.Role) {
		return nil, agenttypes.NewInvalidArgument("role", "Role must be admin, developer, operator, or viewer")
	}
	if input.ExpectedRevision < 0 || input.ExpectedRevision > agenttypes.MaxSafeInteger {
		return nil, agenttypes.NewInvalidArgument("expected_revision", "Revision must be a nonnegative safe integer")
	}
	requestID = workspaceWriteRequestID(requestID)
	var result *WorkspaceMemberView
	var mutated bool
	err := model.WithAgentWorkspaceWriteFacts(db.WithContext(ctx), identity, workspaceID, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) error {
		result, mutated = nil, false
		prior, err := loadWorkspaceMemberForMutation(tx, facts, userID)
		if err != nil {
			return err
		}
		if input.Role == model.AgentWorkspaceRoleAdmin && facts.TeamOwnerUserID != facts.UserID &&
			(prior == nil || userID != facts.UserID || prior.Role != model.AgentWorkspaceRoleAdmin || prior.Status != model.AgentWorkspaceMemberStatusActive) {
			return agenttypes.NewError(agenttypes.PermissionDenied, nil)
		}
		if (prior == nil && input.ExpectedRevision != 0) || (prior != nil && prior.Revision != input.ExpectedRevision) {
			return agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
		}
		if prior != nil && prior.Status == model.AgentWorkspaceMemberStatusActive && prior.Role == input.Role {
			view := workspaceMemberProjection(prior)
			result = &view
			return nil
		}

		operation := "workspace.member.add"
		var next *model.AgentWorkspaceMember
		if prior == nil {
			next = &model.AgentWorkspaceMember{TeamID: facts.TeamID, WorkspaceID: workspaceID, UserID: userID,
				Role: input.Role, Status: model.AgentWorkspaceMemberStatusActive, CreatedBy: facts.UserID, GrantedBy: facts.UserID}
			if err := tx.Create(next).Error; err != nil {
				return err
			}
		} else {
			if prior.Status == model.AgentWorkspaceMemberStatusActive {
				operation = "workspace.member.update"
			}
			next, err = changeWorkspaceMemberGrant(tx, facts, prior, input.Role, model.AgentWorkspaceMemberStatusActive)
			if err != nil {
				return err
			}
		}
		view := workspaceMemberProjection(next)
		if next.ID <= 0 || !workspaceMemberViewValid(view) {
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
		if err := recordWorkspaceMemberAudit(tx, facts, operation, prior, next, requestID); err != nil {
			return err
		}
		result, mutated = &view, true
		return nil
	})
	if err != nil {
		return nil, workspaceWriteError(err)
	}
	if mutated {
		workspaceWriteProjectAudit(db, requestID)
	}
	return result, nil
}

// RemoveWorkspaceMember keeps a blocked tombstone at the next revision. No
// grant and already blocked both converge to the same success for a caller
// whose current authority permits the request.
func RemoveWorkspaceMember(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID, userID int64, requestID string) error {
	if err := validateWorkspaceMemberRequest(ctx, db, identity, workspaceID, userID); err != nil {
		return err
	}
	requestID = workspaceWriteRequestID(requestID)
	var mutated bool
	err := model.WithAgentWorkspaceWriteFacts(db.WithContext(ctx), identity, workspaceID, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) error {
		mutated = false
		prior, err := loadWorkspaceMemberForMutation(tx, facts, userID)
		if err != nil {
			return err
		}
		if prior == nil || prior.Status == model.AgentWorkspaceMemberStatusBlocked {
			return nil
		}
		next, err := changeWorkspaceMemberGrant(tx, facts, prior, prior.Role, model.AgentWorkspaceMemberStatusBlocked)
		if err != nil {
			return err
		}
		if err := recordWorkspaceMemberAudit(tx, facts, "workspace.member.remove", prior, next, requestID); err != nil {
			return err
		}
		mutated = true
		return nil
	})
	if err != nil {
		return workspaceWriteError(err)
	}
	if mutated {
		workspaceWriteProjectAudit(db, requestID)
	}
	return nil
}

func validateWorkspaceMemberRequest(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID, userID int64) error {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return err
	}
	if workspaceID <= 0 {
		return agenttypes.NewInvalidArgument("workspace_id", "Workspace ID must be positive")
	}
	if userID <= 0 {
		return agenttypes.NewInvalidArgument("user_id", "User ID must be positive")
	}
	return nil
}

func requireWorkspaceMemberManager(facts *model.AgentWorkspaceWriteFacts) error {
	// UserAuth requires at least a normal host user. Keep the same minimum
	// when another internal caller passes a valid but guest-level session.
	if facts.ActorRole < common.RoleCommonUser {
		return agenttypes.NewError(agenttypes.AuthRequired, nil)
	}
	role, err := workspaceWriteRole(facts, false)
	if err != nil {
		return err
	}
	if !workspaceActionPermitted(role, facts.Workspace.Status, MemberManage) {
		return agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	return nil
}

func loadWorkspaceMemberForMutation(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts, userID int64) (*model.AgentWorkspaceMember, error) {
	if err := requireWorkspaceMemberManager(facts); err != nil {
		return nil, err
	}
	if userID == facts.TeamOwnerUserID {
		return nil, agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	prior, err := model.LockAgentWorkspaceMemberTarget(tx, facts, userID)
	if err != nil || prior == nil {
		return prior, err
	}
	if prior.ID <= 0 || prior.TeamID != facts.TeamID || prior.WorkspaceID != facts.Workspace.ID || prior.UserID != userID || !workspaceMemberViewValid(workspaceMemberProjection(prior)) {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if prior.Role == model.AgentWorkspaceRoleAdmin && facts.TeamOwnerUserID != facts.UserID && facts.UserID != userID {
		return nil, agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	return prior, nil
}

func changeWorkspaceMemberGrant(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts, prior *model.AgentWorkspaceMember, role, status string) (*model.AgentWorkspaceMember, error) {
	if prior.Revision >= agenttypes.MaxSafeInteger {
		return nil, agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
	}
	if prior.Role == model.AgentWorkspaceRoleAdmin && prior.Status == model.AgentWorkspaceMemberStatusActive &&
		(role != model.AgentWorkspaceRoleAdmin || status != model.AgentWorkspaceMemberStatusActive) {
		found, err := model.AgentWorkspaceHasOtherEffectiveAdmin(tx, facts, prior.UserID)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, agenttypes.NewError(agenttypes.ResourceInUse, nil)
		}
	}
	next := *prior
	next.Role, next.Status = role, status
	next.Revision++
	next.UpdatedAt = max(time.Now().UnixMilli(), prior.UpdatedAt)
	next.UpdatedBy = &facts.UserID
	if status == model.AgentWorkspaceMemberStatusActive {
		next.GrantedBy = facts.UserID
	}
	if !workspaceMemberViewValid(workspaceMemberProjection(&next)) {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	updated, err := model.CompareAndSwapAgentWorkspaceMember(tx, prior, &next)
	if err != nil {
		return nil, err
	}
	if !updated {
		return nil, agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
	}
	return &next, nil
}

func workspaceMemberProjection(member *model.AgentWorkspaceMember) WorkspaceMemberView {
	return WorkspaceMemberView{UserID: member.UserID, Role: member.Role, Status: member.Status, CreatedAt: member.CreatedAt, UpdatedAt: member.UpdatedAt, Revision: member.Revision}
}

func workspaceMemberRoleValid(role string) bool {
	return slices.Contains([]string{model.AgentWorkspaceRoleAdmin, model.AgentWorkspaceRoleDeveloper, model.AgentWorkspaceRoleOperator, model.AgentWorkspaceRoleViewer}, role)
}

func workspaceMemberViewValid(view WorkspaceMemberView) bool {
	return view.UserID > 0 && workspaceMemberRoleValid(view.Role) &&
		(view.Status == model.AgentWorkspaceMemberStatusActive || view.Status == model.AgentWorkspaceMemberStatusBlocked) &&
		view.CreatedAt >= 1 && view.UpdatedAt >= view.CreatedAt && view.UpdatedAt <= agenttypes.MaxSafeInteger &&
		view.Revision >= 1 && view.Revision <= agenttypes.MaxSafeInteger
}
