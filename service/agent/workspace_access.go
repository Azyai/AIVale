package agent

import (
	"context"
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/model"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
)

type WorkspaceAction string

const (
	WorkspaceRead    WorkspaceAction = "workspace:read"
	WorkspaceManage  WorkspaceAction = "workspace:manage"
	MemberManage     WorkspaceAction = "member:manage"
	AgentRead        WorkspaceAction = "agent:read"
	AgentWrite       WorkspaceAction = "agent:write"
	AgentPublish     WorkspaceAction = "agent:publish"
	SkillRead        WorkspaceAction = "skill:read"
	SkillWrite       WorkspaceAction = "skill:write"
	SkillPublish     WorkspaceAction = "skill:publish"
	MCPRead          WorkspaceAction = "mcp:read"
	MCPManage        WorkspaceAction = "mcp:manage"
	CredentialManage WorkspaceAction = "credential:manage"
	CredentialUse    WorkspaceAction = "credential:use"
	RunCreate        WorkspaceAction = "run:create"
	RunRead          WorkspaceAction = "run:read"
	RunContent       WorkspaceAction = "run:content"
	RunCancel        WorkspaceAction = "run:cancel"
	RunApprove       WorkspaceAction = "run:approve"
	ScheduleRead     WorkspaceAction = "schedule:read"
	ScheduleManage   WorkspaceAction = "schedule:manage"
	TokenGrantManage WorkspaceAction = "token-grant:manage"
	UsageRead        WorkspaceAction = "usage:read"
	ArtifactRead     WorkspaceAction = "artifact:read"
	ArtifactWrite    WorkspaceAction = "artifact:write"
)

type WorkspacePermissionScope string

const (
	WorkspaceScopeNone        WorkspacePermissionScope = "none"
	WorkspaceScopeWorkspace   WorkspacePermissionScope = "workspace"
	WorkspaceScopeMetadata    WorkspacePermissionScope = "metadata"
	WorkspaceScopeOwn         WorkspacePermissionScope = "own"
	WorkspaceScopeOwnOrShared WorkspacePermissionScope = "own_or_shared"
	WorkspaceScopeExplicit    WorkspacePermissionScope = "explicit"
	WorkspaceScopeBinding     WorkspacePermissionScope = "binding"
	WorkspaceScopeApproval    WorkspacePermissionScope = "approval"
	WorkspaceScopeTeamBilling WorkspacePermissionScope = "team_billing"
	WorkspaceScopeAggregate   WorkspacePermissionScope = "aggregate"
	WorkspaceScopeParent      WorkspacePermissionScope = "parent"
)

// WorkspacePermission 描述默认角色可候选的操作范围，不是最终授权结果。
// RequiresResourceCheck为true的条目还没有对应资源事实，当前入口一律拒绝。
type WorkspacePermission struct {
	Action                WorkspaceAction          `json:"-"`
	Scope                 WorkspacePermissionScope `json:"-"`
	RequiresResourceCheck bool                     `json:"-"`
}

// WorkspacePermissionForRole 是计划6.2的候选权限字典，不读取或证明调用者身份。
// 不接受可从请求传入的sharing/binding/approval布尔值来跳过持久化资源判定。
func WorkspacePermissionForRole(role string, action WorkspaceAction) WorkspacePermission {
	permission := WorkspacePermission{Action: action, Scope: WorkspaceScopeNone}
	admin := role == model.AgentWorkspaceRoleAdmin
	developer := role == model.AgentWorkspaceRoleDeveloper
	operator := role == model.AgentWorkspaceRoleOperator
	viewer := role == model.AgentWorkspaceRoleViewer
	if !admin && !developer && !operator && !viewer {
		return permission
	}
	switch action {
	case WorkspaceRead:
		permission.Scope = WorkspaceScopeWorkspace
	case AgentRead, SkillRead, MCPRead, ScheduleRead:
		// 元数据许可不包含私密正文、连接秘密或触发输入。
		permission.Scope = WorkspaceScopeMetadata
	case WorkspaceManage, MemberManage, MCPManage, CredentialManage:
		if admin {
			permission.Scope = WorkspaceScopeWorkspace
		}
	case AgentWrite, AgentPublish, SkillWrite, SkillPublish, ScheduleManage:
		if admin || developer {
			permission.Scope = WorkspaceScopeWorkspace
		}
	case CredentialUse:
		if admin {
			permission.Scope = WorkspaceScopeWorkspace
		} else if developer || operator {
			permission.Scope = WorkspaceScopeBinding
		}
		permission.RequiresResourceCheck = permission.Scope != WorkspaceScopeNone
	case RunCreate:
		if admin || developer || operator {
			permission.Scope = WorkspaceScopeWorkspace
			permission.RequiresResourceCheck = true // 还须资金Token、模型和工具准入。
		}
	case RunRead:
		permission.Scope = WorkspaceScopeWorkspace
		if viewer {
			permission.Scope = WorkspaceScopeMetadata
		}
	case RunContent:
		if admin {
			permission.Scope = WorkspaceScopeWorkspace
		} else if developer {
			permission.Scope = WorkspaceScopeOwnOrShared
		} else if operator {
			permission.Scope = WorkspaceScopeExplicit
		}
		permission.RequiresResourceCheck = permission.Scope != WorkspaceScopeNone
	case RunCancel:
		if admin || operator {
			permission.Scope = WorkspaceScopeWorkspace
		} else if developer {
			permission.Scope = WorkspaceScopeOwn
		}
		permission.RequiresResourceCheck = permission.Scope != WorkspaceScopeNone
	case RunApprove:
		if admin || operator {
			permission.Scope = WorkspaceScopeApproval
			permission.RequiresResourceCheck = true
		}
	case TokenGrantManage:
		if admin {
			permission.Scope = WorkspaceScopeWorkspace
		} else if developer {
			permission.Scope = WorkspaceScopeOwn
		}
		permission.RequiresResourceCheck = permission.Scope != WorkspaceScopeNone
	case UsageRead:
		switch role {
		case model.AgentWorkspaceRoleAdmin:
			permission.Scope = WorkspaceScopeTeamBilling
		case model.AgentWorkspaceRoleDeveloper:
			permission.Scope = WorkspaceScopeOwn
		case model.AgentWorkspaceRoleOperator:
			permission.Scope = WorkspaceScopeExplicit
		case model.AgentWorkspaceRoleViewer:
			permission.Scope = WorkspaceScopeAggregate
		}
		permission.RequiresResourceCheck = true
	case ArtifactRead, ArtifactWrite:
		if !viewer {
			permission.Scope = WorkspaceScopeParent
			permission.RequiresResourceCheck = true
		}
	}
	return permission
}

// WorkspaceAccess 是本次已判定动作及数据库范围的内部快照，不可当长期能力令牌。
// 每次请求或后续有副作用步骤必须重新Authorize，不能复用旧Role/Scope跳过撤销。
type WorkspaceAccess struct {
	UserID          int64                    `json:"-"`
	Scope           model.AgentScope         `json:"-"`
	Role            string                   `json:"-"`
	WorkspaceStatus string                   `json:"-"`
	Action          WorkspaceAction          `json:"-"`
	PermissionScope WorkspacePermissionScope `json:"-"`
}

// AuthorizeWorkspace 接受现有身份链已验证的管理会话，不接受客户端有效Team或角色。
// 它仅授权工作区层动作；发布依赖校验等业务前提仍由相应服务检查。
// db必须是本次主库基础连接，不接受已有事务快照作为实时授权事实。
func AuthorizeWorkspace(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID int64, action WorkspaceAction) (*WorkspaceAccess, error) {
	if ctx == nil || db == nil || db.Config == nil || db.Statement == nil || db.Statement.ConnPool == nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if _, transactional := db.Statement.ConnPool.(gorm.TxCommitter); transactional {
		// sql.Tx及GORM PreparedStmtTX均实现TxCommitter，不能跨请求复用旧快照。
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if identity.UserID <= 0 || identity.SessionID == "" || len(identity.SessionID) > 64 || strings.HasPrefix(identity.SessionID, "pat:") || identity.UserAuthVersion <= 0 || identity.SessionVersion <= 0 {
		return nil, agenttypes.NewError(agenttypes.AuthRequired, nil)
	}
	if workspaceID <= 0 {
		return nil, agenttypes.NewInvalidArgument("workspace_id", "Workspace ID must be positive")
	}
	if err := ctx.Err(); err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	database := db.WithContext(ctx)
	record, err := model.LoadAgentWorkspaceAccess(database, identity, workspaceID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		active, lookupErr := model.AgentWorkspaceSessionActive(database, identity)
		if lookupErr != nil {
			return nil, agenttypes.NewError(agenttypes.InternalError, lookupErr)
		}
		if !active {
			return nil, agenttypes.NewError(agenttypes.AuthRequired, nil)
		}
		return nil, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	if err := ctx.Err(); err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	if record.UserID <= 0 || record.TeamID <= 0 || record.TeamOwnerUserID <= 0 || record.WorkspaceID != workspaceID || record.WorkspaceArchivedAt != nil ||
		(record.WorkspaceStatus != model.AgentWorkspaceStatusActive && record.WorkspaceStatus != model.AgentWorkspaceStatusSuspended) {
		return nil, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	role := record.WorkspaceMemberRole
	if record.TeamOwnerUserID == record.UserID {
		if record.TeamMemberRole != model.TeamRoleOwner {
			return nil, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
		}
		role = model.AgentWorkspaceRoleAdmin
	} else if record.TeamMemberRole != model.TeamRoleMember || record.WorkspaceMemberID == nil || record.WorkspaceMemberStatus != model.AgentWorkspaceMemberStatusActive {
		return nil, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if WorkspacePermissionForRole(role, WorkspaceRead).Scope == WorkspaceScopeNone {
		return nil, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	permission := WorkspacePermissionForRole(role, action)
	if permission.Scope == WorkspaceScopeNone || permission.RequiresResourceCheck {
		return nil, agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	if record.WorkspaceStatus == model.AgentWorkspaceStatusSuspended {
		switch action {
		case WorkspaceRead, WorkspaceManage, MemberManage, AgentRead, SkillRead, MCPRead, RunRead, ScheduleRead:
		default:
			return nil, agenttypes.NewError(agenttypes.PermissionDenied, nil)
		}
	}
	return &WorkspaceAccess{
		UserID: record.UserID, Scope: model.AgentScope{TeamID: record.TeamID, WorkspaceID: record.WorkspaceID},
		Role: role, WorkspaceStatus: record.WorkspaceStatus, Action: action, PermissionScope: permission.Scope,
	}, nil
}
