package model

import (
	"errors"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// AgentWorkspaceMemberRecord projects only fields allowed by the member API.
type AgentWorkspaceMemberRecord struct {
	UserID    int64  `json:"-"`
	Role      string `json:"-"`
	Status    string `json:"-"`
	CreatedAt int64  `json:"-"`
	UpdatedAt int64  `json:"-"`
	Revision  int64  `json:"-"`
}

// agentWorkspaceEligibleTeamUsers is shared by list, target and replacement
// admin queries so deleted/disabled or otherwise ineligible accounts never
// qualify just because an explicit grant still exists.
func agentWorkspaceEligibleTeamUsers(tx *gorm.DB, teamID int64) *gorm.DB {
	return tx.Table("team_members").
		Joins("JOIN users ON users.id = team_members.user_id").
		Where("team_members.team_id = ? AND users.deleted_at IS NULL AND users.status = ? AND users.auth_version > 0 AND users.role IN ?",
			teamID, common.UserStatusEnabled, []int{common.RoleCommonUser, common.RoleAdminUser, common.RoleRootUser})
}

// ReadAgentWorkspaceMembers filters the target roster in SQL before count and
// page. Call only in the short workspace transaction after live MemberManage.
func ReadAgentWorkspaceMembers(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, offset int64, limit int, orders []string) ([]AgentWorkspaceMemberRecord, int64, error) {
	if tx == nil || facts == nil || facts.Workspace == nil || facts.TeamID <= 0 || offset < 0 || limit < 1 || limit > 100 || len(orders) < 1 || len(orders) > 2 {
		return nil, 0, ErrAgentWorkspaceInvalid
	}
	for _, order := range orders {
		if !slices.Contains([]string{"ag_workspace_members.created_at ASC", "ag_workspace_members.created_at DESC", "ag_workspace_members.id ASC", "ag_workspace_members.id DESC"}, order) {
			return nil, 0, ErrAgentWorkspaceInvalid
		}
	}
	teamRole := agentWorkspaceExactColumn(tx, "team_members.role")
	query := agentWorkspaceEligibleTeamUsers(tx, facts.TeamID).
		Joins("JOIN ag_workspace_members ON ag_workspace_members.team_id = team_members.team_id AND ag_workspace_members.user_id = team_members.user_id").
		Where("ag_workspace_members.workspace_id = ?", facts.Workspace.ID).
		Where("((team_members.user_id = ? AND "+teamRole+" = ?) OR (team_members.user_id <> ? AND "+teamRole+" = ?))",
			facts.TeamOwnerUserID, TeamRoleOwner, facts.TeamOwnerUserID, TeamRoleMember).
		Where(agentWorkspaceExactColumn(tx, "ag_workspace_members.role")+" IN ?", []string{AgentWorkspaceRoleAdmin, AgentWorkspaceRoleDeveloper, AgentWorkspaceRoleOperator, AgentWorkspaceRoleViewer}).
		Where(agentWorkspaceExactColumn(tx, "ag_workspace_members.status")+" IN ?", []string{AgentWorkspaceMemberStatusActive, AgentWorkspaceMemberStatusBlocked})
	var total int64
	if err := query.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]AgentWorkspaceMemberRecord, 0)
	if offset >= total {
		return items, total, nil
	}
	if offset > int64(^uint(0)>>1) {
		return nil, 0, ErrAgentWorkspaceInvalid
	}
	err := query.Select("ag_workspace_members.user_id, ag_workspace_members.role, ag_workspace_members.status, ag_workspace_members.created_at, ag_workspace_members.updated_at, ag_workspace_members.revision").
		Order(strings.Join(orders, ", ")).Offset(int(offset)).Limit(limit).Scan(&items).Error
	return items, total, err
}

// LockAgentWorkspaceMemberTarget locks the current TeamMember/User pair before
// reading the explicit grant. A nil grant without an error is an eligible
// target that has never had an explicit row. The owner is checked by service
// policy before this call and is never a writable target.
func LockAgentWorkspaceMemberTarget(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, userID int64) (*AgentWorkspaceMember, error) {
	if tx == nil || facts == nil || facts.Workspace == nil || facts.TeamID <= 0 || userID <= 0 || userID == facts.TeamOwnerUserID {
		return nil, ErrAgentWorkspaceInvalid
	}
	var target struct{ UserID int64 }
	err := lockForUpdate(agentWorkspaceEligibleTeamUsers(tx, facts.TeamID)).
		Select("team_members.user_id").
		Where("team_members.user_id = ? AND "+agentWorkspaceExactColumn(tx, "team_members.role")+" = ?", userID, TeamRoleMember).
		Take(&target).Error
	if err != nil {
		return nil, err
	}
	var member AgentWorkspaceMember
	err = lockForUpdate(tx).Where("team_id = ? AND workspace_id = ? AND user_id = ?", facts.TeamID, facts.Workspace.ID, userID).Take(&member).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &member, nil
}

// AgentWorkspaceHasOtherEffectiveAdmin locks one surviving witness before
// removing an active explicit admin. The caller already serializes membership
// changes on the Team and Workspace. FOR UPDATE makes these current reads on
// MySQL and holds the witness User/TeamMember/Grant until commit. SQLite instead
// rejects upgrading a stale read snapshot to a writer.
func AgentWorkspaceHasOtherEffectiveAdmin(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, excludeUserID int64) (bool, error) {
	if tx == nil || facts == nil || facts.Workspace == nil || facts.TeamID <= 0 || facts.TeamOwnerUserID <= 0 || excludeUserID <= 0 {
		return false, ErrAgentWorkspaceInvalid
	}
	var witness struct{ UserID int64 }
	teamRole := agentWorkspaceExactColumn(tx, "team_members.role")
	if facts.TeamOwnerUserID != excludeUserID {
		err := lockForUpdate(agentWorkspaceEligibleTeamUsers(tx, facts.TeamID)).
			Select("team_members.user_id").
			Where("team_members.user_id = ? AND "+teamRole+" = ?", facts.TeamOwnerUserID, TeamRoleOwner).
			Take(&witness).Error
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err == nil, err
		}
	}
	err := lockForUpdate(agentWorkspaceEligibleTeamUsers(tx, facts.TeamID)).
		Select("team_members.user_id").
		Joins("JOIN ag_workspace_members ON ag_workspace_members.team_id = team_members.team_id AND ag_workspace_members.user_id = team_members.user_id").
		Where("ag_workspace_members.workspace_id = ? AND team_members.user_id <> ? AND team_members.user_id <> ? AND "+teamRole+" = ?",
			facts.Workspace.ID, facts.TeamOwnerUserID, excludeUserID, TeamRoleMember).
		Where(agentWorkspaceExactColumn(tx, "ag_workspace_members.status")+" = ? AND "+agentWorkspaceExactColumn(tx, "ag_workspace_members.role")+" = ?",
			AgentWorkspaceMemberStatusActive, AgentWorkspaceRoleAdmin).
		Order("ag_workspace_members.id ASC").Take(&witness).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	return err == nil, err
}

// CompareAndSwapAgentWorkspaceMember applies only the mutable grant fields;
// even a conflict never changes the owning Team, Workspace or User.
func CompareAndSwapAgentWorkspaceMember(tx *gorm.DB, current, next *AgentWorkspaceMember) (bool, error) {
	if tx == nil || current == nil || next == nil || current.ID <= 0 || current.TeamID <= 0 || current.WorkspaceID <= 0 || current.UserID <= 0 ||
		next.ID != current.ID || next.TeamID != current.TeamID || next.WorkspaceID != current.WorkspaceID || next.UserID != current.UserID ||
		current.Revision <= 0 || next.Revision <= current.Revision || next.Revision-current.Revision != 1 {
		return false, ErrAgentWorkspaceInvalid
	}
	updated := tx.Model(&AgentWorkspaceMember{}).
		Where("id = ? AND team_id = ? AND workspace_id = ? AND user_id = ? AND revision = ? AND "+
			agentWorkspaceExactColumn(tx, "role")+" = ? AND "+agentWorkspaceExactColumn(tx, "status")+" = ?",
			current.ID, current.TeamID, current.WorkspaceID, current.UserID, current.Revision, current.Role, current.Status).
		Updates(map[string]any{
			"role": next.Role, "status": next.Status, "revision": next.Revision, "granted_by": next.GrantedBy,
			"updated_at": next.UpdatedAt, "updated_by": next.UpdatedBy,
		})
	return updated.RowsAffected == 1, updated.Error
}
