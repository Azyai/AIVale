package model

import (
	"strings"

	"gorm.io/gorm"
)

// AgentWorkspaceReadPrincipal 是当前有效管理会话的团队关系，不是授权凭据。
// Team字段为NULL时表示当前没有可用团队；不读取用户秘密或团队账务。
type AgentWorkspaceReadPrincipal struct {
	UserID          int64  `json:"-"`
	TeamID          *int64 `json:"-"`
	TeamOwnerUserID *int64 `json:"-"`
	TeamMemberRole  string `json:"-"`
}

// AgentWorkspaceReadRecord 是显式投影，不是ORM实体或公开DTO。
// 列表不选择Description；两个入口均不读取policy_json、预算或审计主体。
type AgentWorkspaceReadRecord struct {
	ID          int64  `json:"-"`
	TeamID      int64  `json:"-"`
	Slug        string `json:"-"`
	Name        string `json:"-"`
	Description string `json:"-"`
	Status      string `json:"-"`
	CreatedAt   int64  `json:"-"`
	UpdatedAt   int64  `json:"-"`
	Revision    int64  `json:"-"`
	Role        string `json:"-"`
}

// LoadAgentWorkspaceReadPrincipal 区分失效管理身份和合法的无团队空态。
func LoadAgentWorkspaceReadPrincipal(db *gorm.DB, identity AuthSessionIdentity) (*AgentWorkspaceReadPrincipal, error) {
	if db == nil || identity.UserID <= 0 {
		return nil, ErrAgentWorkspaceInvalid
	}
	var principal AgentWorkspaceReadPrincipal
	err := agentWorkspaceSessionQuery(db, identity).
		Select("users.id AS user_id, teams.id AS team_id, teams.owner_user_id AS team_owner_user_id, COALESCE(team_members.role, '') AS team_member_role").
		Joins("LEFT JOIN team_members ON team_members.user_id = users.id").
		Joins("LEFT JOIN teams ON teams.id = team_members.team_id").Take(&principal).Error
	if err != nil {
		return nil, err
	}
	return &principal, nil
}

// agentWorkspaceVisibleQuery 在COUNT和分页/详情之前限制全部实时身份与对象范围。
// owner必须有两份一致事实；普通成员只匹配显式active且已知角色的工作区行。
func agentWorkspaceVisibleQuery(db *gorm.DB, identity AuthSessionIdentity) *gorm.DB {
	teamRole := agentWorkspaceExactColumn(db, "team_members.role")
	workspaceStatus := agentWorkspaceExactColumn(db, "ag_workspaces.status")
	memberRole := agentWorkspaceExactColumn(db, "ag_workspace_members.role")
	memberStatus := agentWorkspaceExactColumn(db, "ag_workspace_members.status")
	return agentWorkspaceSessionQuery(db, identity).
		Joins("JOIN team_members ON team_members.user_id = users.id").
		Joins("JOIN teams ON teams.id = team_members.team_id").
		Joins("JOIN ag_workspaces ON ag_workspaces.team_id = teams.id").
		Joins("LEFT JOIN ag_workspace_members ON ag_workspace_members.team_id = teams.id AND ag_workspace_members.workspace_id = ag_workspaces.id AND ag_workspace_members.user_id = users.id").
		Where("teams.id > 0 AND teams.owner_user_id > 0 AND ag_workspaces.id > 0 AND ag_workspaces.archived_at IS NULL").
		Where(workspaceStatus+" IN ?", []string{AgentWorkspaceStatusActive, AgentWorkspaceStatusSuspended}).
		Where("((teams.owner_user_id = users.id AND "+teamRole+" = ?) OR (teams.owner_user_id <> users.id AND "+teamRole+" = ? AND ag_workspace_members.id IS NOT NULL AND "+memberStatus+" = ? AND "+memberRole+" IN ?))",
			TeamRoleOwner, TeamRoleMember, AgentWorkspaceMemberStatusActive,
			[]string{AgentWorkspaceRoleAdmin, AgentWorkspaceRoleDeveloper, AgentWorkspaceRoleOperator, AgentWorkspaceRoleViewer})
}

// ReadAgentWorkspaces 用相同作用域分别COUNT和分页读取，查询次数不随行数增加。
// 名称匹配采用各引擎的大小写敏感字面子串函数，不依赖默认collation或LIKE通配符。
func ReadAgentWorkspaces(db *gorm.DB, identity AuthSessionIdentity, query string, offset int64, limit int, orders []string) ([]AgentWorkspaceReadRecord, int64, error) {
	if db == nil || identity.UserID <= 0 || offset < 0 || limit < 1 || limit > 100 || len(orders) < 1 || len(orders) > 2 {
		return nil, 0, ErrAgentWorkspaceInvalid
	}
	for _, order := range orders {
		if order != "ag_workspaces.created_at ASC" && order != "ag_workspaces.created_at DESC" && order != "ag_workspaces.id ASC" && order != "ag_workspaces.id DESC" {
			return nil, 0, ErrAgentWorkspaceInvalid
		}
	}
	visible := agentWorkspaceVisibleQuery(db, identity)
	if query != "" {
		switch db.Dialector.Name() {
		case "sqlite":
			visible = visible.Where("instr(ag_workspaces.name, ?) > 0", query)
		case "postgres":
			visible = visible.Where("strpos(ag_workspaces.name, ?) > 0", query)
		case "mysql":
			visible = visible.Where("LOCATE(BINARY ?, BINARY ag_workspaces.name) > 0", query)
		default:
			return nil, 0, ErrAgentWorkspaceInvalid
		}
	}
	var total int64
	if err := visible.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]AgentWorkspaceReadRecord, 0)
	if offset >= total {
		return items, total, nil
	}
	if offset > int64(^uint(0)>>1) {
		return nil, 0, ErrAgentWorkspaceInvalid
	}
	err := visible.Select("ag_workspaces.id, ag_workspaces.team_id, ag_workspaces.slug, ag_workspaces.name, ag_workspaces.status, ag_workspaces.created_at, ag_workspaces.updated_at, ag_workspaces.revision, CASE WHEN teams.owner_user_id = users.id THEN 'admin' ELSE ag_workspace_members.role END AS role").
		Order(strings.Join(orders, ", ")).Offset(int(offset)).Limit(limit).Scan(&items).Error
	return items, total, err
}

// ReadAgentWorkspace 详情投影与授权范围在同一查询中获得，不按裸ID读取ORM实体。
func ReadAgentWorkspace(db *gorm.DB, identity AuthSessionIdentity, workspaceID int64) (*AgentWorkspaceReadRecord, error) {
	if db == nil || identity.UserID <= 0 || workspaceID <= 0 {
		return nil, ErrAgentWorkspaceInvalid
	}
	var record AgentWorkspaceReadRecord
	err := agentWorkspaceVisibleQuery(db, identity).
		Select("ag_workspaces.id, ag_workspaces.team_id, ag_workspaces.slug, ag_workspaces.name, ag_workspaces.description, ag_workspaces.status, ag_workspaces.created_at, ag_workspaces.updated_at, ag_workspaces.revision, CASE WHEN teams.owner_user_id = users.id THEN 'admin' ELSE ag_workspace_members.role END AS role").
		Where("ag_workspaces.id = ?", workspaceID).Take(&record).Error
	if err != nil {
		return nil, err
	}
	return &record, nil
}
