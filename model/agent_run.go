package model

import (
	"bytes"
	"errors"
	"slices"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const (
	AgentRunStatusQueued          = "queued"
	AgentRunStatusRunning         = "running"
	AgentRunStatusWaitingApproval = "waiting_approval"
	AgentRunStatusCancelling      = "cancelling"
	AgentRunStatusSucceeded       = "succeeded"
	AgentRunStatusFailed          = "failed"
	AgentRunStatusCancelled       = "cancelled"
	AgentRunStatusTimedOut        = "timed_out"
)

var (
	ErrAgentRunInvalid   = errors.New("invalid agent run metadata")
	ErrAgentRunReference = errors.New("invalid agent run reference")
)

// AgentRun is the persistent identity of one fixed-version execution. P02-T08
// creates metadata only: no worker, run-ready event or execution permit exists.
// P06/P10 add conversation, checkpoint, parent and root execution fields later.
type AgentRun struct {
	ID                  int64   `json:"-" gorm:"primaryKey;index:idx_ag_runs_workspace_created_id,priority:3;index:idx_ag_runs_workspace_agent_created_id,priority:4;index:idx_ag_runs_status_available_id,priority:3;index:idx_ag_runs_status_lease_id,priority:3;comment:Run主键，由GORM生成"` // Run主键，由GORM生成。
	CreatedAt           int64   `json:"-" gorm:"type:bigint;not null;autoCreateTime:false;index:idx_ag_runs_workspace_created_id,priority:2;index:idx_ag_runs_workspace_agent_created_id,priority:3;comment:创建时间，UTC毫秒"`                                                                   // 创建时间，UTC毫秒。
	UpdatedAt           int64   `json:"-" gorm:"type:bigint;not null;autoUpdateTime:false;comment:最后变更时间，UTC毫秒"`                                                                                                                                                                           // 最后变更时间，UTC毫秒。
	Revision            int64   `json:"-" gorm:"type:bigint;not null;comment:乐观锁版本，创建为1"`                                                                                                                                                                                                  // 乐观锁版本，创建为1。
	TeamID              int64   `json:"-" gorm:"type:bigint;not null;comment:当前团队归属"`                                                                                                                                                                                                      // 当前团队归属。
	WorkspaceID         int64   `json:"-" gorm:"type:bigint;not null;index:idx_ag_runs_workspace_created_id,priority:1;index:idx_ag_runs_workspace_agent_created_id,priority:1;comment:所属团队工作区"`                                                                                           // 所属团队工作区。
	AgentID             int64   `json:"-" gorm:"type:bigint;not null;index:idx_ag_runs_workspace_agent_created_id,priority:2;comment:所属Agent定义"`                                                                                                                                           // 所属Agent定义。
	AgentVersionID      int64   `json:"-" gorm:"type:bigint;not null;comment:已解析的同Agent不可变版本"`                                                                                                                                                                                             // 已解析的同Agent不可变版本。
	CreatedBy           int64   `json:"-" gorm:"type:bigint;not null;comment:同团队启用的发起用户"`                                                                                                                                                                                                  // 同团队启用的发起用户。
	TriggerType         string  `json:"-" gorm:"type:varchar(16);not null;comment:触发类别，本阶段仅manual"`                                                                                                                                                                                        // 触发类别，本阶段仅manual。
	Mode                string  `json:"-" gorm:"type:varchar(16);not null;comment:运行模式，本阶段仅production"`                                                                                                                                                                                    // 运行模式，本阶段仅production。
	RetryOfRunID        *int64  `json:"-" gorm:"type:bigint;comment:显式新建重试Run的来源，本阶段为空"`                                                                                                                                                                                                   // 显式新建重试Run的来源，本阶段为空。
	CallerTokenID       *int64  `json:"-" gorm:"type:bigint;comment:API发起Token，本阶段管理会话创建为空"`                                                                                                                                                                                               // API发起Token，本阶段管理会话创建为空。
	FundingTokenID      int64   `json:"-" gorm:"type:bigint;not null;comment:同团队本人持有的模型Token引用，不保存Key"`                                                                                                                                                                                    // 同团队本人持有的模型Token引用，不保存Key。
	Status              string  `json:"-" gorm:"type:varchar(24);not null;index:idx_ag_runs_status_available_id,priority:1;index:idx_ag_runs_status_lease_id,priority:1;comment:公开八态，创建仅queued"`                                                                                           // 公开八态，创建仅queued。
	InputJSON           string  `json:"-" gorm:"column:input_json;type:text;not null;comment:规范化输入对象，最多60KiB"`                                                                                                                                                                             // 规范化输入对象，最多60KiB。
	MetadataJSON        string  `json:"-" gorm:"column:metadata_json;type:text;not null;comment:非秘密业务关联对象，最多4KiB"`                                                                                                                                                                         // 非秘密业务关联对象，最多4KiB。
	ResultJSON          *string `json:"-" gorm:"column:result_json;type:text;comment:受控小型结果，创建为空"`                                                                                                                                                                                         // 受控小型结果，创建为空。
	InputHash           string  `json:"-" gorm:"type:varchar(64);not null;comment:输入及固定版本和实际主体上下文摘要"`                                                                                                                                                                                      // 输入及固定版本和实际主体上下文摘要。
	ErrorCode           *string `json:"-" gorm:"type:varchar(64);comment:稳定机器错误码，创建为空"`                                                                                                                                                                                                    // 稳定机器错误码，创建为空。
	ErrorMessage        *string `json:"-" gorm:"type:varchar(512);comment:脱敏用户错误，创建为空"`                                                                                                                                                                                                    // 脱敏用户错误，创建为空。
	TraceID             string  `json:"-" gorm:"type:varchar(64);not null;comment:服务端生成的关联标识"`                                                                                                                                                                                             // 服务端生成的关联标识。
	Priority            int32   `json:"-" gorm:"type:int;not null;comment:受控优先级，本阶段固定0"`                                                                                                                                                                                                   // 受控优先级，本阶段固定0。
	AvailableAt         int64   `json:"-" gorm:"type:bigint;not null;index:idx_ag_runs_status_available_id,priority:2;comment:允许领取时间，UTC毫秒，当前无领取入口"`                                                                                                                                       // 允许领取时间，UTC毫秒，当前无领取入口。
	StartedAt           *int64  `json:"-" gorm:"type:bigint;comment:实际开始时间，创建为空"`                                                                                                                                                                                                          // 实际开始时间，创建为空。
	FinishedAt          *int64  `json:"-" gorm:"type:bigint;comment:实际终态时间，创建为空"`                                                                                                                                                                                                          // 实际终态时间，创建为空。
	DeadlineAt          int64   `json:"-" gorm:"type:bigint;not null;comment:包含排队和审批的总墙钟截止，UTC毫秒"`                                                                                                                                                                                         // 包含排队和审批的总墙钟截止，UTC毫秒。
	QueueDeadlineAt     int64   `json:"-" gorm:"type:bigint;not null;comment:首次排队截止，UTC毫秒"`                                                                                                                                                                                                // 首次排队截止，UTC毫秒。
	ExecutionBudgetMS   int64   `json:"-" gorm:"column:execution_budget_ms;type:bigint;not null;comment:累计实际执行预算毫秒，不随排队增长"`                                                                                                                                                                // 累计实际执行预算毫秒，不随排队增长。
	ActiveElapsedMS     int64   `json:"-" gorm:"column:active_elapsed_ms;type:bigint;not null;comment:已结转实际执行毫秒，创建为0"`                                                                                                                                                                     // 已结转实际执行毫秒，创建为0。
	ActiveStartedAt     *int64  `json:"-" gorm:"type:bigint;comment:当前执行片段开始，创建为空"`                                                                                                                                                                                                        // 当前执行片段开始，创建为空。
	CancelRequestedAt   *int64  `json:"-" gorm:"type:bigint;comment:取消请求时间，创建为空"`                                                                                                                                                                                                          // 取消请求时间，创建为空。
	LeaseOwner          *string `json:"-" gorm:"type:varchar(96);comment:持有租约的Worker，创建为空"`                                                                                                                                                                                                // 持有租约的Worker，创建为空。
	LeaseEpoch          int64   `json:"-" gorm:"type:bigint;not null;comment:租约fencing代次，创建为0"`                                                                                                                                                                                            // 租约fencing代次，创建为0。
	LeaseExpiresAt      *int64  `json:"-" gorm:"type:bigint;index:idx_ag_runs_status_lease_id,priority:2;comment:租约截止，创建为空"`                                                                                                                                                               // 租约截止，创建为空。
	HeartbeatAt         *int64  `json:"-" gorm:"type:bigint;comment:最近心跳，创建为空"`                                                                                                                                                                                                            // 最近心跳，创建为空。
	Attempt             int32   `json:"-" gorm:"type:int;not null;comment:调度尝试次数，创建为0"`                                                                                                                                                                                                    // 调度尝试次数，创建为0。
	LastEventSeq        int64   `json:"-" gorm:"type:bigint;not null;comment:已提交事件最大序号，创建为0"`                                                                                                                                                                                              // 已提交事件最大序号，创建为0。
	BudgetLimitQuota    int64   `json:"-" gorm:"type:bigint;not null;comment:预算上限，既有quota单位，尚不构成调用许可"`                                                                                                                                                                                     // 预算上限，既有quota单位，尚不构成调用许可。
	BudgetReservedQuota int64   `json:"-" gorm:"type:bigint;not null;comment:待结算预算预留，创建为0，不扣钱包"`                                                                                                                                                                                           // 待结算预算预留，创建为0，不扣钱包。
	BudgetConsumedQuota int64   `json:"-" gorm:"type:bigint;not null;comment:已确认费用汇总投影，创建为0"`                                                                                                                                                                                              // 已确认费用汇总投影，创建为0。
	BudgetPolicy        string  `json:"-" gorm:"type:varchar(16);not null;comment:预算政策，本阶段仅strict"`                                                                                                                                                                                        // 预算政策，本阶段仅strict。
	MaxModelCalls       int32   `json:"-" gorm:"type:int;not null;comment:模型调用上限，本阶段为1"`                                                                                                                                                                                                   // 模型调用上限，本阶段为1。
	MaxToolCalls        int32   `json:"-" gorm:"type:int;not null;comment:工具调用上限，本阶段为0"`                                                                                                                                                                                                   // 工具调用上限，本阶段为0。
	ModelCallCount      int32   `json:"-" gorm:"type:int;not null;comment:已接受模型调用次数，创建为0"`                                                                                                                                                                                                 // 已接受模型调用次数，创建为0。
	ToolCallCount       int32   `json:"-" gorm:"type:int;not null;comment:已接受工具调用次数，创建为0"`                                                                                                                                                                                                 // 已接受工具调用次数，创建为0。
	MaxSteps            int32   `json:"-" gorm:"type:int;not null;comment:总步骤上限，1至64"`                                                                                                                                                                                                     // 总步骤上限，1至64。
	StepCount           int32   `json:"-" gorm:"type:int;not null;comment:已分配步骤数，创建为0"`                                                                                                                                                                                                    // 已分配步骤数，创建为0。
	UsageState          string  `json:"-" gorm:"type:varchar(32);not null;comment:费用投影状态，创建为pending"`                                                                                                                                                                                      // 费用投影状态，创建为pending。
	RequiresReconcile   int32   `json:"-" gorm:"type:int;not null;comment:核账标记，创建为0"`                                                                                                                                                                                                      // 核账标记，创建为0。
	AuthSnapshotJSON    string  `json:"-" gorm:"column:auth_snapshot_json;type:text;not null;comment:版本化能力上界摘要，不覆盖实时授权"`                                                                                                                                                                   // 版本化能力上界摘要，不覆盖实时授权。
}

func (AgentRun) TableName() string { return "ag_runs" }

func ValidAgentRunStatus(status string) bool {
	return slices.Contains([]string{AgentRunStatusQueued, AgentRunStatusRunning, AgentRunStatusWaitingApproval, AgentRunStatusCancelling, AgentRunStatusSucceeded, AgentRunStatusFailed, AgentRunStatusCancelled, AgentRunStatusTimedOut}, status)
}

func IsAgentRunTerminal(status string) bool {
	return slices.Contains([]string{AgentRunStatusSucceeded, AgentRunStatusFailed, AgentRunStatusCancelled, AgentRunStatusTimedOut}, status)
}

func (run *AgentRun) BeforeCreate(tx *gorm.DB) error {
	if tx == nil || tx.Statement == nil {
		return ErrAgentRunInvalid
	}
	if _, exists := tx.Statement.Clauses["ON CONFLICT"]; exists {
		return ErrAgentRunInvalid // metadata is append-only; never permit an upsert.
	}
	if run.Status == "" {
		run.Status = AgentRunStatusQueued
	}
	if run.TriggerType == "" {
		run.TriggerType = "manual"
	}
	if run.Mode == "" {
		run.Mode = "production"
	}
	if run.BudgetPolicy == "" {
		run.BudgetPolicy = "strict"
	}
	if run.UsageState == "" {
		run.UsageState = "pending"
	}
	if run.ID != 0 || run.TeamID <= 0 || run.WorkspaceID <= 0 || run.AgentID <= 0 || run.AgentVersionID <= 0 || run.CreatedBy <= 0 || run.FundingTokenID <= 0 ||
		run.CreatedAt != 0 || run.UpdatedAt != 0 || run.Revision != 0 && run.Revision != 1 || run.RetryOfRunID != nil || run.CallerTokenID != nil ||
		run.Status != AgentRunStatusQueued || run.TriggerType != "manual" || run.Mode != "production" || run.BudgetPolicy != "strict" || run.UsageState != "pending" ||
		run.ResultJSON != nil || run.ErrorCode != nil || run.ErrorMessage != nil || run.Priority != 0 || run.StartedAt != nil || run.FinishedAt != nil ||
		run.ActiveElapsedMS != 0 || run.ActiveStartedAt != nil || run.CancelRequestedAt != nil || run.LeaseOwner != nil || run.LeaseEpoch != 0 || run.LeaseExpiresAt != nil || run.HeartbeatAt != nil ||
		run.Attempt != 0 || run.LastEventSeq != 0 || run.BudgetReservedQuota != 0 || run.BudgetConsumedQuota != 0 || run.ModelCallCount != 0 || run.ToolCallCount != 0 || run.StepCount != 0 || run.RequiresReconcile != 0 ||
		run.BudgetLimitQuota < 0 || run.BudgetLimitQuota > 2147483647 || run.MaxModelCalls != 1 || run.MaxToolCalls != 0 || run.MaxSteps < 1 || run.MaxSteps > 64 ||
		!agentDigestValid(run.InputHash) || len(run.TraceID) < 1 || len(run.TraceID) > 64 {
		return ErrAgentRunInvalid
	}
	for _, value := range []byte(run.TraceID) {
		if value < 0x21 || value > 0x7e {
			return ErrAgentRunInvalid
		}
	}
	for _, value := range []struct {
		text  string
		limit int
	}{{run.InputJSON, 60 * 1024}, {run.MetadataJSON, 4096}, {run.AuthSnapshotJSON, 16 * 1024}} {
		if len(value.text) > value.limit {
			return ErrAgentRunInvalid
		}
		if _, err := common.UnmarshalJSONObjectStrict([]byte(value.text)); err != nil {
			return ErrAgentRunInvalid
		}
		// Application-level canonicalization owns the request fingerprint. The
		// storage hook verifies but never rewrites hashed JSON or rounds numbers.
	}
	auth, err := common.UnmarshalJSONObjectStrict([]byte(run.AuthSnapshotJSON))
	if err != nil || len(auth) != 9 || !bytes.Equal(bytes.TrimSpace(auth["schema_version"]), []byte("1")) ||
		!bytes.Equal(bytes.TrimSpace(auth["admission"]), []byte(`"metadata_only"`)) || !bytes.Equal(bytes.TrimSpace(auth["subject_type"]), []byte(`"session"`)) {
		return ErrAgentRunInvalid
	}
	for _, reference := range []struct {
		field string
		id    int64
	}{{"subject_id", run.CreatedBy}, {"team_id", run.TeamID}, {"workspace_id", run.WorkspaceID}, {"agent_id", run.AgentID}, {"agent_version_id", run.AgentVersionID}, {"funding_token_id", run.FundingTokenID}} {
		encoded, err := common.Marshal(strconv.FormatInt(reference.id, 10))
		if err != nil || !bytes.Equal(bytes.TrimSpace(auth[reference.field]), encoded) {
			return ErrAgentRunInvalid
		}
	}
	now := time.Now().UnixMilli()
	if run.AvailableAt == 0 {
		run.AvailableAt = now
	}
	if run.DeadlineAt == 0 {
		run.DeadlineAt = now + int64(25*time.Hour/time.Millisecond)
	}
	if run.QueueDeadlineAt == 0 {
		run.QueueDeadlineAt = now + int64(10*time.Minute/time.Millisecond)
	}
	if run.ExecutionBudgetMS == 0 {
		run.ExecutionBudgetMS = 300000
	}
	if now <= 0 || now > agentDefinitionMaxInteger-int64(25*time.Hour/time.Millisecond) || run.AvailableAt <= 0 || run.AvailableAt > now ||
		run.DeadlineAt <= now || run.DeadlineAt > now+int64(25*time.Hour/time.Millisecond) || run.QueueDeadlineAt <= now || run.QueueDeadlineAt > run.DeadlineAt ||
		run.QueueDeadlineAt > now+int64(10*time.Minute/time.Millisecond) || run.ExecutionBudgetMS < 1 || run.ExecutionBudgetMS > 300000 {
		return ErrAgentRunInvalid
	}
	// The create callback's Statement belongs to ag_runs. Parent queries need a
	// fresh statement while retaining the same transaction connection and locks.
	tx = tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard})
	if err := lockAgentDefinitionParents(tx, run.TeamID, run.WorkspaceID, run.CreatedBy); err != nil {
		return errors.Join(ErrAgentRunReference, err)
	}
	var definition AgentDefinition
	if err := lockForUpdate(tx).Select("id", "next_version").Where("team_id = ? AND workspace_id = ? AND id = ? AND archived_at IS NULL AND "+agentWorkspaceExactColumn(tx, "status")+" = ?", run.TeamID, run.WorkspaceID, run.AgentID, AgentDefinitionStatusActive).Take(&definition).Error; err != nil {
		return errors.Join(ErrAgentRunReference, err)
	}
	var version AgentVersion
	if err := lockForUpdate(tx).Select("id").Where("team_id = ? AND workspace_id = ? AND agent_id = ? AND id = ? AND "+agentWorkspaceExactColumn(tx, "version_kind")+" = ? AND published_at > 0 AND revoked_at IS NULL AND version_no > 0 AND version_no < ?", run.TeamID, run.WorkspaceID, run.AgentID, run.AgentVersionID, AgentVersionKindRelease, definition.NextVersion).Take(&version).Error; err != nil {
		return errors.Join(ErrAgentRunReference, err)
	}
	facts := &AgentWorkspaceWriteFacts{TeamID: run.TeamID, UserID: run.CreatedBy, Workspace: &AgentWorkspace{ID: run.WorkspaceID, TeamID: run.TeamID, Status: AgentWorkspaceStatusActive}}
	if _, err := LockAgentRunFundingToken(tx, facts, run.FundingTokenID); err != nil {
		return err
	}
	run.CreatedAt, run.UpdatedAt, run.Revision = now, now, 1
	return nil
}

func (*AgentRun) BeforeUpdate(*gorm.DB) error { return ErrAgentRunInvalid }
func (*AgentRun) BeforeDelete(*gorm.DB) error { return ErrAgentRunInvalid }

// AgentRunFundingToken is a non-secret reference check, not permission to call
// a model or a conclusion about the Token's balance, scope or model allowance.
type AgentRunFundingToken struct {
	ID          int64 `json:"-"`
	UserID      int64 `json:"-"`
	TeamID      int64 `json:"-"`
	Status      int   `json:"-"`
	ExpiredTime int64 `json:"-"`
}

// LockAgentRunFundingToken rechecks a same-Team, personally held live reference
// inside the workspace transaction without selecting usable Key material.
func LockAgentRunFundingToken(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, tokenID int64) (*AgentRunFundingToken, error) {
	if !agentDraftWriteScopeValid(tx, facts) || tokenID <= 0 {
		return nil, ErrAgentRunInvalid
	}
	var token AgentRunFundingToken
	err := lockForUpdate(tx.Session(&gorm.Session{Logger: logger.Discard})).Table("tokens").
		Select("id", "user_id", "team_id", "status", "expired_time").
		Where("id = ? AND user_id = ? AND team_id = ? AND deleted_at IS NULL", tokenID, facts.UserID, facts.TeamID).
		Take(&token).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAgentRunReference
	}
	if err != nil {
		return nil, err
	}
	if token.Status != common.TokenStatusEnabled || token.ExpiredTime != -1 && token.ExpiredTime <= time.Now().Unix() {
		return nil, ErrAgentRunReference
	}
	return &token, nil
}

// CreateLockedAgentRunMetadata is called only after the application authorizes
// the current management facts. It never sends a run-ready notification.
func CreateLockedAgentRunMetadata(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, run *AgentRun) error {
	if !agentDraftWriteScopeValid(tx, facts) || run == nil || run.TeamID != facts.TeamID || run.WorkspaceID != facts.Workspace.ID || run.CreatedBy != facts.UserID {
		return ErrAgentRunInvalid
	}
	return tx.Session(&gorm.Session{Logger: logger.Discard}).Create(run).Error
}
