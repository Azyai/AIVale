package model

import (
	"errors"
	"regexp"
	"slices"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const (
	AgentRunStepKindModel        = "model"
	AgentRunStepKindTool         = "tool"
	AgentRunStepKindSkillLoad    = "skill_load"
	AgentRunStepKindSandbox      = "sandbox"
	AgentRunStepKindApproval     = "approval"
	AgentRunStepKindWorkflowNode = "workflow_node"

	AgentRunStepStatusPending         = "pending"
	AgentRunStepStatusRunning         = "running"
	AgentRunStepStatusWaitingApproval = "waiting_approval"
	AgentRunStepStatusSucceeded       = "succeeded"
	AgentRunStepStatusFailed          = "failed"
	AgentRunStepStatusCancelled       = "cancelled"
	AgentRunStepStatusOutcomeUnknown  = "outcome_unknown"
	AgentRunStepStatusSkipped         = "skipped"

	AgentRunStepSideEffectReadOnly      = "read_only"
	AgentRunStepSideEffectIdempotent    = "idempotent"
	AgentRunStepSideEffectNonIdempotent = "non_idempotent"
	AgentRunStepSideEffectUnknown       = "unknown"
)

var (
	ErrAgentRunStepInvalid   = errors.New("invalid agent run step")
	ErrAgentRunStepReference = errors.New("invalid agent run step reference")
	agentRunStepKey          = regexp.MustCompile(`^[a-z0-9][a-z0-9._:/-]{0,95}$`)
)

// AgentRunStep 保存一次逻辑步骤的独立尝试，不构成模型或工具调用许可。
// 当前只允许创建首个 pending 尝试；后续推进必须使用校验租约的专用事务。
type AgentRunStep struct {
	ID                int64   `json:"-" gorm:"primaryKey;index:idx_ag_run_steps_run_status_id,priority:3;comment:步骤有符号64位主键，由GORM生成"`                                                                    // 步骤有符号64位主键，由GORM生成。
	CreatedAt         int64   `json:"-" gorm:"type:bigint;not null;autoCreateTime:false;comment:步骤尝试创建时间，UTC Unix毫秒"`                                                                                    // 步骤尝试创建时间，UTC Unix毫秒。
	UpdatedAt         int64   `json:"-" gorm:"type:bigint;not null;autoUpdateTime:false;comment:步骤最后变更时间，UTC Unix毫秒"`                                                                                    // 步骤最后变更时间，UTC Unix毫秒。
	Revision          int64   `json:"-" gorm:"type:bigint;not null;comment:步骤CAS版本，从1递增"`                                                                                                                // 步骤CAS版本，从1递增。
	TeamID            int64   `json:"-" gorm:"type:bigint;not null;comment:与父Run一致的Team归属"`                                                                                                              // 与父Run一致的Team归属。
	WorkspaceID       int64   `json:"-" gorm:"type:bigint;not null;index:idx_ag_run_steps_workspace_call,priority:1;comment:与父Run一致的工作区归属"`                                                              // 与父Run一致的工作区归属。
	RunID             int64   `json:"-" gorm:"type:bigint;not null;uniqueIndex:ux_ag_run_steps_run_key_attempt,priority:1;index:idx_ag_run_steps_run_status_id,priority:1;comment:所属Run，必须同时匹配Team和工作区"` // 所属Run，必须同时匹配Team和工作区。
	StepKey           string  `json:"-" gorm:"type:varchar(96);not null;uniqueIndex:ux_ag_run_steps_run_key_attempt,priority:2;comment:服务端稳定的小写ASCII逻辑步骤标识"`                                             // 服务端稳定的小写ASCII逻辑步骤标识。
	ParentStepID      *int64  `json:"-" gorm:"type:bigint;comment:同Run父步骤引用，根步骤为NULL"`                                                                                                                   // 同Run父步骤引用，根步骤为NULL。
	Attempt           int32   `json:"-" gorm:"type:int;not null;uniqueIndex:ux_ag_run_steps_run_key_attempt,priority:3;comment:同逻辑步骤尝试序号，当前只创建首尝试1"`                                                     // 同逻辑步骤尝试序号，当前只创建首尝试1。
	Kind              string  `json:"-" gorm:"type:varchar(24);not null;comment:model、tool、skill_load、sandbox、approval或workflow_node"`                                                                   // model、tool、skill_load、sandbox、approval或workflow_node。
	Status            string  `json:"-" gorm:"type:varchar(24);not null;index:idx_ag_run_steps_run_status_id,priority:2;comment:步骤状态，创建为pending，未知外部结果须保留outcome_unknown"`                               // 步骤状态，创建为pending，未知外部结果须保留outcome_unknown。
	LeaseEpoch        int64   `json:"-" gorm:"type:bigint;not null;comment:创建或提交对应的Run租约代次，必须为正安全整数"`                                                                                                    // 创建或提交对应的Run租约代次，必须为正安全整数。
	LogicalCallID     *string `json:"-" gorm:"type:varchar(64);index:idx_ag_run_steps_workspace_call,priority:2;comment:服务端外部调用逻辑ID，尚未绑定为NULL"`                                                          // 服务端外部调用逻辑ID，尚未绑定为NULL。
	InputJSON         *string `json:"-" gorm:"column:input_json;type:text;comment:脱敏输入对象，最多60KiB，无输入为NULL"`                                                                                              // 脱敏输入对象，最多60KiB，无输入为NULL。
	OutputJSON        *string `json:"-" gorm:"column:output_json;type:text;comment:脱敏输出对象，最多60KiB，尚无输出为NULL"`                                                                                            // 脱敏输出对象，最多60KiB，尚无输出为NULL。
	InputHash         *string `json:"-" gorm:"type:char(64);comment:规范输入的SHA256小写摘要，无输入为NULL"`                                                                                                           // 规范输入的SHA256小写摘要，无输入为NULL。
	TargetRefJSON     string  `json:"-" gorm:"column:target_ref_json;type:text;not null;comment:工具模型或技能的固定标识版本对象，最多60KiB"`                                                                               // 工具模型或技能的固定标识版本对象，最多60KiB。
	ExternalRequestID *string `json:"-" gorm:"type:varchar(128);comment:外部受理回执ID，不作授权凭据，尚未发送为NULL"`                                                                                                      // 外部受理回执ID，不作授权凭据，尚未发送为NULL。
	SideEffectPolicy  string  `json:"-" gorm:"type:varchar(24);not null;comment:read_only、idempotent、non_idempotent或unknown副作用策略"`                                                                       // read_only、idempotent、non_idempotent或unknown副作用策略。
	RetryPolicyJSON   string  `json:"-" gorm:"column:retry_policy_json;type:text;not null;comment:有界重试策略对象，最多60KiB，不覆盖未知结果保护"`                                                                           // 有界重试策略对象，最多60KiB，不覆盖未知结果保护。
	StartedAt         *int64  `json:"-" gorm:"type:bigint;comment:开始执行时间，UTC毫秒，尚未开始为NULL"`                                                                                                               // 开始执行时间，UTC毫秒，尚未开始为NULL。
	FinishedAt        *int64  `json:"-" gorm:"type:bigint;comment:结束时间，UTC毫秒，尚未结束为NULL"`                                                                                                                 // 结束时间，UTC毫秒，尚未结束为NULL。
	ErrorCode         *string `json:"-" gorm:"type:varchar(64);comment:固定脱敏错误码，无错误为NULL"`                                                                                                                // 固定脱敏错误码，无错误为NULL。
	ErrorMessage      *string `json:"-" gorm:"type:varchar(512);comment:脱敏错误摘要，最多512字符，无错误为NULL"`                                                                                                        // 脱敏错误摘要，最多512字符，无错误为NULL。
}

func (AgentRunStep) TableName() string { return "ag_run_steps" }

func (step *AgentRunStep) BeforeCreate(tx *gorm.DB) error {
	if tx == nil || tx.Statement == nil {
		return ErrAgentRunStepInvalid
	}
	if _, exists := tx.Statement.Clauses["ON CONFLICT"]; exists {
		return ErrAgentRunStepInvalid
	}
	if step.Attempt == 0 {
		step.Attempt = 1
	}
	if step.Status == "" {
		step.Status = AgentRunStepStatusPending
	}
	if step.SideEffectPolicy == "" {
		step.SideEffectPolicy = AgentRunStepSideEffectUnknown
	}
	if step.ID != 0 || step.TeamID <= 0 || step.WorkspaceID <= 0 || step.RunID <= 0 ||
		step.CreatedAt != 0 || step.UpdatedAt != 0 || step.Revision != 0 && step.Revision != 1 ||
		!agentRunStepKey.MatchString(step.StepKey) || step.ParentStepID != nil && *step.ParentStepID <= 0 || step.Attempt != 1 ||
		!slices.Contains([]string{AgentRunStepKindModel, AgentRunStepKindTool, AgentRunStepKindSkillLoad, AgentRunStepKindSandbox, AgentRunStepKindApproval, AgentRunStepKindWorkflowNode}, step.Kind) ||
		step.Status != AgentRunStepStatusPending || step.LeaseEpoch <= 0 || step.LeaseEpoch > agentDefinitionMaxInteger ||
		step.LogicalCallID != nil || step.ExternalRequestID != nil || step.OutputJSON != nil || step.StartedAt != nil || step.FinishedAt != nil || step.ErrorCode != nil || step.ErrorMessage != nil ||
		!slices.Contains([]string{AgentRunStepSideEffectReadOnly, AgentRunStepSideEffectIdempotent, AgentRunStepSideEffectNonIdempotent, AgentRunStepSideEffectUnknown}, step.SideEffectPolicy) ||
		(step.InputJSON == nil) != (step.InputHash == nil) || step.InputHash != nil && !agentDigestValid(*step.InputHash) {
		return ErrAgentRunStepInvalid
	}
	for _, value := range []*string{step.InputJSON, &step.TargetRefJSON, &step.RetryPolicyJSON} {
		if value == nil {
			continue
		}
		if len(*value) > 60*1024 {
			return ErrAgentRunStepInvalid
		}
		if _, err := common.UnmarshalJSONObjectStrict([]byte(*value)); err != nil {
			return ErrAgentRunStepInvalid
		}
	}
	now := time.Now().UnixMilli()
	if now <= 0 || now > agentDefinitionMaxInteger {
		return ErrAgentRunStepInvalid
	}
	// Use a new Statement, retaining the caller's transaction and row locks.
	tx = tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard})
	var run AgentRun
	if err := lockForUpdate(tx).Select("id", "status", "lease_epoch").Where("id = ? AND team_id = ? AND workspace_id = ?", step.RunID, step.TeamID, step.WorkspaceID).Take(&run).Error; err != nil {
		return errors.Join(ErrAgentRunStepReference, err)
	}
	if run.Status != AgentRunStatusRunning || run.LeaseEpoch != step.LeaseEpoch {
		return ErrAgentRunStepReference
	}
	if step.ParentStepID != nil {
		var parent AgentRunStep
		if err := lockForUpdate(tx).Select("id").Where("id = ? AND team_id = ? AND workspace_id = ? AND run_id = ?", *step.ParentStepID, step.TeamID, step.WorkspaceID, step.RunID).Take(&parent).Error; err != nil {
			return errors.Join(ErrAgentRunStepReference, err)
		}
	}
	step.CreatedAt, step.UpdatedAt, step.Revision = now, now, 1
	return nil
}

func (*AgentRunStep) BeforeUpdate(*gorm.DB) error { return ErrAgentRunStepInvalid }
func (*AgentRunStep) BeforeDelete(*gorm.DB) error { return ErrAgentRunStepInvalid }
