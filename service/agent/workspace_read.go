package agent

import (
	"context"
	"errors"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/model"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
)

// WorkspaceView 是当前可见工作区的内部投影；公开字段转换由DTO负责。
type WorkspaceView struct {
	ID                   int64             `json:"-"`
	TeamID               int64             `json:"-"`
	Slug                 string            `json:"-"`
	Name                 string            `json:"-"`
	Description          string            `json:"-"`
	Status               string            `json:"-"`
	CreatedAt            int64             `json:"-"`
	UpdatedAt            int64             `json:"-"`
	Revision             int64             `json:"-"`
	Role                 string            `json:"-"`
	EffectivePermissions []WorkspaceAction `json:"-"`
}

type WorkspaceList struct {
	Items    []WorkspaceView `json:"-"`
	Total    int64           `json:"-"`
	Page     int64           `json:"-"`
	PageSize int             `json:"-"`
	NoTeam   bool            `json:"-"`
}

// ListWorkspaces 读取当前管理主体的可见空间，Team来源仅为数据库当前成员关系。
func ListWorkspaces(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, page agenttypes.PageQuery, query string) (*WorkspaceList, error) {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return nil, err
	}
	offset, err := page.Offset()
	if err != nil {
		return nil, err
	}
	if !utf8.ValidString(query) || strings.ContainsRune(query, 0) || len(query) > 512 || utf8.RuneCountInString(query) > 128 {
		return nil, agenttypes.NewInvalidArgument("q", "Name filter must contain at most 128 valid characters")
	}
	query = strings.TrimSpace(query)
	if err := ctx.Err(); err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	database := db.WithContext(ctx)
	principal, err := model.LoadAgentWorkspaceReadPrincipal(database, identity)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, agenttypes.NewError(agenttypes.AuthRequired, nil)
	}
	if err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	result := &WorkspaceList{Items: []WorkspaceView{}, Page: page.Page(), PageSize: page.PageSize()}
	if principal.TeamID == nil || *principal.TeamID <= 0 || principal.TeamOwnerUserID == nil || *principal.TeamOwnerUserID <= 0 {
		if err := ctx.Err(); err != nil {
			return nil, agenttypes.NewError(agenttypes.InternalError, err)
		}
		result.NoTeam = true
		return result, nil
	}
	orders := make([]string, 0, 2)
	for _, term := range page.Sort() {
		orders = append(orders, "ag_workspaces."+string(term.Field)+" "+strings.ToUpper(string(term.Direction)))
	}
	records, total, err := model.ReadAgentWorkspaces(database, identity, query, offset, page.PageSize(), orders)
	if err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	if err := ctx.Err(); err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	// 读窗口中的身份/退组变化不保留先前COUNT结果；新查询本身也包含live谓词。
	current, err := model.LoadAgentWorkspaceReadPrincipal(database, identity)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, agenttypes.NewError(agenttypes.AuthRequired, nil)
	}
	if err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	if err := ctx.Err(); err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	if current.TeamID == nil || current.TeamOwnerUserID == nil || *current.TeamID <= 0 || *current.TeamOwnerUserID <= 0 {
		result.NoTeam = true
		return result, nil
	}
	if *current.TeamID != *principal.TeamID || *current.TeamOwnerUserID != *principal.TeamOwnerUserID || current.TeamMemberRole != principal.TeamMemberRole {
		return nil, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	result.Total = total
	for _, record := range records {
		result.Items = append(result.Items, workspaceReadProjection(record))
	}
	return result, nil
}

// GetWorkspace 详情的数据与可见范围使用同一数据库查询，不相信已绑定的旧Scope。
func GetWorkspace(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID int64) (*WorkspaceView, error) {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return nil, err
	}
	if workspaceID <= 0 {
		return nil, agenttypes.NewInvalidArgument("workspace_id", "Workspace ID must be positive")
	}
	if err := ctx.Err(); err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	database := db.WithContext(ctx)
	record, err := model.ReadAgentWorkspace(database, identity, workspaceID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		_, lookupErr := model.LoadAgentWorkspaceReadPrincipal(database, identity)
		if errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			return nil, agenttypes.NewError(agenttypes.AuthRequired, nil)
		}
		if lookupErr != nil {
			return nil, agenttypes.NewError(agenttypes.InternalError, lookupErr)
		}
		return nil, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	if err := ctx.Err(); err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, err)
	}
	result := workspaceReadProjection(*record)
	return &result, nil
}

// WorkspaceEffectivePermissions 返回角色和工作区状态当前允许的无需额外资源事实的动作。
// 结果按动作名排序；非法角色或状态返回空集合，不构成业务资源的授权判定。
func WorkspaceEffectivePermissions(role, status string) []WorkspaceAction {
	permissions := make([]WorkspaceAction, 0, 15)
	for _, action := range []WorkspaceAction{WorkspaceRead, WorkspaceManage, MemberManage, AgentRead, AgentWrite, AgentPublish, SkillRead, SkillWrite, SkillPublish, MCPRead, MCPManage, CredentialManage, CredentialUse, RunCreate, RunRead, RunContent, RunCancel, RunApprove, ScheduleRead, ScheduleManage, TokenGrantManage, UsageRead, ArtifactRead, ArtifactWrite} {
		if workspaceActionPermitted(role, status, action) {
			permissions = append(permissions, action)
		}
	}
	slices.Sort(permissions)
	return permissions
}

// workspaceReadProjection 从已授权投影生成当前真正可直接调用的动作摘要，不读额外资源。
func workspaceReadProjection(record model.AgentWorkspaceReadRecord) WorkspaceView {
	return WorkspaceView{
		ID: record.ID, TeamID: record.TeamID, Slug: record.Slug, Name: record.Name, Description: record.Description,
		Status: record.Status, CreatedAt: record.CreatedAt, UpdatedAt: record.UpdatedAt, Revision: record.Revision,
		Role: record.Role, EffectivePermissions: WorkspaceEffectivePermissions(record.Role, record.Status),
	}
}
