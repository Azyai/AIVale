package model

import (
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	AgentWorkspaceStatusActive    = "active"
	AgentWorkspaceStatusSuspended = "suspended"
	AgentWorkspaceStatusArchived  = "archived"

	AgentWorkspaceRoleAdmin     = "admin"
	AgentWorkspaceRoleDeveloper = "developer"
	AgentWorkspaceRoleOperator  = "operator"
	AgentWorkspaceRoleViewer    = "viewer"

	AgentWorkspaceMemberStatusActive  = "active"
	AgentWorkspaceMemberStatusBlocked = "blocked"
)

var (
	ErrAgentWorkspaceInvalid   = errors.New("invalid agent workspace input")
	ErrAgentWorkspaceReference = errors.New("invalid agent workspace reference")
	agentWorkspaceSlug         = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)
)

// AgentWorkspace 是Team下的资源空间。它只保存配置和归属，不代表调用者已获授权。
// 对外接口须使用独立DTO处理字符串ID与额度，不能直接序列化本模型。
type AgentWorkspace struct {
	ID                    int64  `json:"-" gorm:"primaryKey;index:idx_ag_workspaces_team_status_id,priority:3"`                                                             // 工作区有符号64位主键，由GORM生成。
	TeamID                int64  `json:"-" gorm:"type:bigint;not null;uniqueIndex:ux_ag_workspaces_team_slug,priority:1;index:idx_ag_workspaces_team_status_id,priority:1"` // 所属现有Team，不接受客户端声明作为授权。
	Slug                  string `json:"-" gorm:"type:varchar(64);not null;uniqueIndex:ux_ag_workspaces_team_slug,priority:2"`                                              // Team内唯一的小写ASCII稳定标识，归档不回收。
	Name                  string `json:"-" gorm:"type:varchar(128);not null"`                                                                                               // UTF-8显示名称，允许重名，非秘密元数据。
	Description           string `json:"-" gorm:"type:text;not null"`                                                                                                       // UTF-8描述，最多4KiB，不保存凭据。
	Status                string `json:"-" gorm:"type:varchar(16);not null;default:active;index:idx_ag_workspaces_team_status_id,priority:2"`                               // active、suspended、archived业务状态。
	DefaultMemberRole     string `json:"-" gorm:"type:varchar(16);not null;default:viewer"`                                                                                 // 添加成员表单默认选项，不自动授予访问权。
	MaxActiveRuns         int32  `json:"-" gorm:"type:int;not null"`                                                                                                        // 运行并发上限，0禁止运行，不表示无限。
	ActiveRunCount        int32  `json:"-" gorm:"type:int;not null;default:0"`                                                                                              // 可重建的活跃运行槽位计数，不是计费账本。
	DefaultRunBudgetQuota int64  `json:"-" gorm:"type:bigint;not null"`                                                                                                     // 新Run默认预算上限，单位为既有quota，仅配置。
	MaxRunBudgetQuota     int64  `json:"-" gorm:"type:bigint;not null"`                                                                                                     // 单Run可设置预算最大值，非负quota，不扣钱包。
	MaxRunSeconds         int32  `json:"-" gorm:"type:int;not null"`                                                                                                        // 单Run执行时间上限，单位秒，非负。
	PolicyJSON            string `json:"-" gorm:"column:policy_json;type:text;not null"`                                                                                    // 版本化非秘密策略；P01仅允许schema_version=1空策略。
	CreatedAt             int64  `json:"-" gorm:"type:bigint;not null;autoCreateTime:false"`                                                                                // 创建时间，UTC Unix毫秒。
	UpdatedAt             int64  `json:"-" gorm:"type:bigint;not null;autoUpdateTime:false"`                                                                                // 最后变更时间，UTC Unix毫秒。
	Revision              int64  `json:"-" gorm:"type:bigint;not null;default:1"`                                                                                           // 乐观锁修订号，创建为1，后续条件更新负责递增。
	CreatedBy             int64  `json:"-" gorm:"type:bigint;not null"`                                                                                                     // 创建者，引用同Team的现有启用用户。
	UpdatedBy             *int64 `json:"-" gorm:"type:bigint"`                                                                                                              // 最后编辑用户；NULL表示尚无人工编辑或系统变更。
	ArchivedAt            *int64 `json:"-" gorm:"type:bigint"`                                                                                                              // UTC Unix毫秒归档时间，未归档为NULL，不触发级联删除。
}

func (AgentWorkspace) TableName() string { return "ag_workspaces" }

// BeforeCreate 统一写入应用默认值和毫秒时间，避免数据库方言决定slug唯一性。
func (workspace *AgentWorkspace) BeforeCreate(_ *gorm.DB) error {
	workspace.Slug = strings.TrimSpace(workspace.Slug)
	for _, character := range workspace.Slug {
		if character > 127 {
			return ErrAgentWorkspaceInvalid
		}
	}
	workspace.Slug = strings.ToLower(workspace.Slug)
	workspace.Name = strings.TrimSpace(workspace.Name)
	if workspace.Status == "" {
		workspace.Status = AgentWorkspaceStatusActive
	}
	if workspace.DefaultMemberRole == "" {
		workspace.DefaultMemberRole = AgentWorkspaceRoleViewer
	}
	if workspace.ID != 0 || workspace.TeamID <= 0 || workspace.CreatedBy <= 0 ||
		workspace.UpdatedBy != nil && *workspace.UpdatedBy <= 0 ||
		workspace.Revision != 0 && workspace.Revision != 1 ||
		!agentWorkspaceSlug.MatchString(workspace.Slug) ||
		!utf8.ValidString(workspace.Name) || strings.ContainsRune(workspace.Name, 0) || workspace.Name == "" || utf8.RuneCountInString(workspace.Name) > 128 ||
		!utf8.ValidString(workspace.Description) || strings.ContainsRune(workspace.Description, 0) || len(workspace.Description) > 4096 ||
		!slices.Contains([]string{AgentWorkspaceStatusActive, AgentWorkspaceStatusSuspended, AgentWorkspaceStatusArchived}, workspace.Status) ||
		!slices.Contains([]string{AgentWorkspaceRoleAdmin, AgentWorkspaceRoleDeveloper, AgentWorkspaceRoleOperator, AgentWorkspaceRoleViewer}, workspace.DefaultMemberRole) ||
		workspace.MaxActiveRuns < 0 || workspace.ActiveRunCount != 0 || workspace.MaxRunSeconds < 0 ||
		workspace.DefaultRunBudgetQuota < 0 || workspace.MaxRunBudgetQuota < workspace.DefaultRunBudgetQuota {
		return ErrAgentWorkspaceInvalid
	}
	if workspace.Status == AgentWorkspaceStatusArchived {
		if workspace.ArchivedAt == nil || *workspace.ArchivedAt <= 0 {
			return ErrAgentWorkspaceInvalid
		}
	} else if workspace.ArchivedAt != nil {
		return ErrAgentWorkspaceInvalid
	}
	if !utf8.ValidString(workspace.PolicyJSON) || len(workspace.PolicyJSON) > 60*1024 {
		return ErrAgentWorkspaceInvalid
	}
	var policy map[string]common.RawMessage
	if err := common.UnmarshalJsonStr(workspace.PolicyJSON, &policy); err != nil || len(policy) != 1 {
		return ErrAgentWorkspaceInvalid
	}
	var schemaVersion int
	if err := common.Unmarshal(policy["schema_version"], &schemaVersion); err != nil || schemaVersion != 1 {
		return ErrAgentWorkspaceInvalid
	}
	workspace.PolicyJSON = `{"schema_version":1}`
	workspace.Revision = 1
	workspace.CreatedAt = time.Now().UnixMilli()
	workspace.UpdatedAt = workspace.CreatedAt
	return nil
}

// AgentWorkspaceMember 保存显式授权记录；Team owner继承、动作矩阵及实时撤权由访问服务处理。
type AgentWorkspaceMember struct {
	ID          int64  `json:"-" gorm:"primaryKey"`                                                                                                                                    // 工作区成员记录有符号64位主键。
	TeamID      int64  `json:"-" gorm:"type:bigint;not null;index:idx_ag_workspace_members_team_user_status,priority:1"`                                                               // 所属现有Team，必须与Workspace一致。
	WorkspaceID int64  `json:"-" gorm:"type:bigint;not null;uniqueIndex:ux_ag_workspace_members_workspace_user,priority:1"`                                                            // 所属工作区，不跨Team复用。
	UserID      int64  `json:"-" gorm:"type:bigint;not null;uniqueIndex:ux_ag_workspace_members_workspace_user,priority:2;index:idx_ag_workspace_members_team_user_status,priority:2"` // 被授权用户，必须仍在同Team。
	Role        string `json:"-" gorm:"type:varchar(16);not null;default:viewer"`                                                                                                      // admin、developer、operator、viewer，不等于Team角色。
	Status      string `json:"-" gorm:"type:varchar(16);not null;default:active;index:idx_ag_workspace_members_team_user_status,priority:3"`                                           // active有效或blocked显式禁用。
	GrantedBy   int64  `json:"-" gorm:"type:bigint;not null"`                                                                                                                          // 授权人，引用同Team现有启用用户。
	CreatedAt   int64  `json:"-" gorm:"type:bigint;not null;autoCreateTime:false"`                                                                                                     // 创建时间，UTC Unix毫秒。
	UpdatedAt   int64  `json:"-" gorm:"type:bigint;not null;autoUpdateTime:false"`                                                                                                     // 最后变更时间，UTC Unix毫秒。
	Revision    int64  `json:"-" gorm:"type:bigint;not null;default:1"`                                                                                                                // 乐观锁修订号，创建为1。
	CreatedBy   int64  `json:"-" gorm:"type:bigint;not null"`                                                                                                                          // 创建者，引用同Team现有启用用户。
	UpdatedBy   *int64 `json:"-" gorm:"type:bigint"`                                                                                                                                   // 最后编辑用户，NULL表示未人工编辑或系统变更。
}

func (AgentWorkspaceMember) TableName() string { return "ag_workspace_members" }

func (member *AgentWorkspaceMember) BeforeCreate(_ *gorm.DB) error {
	if member.Role == "" {
		member.Role = AgentWorkspaceRoleViewer
	}
	if member.Status == "" {
		member.Status = AgentWorkspaceMemberStatusActive
	}
	if member.ID != 0 || member.TeamID <= 0 || member.WorkspaceID <= 0 || member.UserID <= 0 || member.CreatedBy <= 0 || member.GrantedBy <= 0 ||
		member.UpdatedBy != nil && *member.UpdatedBy <= 0 || member.Revision != 0 && member.Revision != 1 ||
		!slices.Contains([]string{AgentWorkspaceRoleAdmin, AgentWorkspaceRoleDeveloper, AgentWorkspaceRoleOperator, AgentWorkspaceRoleViewer}, member.Role) ||
		!slices.Contains([]string{AgentWorkspaceMemberStatusActive, AgentWorkspaceMemberStatusBlocked}, member.Status) {
		return ErrAgentWorkspaceInvalid
	}
	member.Revision = 1
	member.CreatedAt = time.Now().UnixMilli()
	member.UpdatedAt = member.CreatedAt
	return nil
}

// CreateAgentWorkspace 在短事务内核对逻辑引用再创建，不创建隐式Team/成员。
// db须来自调用者的WithContext或已有事务；身份和创建动作授权仍由服务层负责。
func CreateAgentWorkspace(db *gorm.DB, workspace *AgentWorkspace) error {
	if db == nil || workspace == nil {
		return ErrAgentWorkspaceInvalid
	}
	if err := workspace.BeforeCreate(db); err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var team Team
		if err := lockForUpdate(tx).Select("id").Where("id = ?", workspace.TeamID).First(&team).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAgentWorkspaceReference
			}
			return err
		}
		actors := []int64{workspace.CreatedBy}
		if workspace.UpdatedBy != nil {
			actors = append(actors, *workspace.UpdatedBy)
		}
		if err := validateAgentWorkspaceTeamUsers(tx, workspace.TeamID, actors); err != nil {
			return err
		}
		return tx.Create(workspace).Error
	})
}

// validateAgentWorkspaceTeamUsers 验证现有启用用户和当前Team关系，不进行旧ID的窄化转换。
func validateAgentWorkspaceTeamUsers(tx *gorm.DB, teamID int64, userIDs []int64) error {
	slices.Sort(userIDs)
	for _, userID := range slices.Compact(userIDs) {
		var membership TeamMember
		if err := lockForUpdate(tx).Select("id").Where("team_id = ? AND user_id = ?", teamID, userID).First(&membership).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAgentWorkspaceReference
			}
			return err
		}
		var user User
		if err := lockForUpdate(tx).Select("id").Where("id = ? AND status = ?", userID, common.UserStatusEnabled).First(&user).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAgentWorkspaceReference
			}
			return err
		}
	}
	return nil
}

// GetAgentWorkspace 包含归档记录，便于后续访问服务明确判定状态；不是授权入口。
func GetAgentWorkspace(db *gorm.DB, teamID, workspaceID int64) (*AgentWorkspace, error) {
	if db == nil || teamID <= 0 || workspaceID <= 0 {
		return nil, ErrAgentWorkspaceInvalid
	}
	var workspace AgentWorkspace
	if err := db.Where("team_id = ? AND id = ?", teamID, workspaceID).First(&workspace).Error; err != nil {
		return nil, err
	}
	return &workspace, nil
}

// ListAgentWorkspaces 返回含归档状态的有界元数据摘要，省略描述及策略JSON。
// 它只执行租户过滤，不代表用户具有这些工作区的访问权。
func ListAgentWorkspaces(db *gorm.DB, teamID int64, offset, limit int) ([]AgentWorkspace, error) {
	if db == nil || teamID <= 0 || offset < 0 || offset > 10000 || limit < 1 || limit > 100 {
		return nil, ErrAgentWorkspaceInvalid
	}
	workspaces := make([]AgentWorkspace, 0)
	err := db.Omit("description", "policy_json").Where("team_id = ?", teamID).
		Order("created_at DESC, id DESC").Offset(offset).Limit(limit).Find(&workspaces).Error
	return workspaces, err
}

// CreateAgentWorkspaceMember 校验父工作区及同Team用户，角色动作权限由上层服务判定。
func CreateAgentWorkspaceMember(db *gorm.DB, member *AgentWorkspaceMember) error {
	if db == nil || member == nil {
		return ErrAgentWorkspaceInvalid
	}
	if err := member.BeforeCreate(db); err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var team Team
		if err := lockForUpdate(tx).Select("id").Where("id = ?", member.TeamID).First(&team).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAgentWorkspaceReference
			}
			return err
		}
		var workspace AgentWorkspace
		if err := lockForUpdate(tx).Select("id", "status").Where("team_id = ? AND id = ?", member.TeamID, member.WorkspaceID).First(&workspace).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAgentWorkspaceReference
			}
			return err
		}
		if workspace.Status != AgentWorkspaceStatusActive {
			return fmt.Errorf("%w: workspace is not active", ErrAgentWorkspaceReference)
		}
		actors := []int64{member.UserID, member.CreatedBy, member.GrantedBy}
		if member.UpdatedBy != nil {
			actors = append(actors, *member.UpdatedBy)
		}
		if err := validateAgentWorkspaceTeamUsers(tx, member.TeamID, actors); err != nil {
			return err
		}
		return tx.Create(member).Error
	})
}

// GetAgentWorkspaceMember 包含blocked行和已退出Team的残留行；上层仍须实时鉴权。
func GetAgentWorkspaceMember(db *gorm.DB, teamID, workspaceID, userID int64) (*AgentWorkspaceMember, error) {
	if db == nil || teamID <= 0 || workspaceID <= 0 || userID <= 0 {
		return nil, ErrAgentWorkspaceInvalid
	}
	var member AgentWorkspaceMember
	if err := db.Where("team_id = ? AND workspace_id = ? AND user_id = ?", teamID, workspaceID, userID).First(&member).Error; err != nil {
		return nil, err
	}
	return &member, nil
}

// ListAgentWorkspaceMembers 限定Team和Workspace，包含blocked元数据供授权管理使用。
func ListAgentWorkspaceMembers(db *gorm.DB, teamID, workspaceID int64, offset, limit int) ([]AgentWorkspaceMember, error) {
	if db == nil || teamID <= 0 || workspaceID <= 0 || offset < 0 || offset > 10000 || limit < 1 || limit > 100 {
		return nil, ErrAgentWorkspaceInvalid
	}
	members := make([]AgentWorkspaceMember, 0)
	err := db.Where("team_id = ? AND workspace_id = ?", teamID, workspaceID).
		Order("created_at DESC, id DESC").Offset(offset).Limit(limit).Find(&members).Error
	return members, err
}
