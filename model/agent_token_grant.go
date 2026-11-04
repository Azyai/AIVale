package model

import (
	"time"

	"gorm.io/gorm"
)

const (
	AgentTokenGrantResourceWorkspace = "workspace"
	AgentTokenGrantStatusActive      = "active"
	AgentTokenGrantStatusRevoked     = "revoked"
)

// AgentTokenGrant 保存模型 Key 的独立 Agent 授权；不保存模型 Key、费用或运行凭据。
type AgentTokenGrant struct {
	ID           int64  `json:"-" gorm:"primaryKey"`                                                                                                                       // 授权主键。
	TeamID       int64  `json:"-" gorm:"type:bigint;not null"`                                                                                                             // 当前工作区及模型 Key 所属 Team。
	WorkspaceID  int64  `json:"-" gorm:"type:bigint;not null;uniqueIndex:ux_ag_token_grants_tuple,priority:2;index:idx_ag_token_grants_workspace_token_status,priority:1"` // 所属工作区，参与唯一范围和列表索引。
	TokenID      int64  `json:"-" gorm:"type:bigint;not null;uniqueIndex:ux_ag_token_grants_tuple,priority:1;index:idx_ag_token_grants_workspace_token_status,priority:2"` // 既有同 Team 模型 Key ID。
	Scope        string `json:"-" gorm:"type:varchar(32);not null;uniqueIndex:ux_ag_token_grants_tuple,priority:3"`                                                        // 固定 Agent 权限枚举，与模型权限分离。
	ResourceType string `json:"-" gorm:"type:varchar(24);not null;uniqueIndex:ux_ag_token_grants_tuple,priority:4"`                                                        // 本阶段只允许 workspace。
	ResourceID   int64  `json:"-" gorm:"type:bigint;not null;uniqueIndex:ux_ag_token_grants_tuple,priority:5"`                                                             // 本阶段等于 WorkspaceID，非零引用。
	Status       string `json:"-" gorm:"type:varchar(16);not null;index:idx_ag_token_grants_workspace_token_status,priority:3"`                                            // active 或 revoked，撤销永久保留。
	ExpiresAt    *int64 `json:"-" gorm:"type:bigint"`                                                                                                                      // 可选授予截止 UTC 毫秒；NULL 仍受模型 Key 自身期限约束。
	CreatedAt    int64  `json:"-" gorm:"type:bigint;not null;autoCreateTime:false"`                                                                                        // 创建 UTC 毫秒。
	UpdatedAt    int64  `json:"-" gorm:"type:bigint;not null;autoUpdateTime:false"`                                                                                        // 最后状态变化 UTC 毫秒。
	Revision     int64  `json:"-" gorm:"type:bigint;not null"`                                                                                                             // 条件更新版本，从 1 开始。
	CreatedBy    int64  `json:"-" gorm:"type:bigint;not null"`                                                                                                             // 首次授予的管理会话用户。
	UpdatedBy    *int64 `json:"-" gorm:"type:bigint"`                                                                                                                      // 最后撤销用户；NULL 表示仍未撤销。
	RevokedAt    *int64 `json:"-" gorm:"type:bigint"`                                                                                                                      // 撤销 UTC 毫秒；NULL 表示尚未撤销。
}

func (AgentTokenGrant) TableName() string { return "ag_token_grants" }

func ValidAgentTokenGrantScope(scope string) bool {
	switch scope {
	case "agent:run", "run:read", "run:cancel", "artifact:read":
		return true
	default:
		return false
	}
}

func (grant *AgentTokenGrant) BeforeCreate(_ *gorm.DB) error {
	now := time.Now().UnixMilli()
	if grant.ID != 0 || grant.TeamID <= 0 || grant.WorkspaceID <= 0 || grant.TokenID <= 0 || grant.CreatedBy <= 0 ||
		!ValidAgentTokenGrantScope(grant.Scope) || grant.ResourceType != AgentTokenGrantResourceWorkspace || grant.ResourceID != grant.WorkspaceID ||
		grant.Status != AgentTokenGrantStatusActive || grant.UpdatedBy != nil || grant.RevokedAt != nil || (grant.Revision != 0 && grant.Revision != 1) ||
		(grant.ExpiresAt != nil && (*grant.ExpiresAt <= now || *grant.ExpiresAt > 9007199254740991)) {
		return ErrAgentWorkspaceInvalid
	}
	grant.CreatedAt, grant.UpdatedAt, grant.Revision = now, now, 1
	return nil
}

// LockAgentGrantManagementToken 只读取管理所需的元数据，不取 Key 或可计费字段。
func LockAgentGrantManagementToken(tx *gorm.DB, teamID, tokenID int64) (*Token, error) {
	var token Token
	err := lockForUpdate(tx).Select("id", "team_id", "user_id", "status", "expired_time").
		Where("team_id = ? AND id = ?", teamID, tokenID).Take(&token).Error
	if err != nil {
		return nil, err
	}
	return &token, nil
}

// AgentTokenGrantPage 在已经核对 Token 控制权的事务中读当前范围。
func AgentTokenGrantPage(tx *gorm.DB, teamID, workspaceID, tokenID, offset int64, limit int) ([]AgentTokenGrant, int64, error) {
	if tx == nil || teamID <= 0 || workspaceID <= 0 || tokenID <= 0 || offset < 0 || limit < 1 || limit > 100 {
		return nil, 0, ErrAgentWorkspaceInvalid
	}
	query := tx.Model(&AgentTokenGrant{}).Where("team_id = ? AND workspace_id = ? AND token_id = ?", teamID, workspaceID, tokenID).
		Where(agentWorkspaceExactColumn(tx, "resource_type")+" = ? AND resource_id = ?", AgentTokenGrantResourceWorkspace, workspaceID)
	var total int64
	if err := query.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]AgentTokenGrant, 0)
	if offset >= total {
		return items, total, nil
	}
	if offset > int64(^uint(0)>>1) {
		return nil, 0, ErrAgentWorkspaceInvalid
	}
	err := query.Order("created_at DESC, id DESC").Offset(int(offset)).Limit(limit).Find(&items).Error
	return items, total, err
}

func LockAgentTokenGrantByID(tx *gorm.DB, teamID, workspaceID, grantID int64) (*AgentTokenGrant, error) {
	var grant AgentTokenGrant
	err := lockForUpdate(tx).Where("team_id = ? AND workspace_id = ? AND id = ?", teamID, workspaceID, grantID).Take(&grant).Error
	if err != nil {
		return nil, err
	}
	return &grant, nil
}

func LockAgentTokenWorkspaceGrant(tx *gorm.DB, teamID, workspaceID, tokenID int64, scope string) (*AgentTokenGrant, error) {
	var grant AgentTokenGrant
	err := lockForUpdate(tx).Where("team_id = ? AND workspace_id = ? AND token_id = ? AND resource_id = ?", teamID, workspaceID, tokenID, workspaceID).
		Where(agentWorkspaceExactColumn(tx, "scope")+" = ? AND "+agentWorkspaceExactColumn(tx, "resource_type")+" = ?", scope, AgentTokenGrantResourceWorkspace).
		Take(&grant).Error
	if err != nil {
		return nil, err
	}
	return &grant, nil
}

// RevokeAgentTokenGrant 对匹配范围和版本的有效状态写入撤销标记，不删除唯一元组。
func RevokeAgentTokenGrant(tx *gorm.DB, grant *AgentTokenGrant, actorID, now int64) (bool, error) {
	result := tx.Model(&AgentTokenGrant{}).Where("id = ? AND team_id = ? AND workspace_id = ? AND token_id = ? AND revision = ? AND revoked_at IS NULL AND "+agentWorkspaceExactColumn(tx, "status")+" = ?",
		grant.ID, grant.TeamID, grant.WorkspaceID, grant.TokenID, grant.Revision, AgentTokenGrantStatusActive).
		Updates(map[string]any{"status": AgentTokenGrantStatusRevoked, "revision": grant.Revision + 1, "revoked_at": now, "updated_at": now, "updated_by": actorID})
	return result.RowsAffected == 1, result.Error
}
