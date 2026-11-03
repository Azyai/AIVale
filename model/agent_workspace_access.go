package model

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// AgentWorkspaceAccessRecord 是单次主库查询得到的授权事实，不是可复用令牌。
// 它只包含判定所需的当前归属、状态和角色，不读取策略正文、用户秘密或费用。
type AgentWorkspaceAccessRecord struct {
	UserID                int64  `json:"-"`
	TeamID                int64  `json:"-"`
	WorkspaceID           int64  `json:"-"`
	TeamOwnerUserID       int64  `json:"-"`
	TeamMemberRole        string `json:"-"`
	WorkspaceStatus       string `json:"-"`
	WorkspaceArchivedAt   *int64 `json:"-"`
	WorkspaceMemberID     *int64 `json:"-"`
	WorkspaceMemberRole   string `json:"-"`
	WorkspaceMemberStatus string `json:"-"`
}

// agentWorkspaceSessionQuery 不使用User/Session缓存；调用者传入本次WithContext连接。
// 查询包含启用且未删除的用户、当前会话及两种版本，旧会话不能保留已撤销权限。
func agentWorkspaceSessionQuery(db *gorm.DB, identity AuthSessionIdentity) *gorm.DB {
	return db.Table("users").
		Joins("JOIN user_sessions ON user_sessions.user_id = users.id").
		Where("users.id = ? AND users.status = ? AND users.deleted_at IS NULL AND users.auth_version = ?",
			identity.UserID, common.UserStatusEnabled, identity.UserAuthVersion).
		Where(agentWorkspaceExactColumn(db, "user_sessions.sid")+" = ? AND "+agentWorkspaceExactColumn(db, "user_sessions.status")+" = ? AND user_sessions.revoked_at = ? AND user_sessions.expires_at > ? AND user_sessions.version = ? AND user_sessions.user_auth_version = ?",
			identity.SessionID, UserSessionStatusActive, 0, time.Now().Unix(), identity.SessionVersion, identity.UserAuthVersion)
}

// agentWorkspaceExactColumn只接收内部固定列名，不接收任何请求字段。
// 精确身份和枚举比较不能被默认排序规则的大小写/尾空格等价放宽。
func agentWorkspaceExactColumn(db *gorm.DB, column string) string {
	switch db.Dialector.Name() {
	case "mysql":
		return "BINARY " + column
	case "sqlite":
		return column + " COLLATE BINARY"
	case "postgres":
		return column + ` COLLATE "C"`
	default:
		return column
	}
}

// LoadAgentWorkspaceAccess 从当前Team成员事实推导租户，接口没有可覆盖的team参数。
// 用户、会话、团队和目标工作区在同一SELECT中校验，阻止逐查询拼接旧范围。
func LoadAgentWorkspaceAccess(db *gorm.DB, identity AuthSessionIdentity, workspaceID int64) (*AgentWorkspaceAccessRecord, error) {
	if db == nil || identity.UserID <= 0 || workspaceID <= 0 {
		return nil, ErrAgentWorkspaceInvalid
	}
	var record AgentWorkspaceAccessRecord
	err := agentWorkspaceSessionQuery(db, identity).
		Select("users.id AS user_id, teams.id AS team_id, ag_workspaces.id AS workspace_id, teams.owner_user_id AS team_owner_user_id, team_members.role AS team_member_role, ag_workspaces.status AS workspace_status, ag_workspaces.archived_at AS workspace_archived_at, ag_workspace_members.id AS workspace_member_id, COALESCE(ag_workspace_members.role, '') AS workspace_member_role, COALESCE(ag_workspace_members.status, '') AS workspace_member_status").
		Joins("JOIN team_members ON team_members.user_id = users.id").
		Joins("JOIN teams ON teams.id = team_members.team_id").
		Joins("JOIN ag_workspaces ON ag_workspaces.team_id = teams.id AND ag_workspaces.id = ?", workspaceID).
		Joins("LEFT JOIN ag_workspace_members ON ag_workspace_members.team_id = teams.id AND ag_workspace_members.workspace_id = ag_workspaces.id AND ag_workspace_members.user_id = users.id").
		Take(&record).Error
	if err != nil {
		return nil, err
	}
	return &record, nil
}

// AgentWorkspaceSessionActive 仅在范围查询未命中时区分失效身份和不可见资源。
// 它不授予工作区权限，仍不使用已有缓存，也不接受请求声明的Team。
func AgentWorkspaceSessionActive(db *gorm.DB, identity AuthSessionIdentity) (bool, error) {
	if db == nil || identity.UserID <= 0 {
		return false, ErrAgentWorkspaceInvalid
	}
	var current struct{ UserID int64 }
	err := agentWorkspaceSessionQuery(db, identity).Select("users.id AS user_id").Take(&current).Error
	if err == gorm.ErrRecordNotFound {
		return false, nil
	}
	return err == nil, err
}
