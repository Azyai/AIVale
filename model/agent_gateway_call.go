package model

import (
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const (
	AgentGatewayCallStatePrepared           = "prepared"
	AgentGatewayCallStateDispatched         = "dispatched"
	AgentGatewayCallStateResponded          = "responded"
	AgentGatewayCallStateSettled            = "settled"
	AgentGatewayCallStateRejected           = "rejected"
	AgentGatewayCallStateOutcomeUnknown     = "outcome_unknown"
	AgentGatewayCallCommitStatePending      = "pending"
	AgentGatewayCallCommitStateApplied      = "applied"
	AgentGatewayCallCommitStateRefunded     = "refunded"
	AgentGatewayCallCommitStateUnknown      = "unknown"
	AgentGatewayCallReconcilePending        = "pending"
	AgentGatewayCallReconcileConfirmed      = "confirmed"
	AgentGatewayCallReconcileManualRequired = "manual_required"
)

var (
	ErrAgentGatewayCallInvalid   = errors.New("invalid agent gateway call")
	ErrAgentGatewayCallReference = errors.New("invalid agent gateway call reference")
	agentLedgerCallReference     = regexp.MustCompile(`^[a-z0-9][a-z0-9._:-]{15,63}$`)
)

// AgentGatewayCall 记录受信broker/网关的调用进度，不驱动第二次扣款。
// 当前只开放prepared登记；真实网关收据接线和人工核账按后续阶段完成。
type AgentGatewayCall struct {
	ID                  int64   `json:"-" gorm:"primaryKey;index:idx_ag_gateway_calls_run_id,priority:2;index:idx_ag_gateway_calls_reconcile_updated_id,priority:3;index:idx_ag_gateway_calls_workspace_funding_created_id,priority:4;comment:调用账本主键，由GORM生成"` // 调用账本主键，由GORM生成。
	CreatedAt           int64   `json:"-" gorm:"type:bigint;not null;autoCreateTime:false;index:idx_ag_gateway_calls_workspace_funding_created_id,priority:3;comment:调用登记时间，UTC毫秒"`                                                                            // 调用登记时间，UTC毫秒。
	UpdatedAt           int64   `json:"-" gorm:"type:bigint;not null;autoUpdateTime:false;index:idx_ag_gateway_calls_reconcile_updated_id,priority:2;comment:账本最后变更时间，UTC毫秒"`                                                                                  // 账本最后变更时间，UTC毫秒。
	Revision            int64   `json:"-" gorm:"type:bigint;not null;comment:调用账本CAS修订号，从1递增"`                                                                                                                                                                 // 调用账本CAS修订号，从1递增。
	TeamID              int64   `json:"-" gorm:"type:bigint;not null;comment:与父Run一致的Team归属"`                                                                                                                                                                  // 与父Run一致的Team归属。
	WorkspaceID         int64   `json:"-" gorm:"type:bigint;not null;index:idx_ag_gateway_calls_workspace_funding_created_id,priority:1;comment:与父Run一致的工作区归属"`                                                                                                // 与父Run一致的工作区归属。
	RunID               int64   `json:"-" gorm:"type:bigint;not null;index:idx_ag_gateway_calls_run_id,priority:1;comment:所属Run引用"`                                                                                                                            // 所属Run引用。
	StepID              int64   `json:"-" gorm:"type:bigint;not null;comment:同Run的模型步骤引用"`                                                                                                                                                                     // 同Run的模型步骤引用。
	LogicalCallID       string  `json:"-" gorm:"type:varchar(64);not null;uniqueIndex:ux_ag_gateway_calls_logical_attempt,priority:1;comment:服务端生成的小写ASCII稳定逻辑调用ID"`                                                                                           // 服务端生成的小写ASCII稳定逻辑调用ID。
	Attempt             int32   `json:"-" gorm:"type:int;not null;uniqueIndex:ux_ag_gateway_calls_logical_attempt,priority:2;comment:逻辑调用尝试序号，当前只允许1"`                                                                                                         // 逻辑调用尝试序号，当前只允许1。
	GatewayRequestID    string  `json:"-" gorm:"type:varchar(64);not null;uniqueIndex:ux_ag_gateway_calls_gateway_request;comment:服务端生成的小写ASCII网关请求ID，独立于混合大小写HTTP跟踪ID"`                                                                                       // 服务端生成的小写ASCII网关请求ID，独立于混合大小写HTTP跟踪ID。
	FundingTokenID      int64   `json:"-" gorm:"type:bigint;not null;index:idx_ag_gateway_calls_workspace_funding_created_id,priority:2;comment:与父Run一致的资金Token引用，不保存Key"`                                                                                     // 与父Run一致的资金Token引用，不保存Key。
	LeaseEpoch          int64   `json:"-" gorm:"type:bigint;not null;comment:broker接受登记时校验的Run租约代次"`                                                                                                                                                           // broker接受登记时校验的Run租约代次。
	RequestHash         string  `json:"-" gorm:"type:char(64);not null;comment:完整规范模型请求的SHA256小写摘要，不保存消息正文"`                                                                                                                                                   // 完整规范模型请求的SHA256小写摘要，不保存消息正文。
	ModelName           string  `json:"-" gorm:"type:varchar(256);not null;comment:固定客户模型名，最多256 UTF-8字节"`                                                                                                                                                     // 固定客户模型名，最多256 UTF-8字节。
	ChannelID           *int64  `json:"-" gorm:"type:bigint;comment:实际路由渠道引用，未路由为NULL"`                                                                                                                                                                        // 实际路由渠道引用，未路由为NULL。
	State               string  `json:"-" gorm:"type:varchar(24);not null;comment:prepared、dispatched、responded、settled、rejected或outcome_unknown"`                                                                                                             // prepared、dispatched、responded、settled、rejected或outcome_unknown。
	UpstreamRequestID   *string `json:"-" gorm:"type:varchar(128);comment:上游受理回执引用，未知为NULL，不作为授权凭据"`                                                                                                                                                           // 上游受理回执引用，未知为NULL，不作为授权凭据。
	PreconsumeQuota     *int64  `json:"-" gorm:"type:bigint;comment:网关实际预扣额度的关联记录，未观测为NULL，不再次扣款"`                                                                                                                                                             // 网关实际预扣额度的关联记录，未观测为NULL，不再次扣款。
	ActualQuota         *int64  `json:"-" gorm:"type:bigint;comment:网关确认最终收费，未知为NULL而非0"`                                                                                                                                                                      // 网关确认最终收费，未知为NULL而非0。
	ConsumeLogID        *int64  `json:"-" gorm:"type:bigint;comment:真实持久化消费凭证ID，未知或未记录为NULL，不以请求ID推断付款"`                                                                                                                                                       // 真实持久化消费凭证ID，未知或未记录为NULL，不以请求ID推断付款。
	FundingState        string  `json:"-" gorm:"type:varchar(16);not null;comment:资金提交状态pending、applied、refunded或unknown"`                                                                                                                                     // 资金提交状态pending、applied、refunded或unknown。
	TokenState          string  `json:"-" gorm:"type:varchar(16);not null;comment:Token统计提交状态pending、applied、refunded或unknown"`                                                                                                                                // Token统计提交状态pending、applied、refunded或unknown。
	FundingSource       *string `json:"-" gorm:"type:varchar(24);comment:实际资金来源，未观测为NULL，不凭调用者声明"`                                                                                                                                                             // 实际资金来源，未观测为NULL，不凭调用者声明。
	UsageJSON           *string `json:"-" gorm:"column:usage_json;type:text;comment:网关验证的用量对象，最多60KiB，未观测为NULL"`                                                                                                                                               // 网关验证的用量对象，最多60KiB，未观测为NULL。
	PricingSnapshotJSON *string `json:"-" gorm:"column:pricing_snapshot_json;type:text;comment:收费规则及价格摘要引用对象，最多60KiB，未观测为NULL"`                                                                                                                                // 收费规则及价格摘要引用对象，最多60KiB，未观测为NULL。
	DispatchedAt        *int64  `json:"-" gorm:"type:bigint;comment:确认登记发送进度的UTC毫秒时间，未发送为NULL"`                                                                                                                                                                // 确认登记发送进度的UTC毫秒时间，未发送为NULL。
	RespondedAt         *int64  `json:"-" gorm:"type:bigint;comment:确认响应时间，UTC毫秒，未响应为NULL"`                                                                                                                                                                    // 确认响应时间，UTC毫秒，未响应为NULL。
	SettledAt           *int64  `json:"-" gorm:"type:bigint;comment:确认结算时间，UTC毫秒，未结算为NULL"`                                                                                                                                                                    // 确认结算时间，UTC毫秒，未结算为NULL。
	ReconcileStatus     string  `json:"-" gorm:"type:varchar(24);not null;index:idx_ag_gateway_calls_reconcile_updated_id,priority:1;comment:核账状态pending、confirmed或manual_required"`                                                                           // 核账状态pending、confirmed或manual_required。
	ReconciledBy        *int64  `json:"-" gorm:"type:bigint;comment:人工核账身份引用，无人工确认时为NULL"`                                                                                                                                                                     // 人工核账身份引用，无人工确认时为NULL。
	ReconcileNote       *string `json:"-" gorm:"type:text;comment:脱敏核账证据引用及摘要，最多60KiB，无记录为NULL"`                                                                                                                                                               // 脱敏核账证据引用及摘要，最多60KiB，无记录为NULL。
}

func (AgentGatewayCall) TableName() string { return "ag_gateway_calls" }

func agentLedgerCallReferenceValid(value string) bool {
	return agentLedgerCallReference.MatchString(value)
}

func agentLedgerJSONObjectValid(value string) bool {
	if len(value) > 60*1024 {
		return false
	}
	_, err := common.UnmarshalJSONObjectStrict([]byte(value))
	return err == nil
}

func (call *AgentGatewayCall) BeforeCreate(tx *gorm.DB) error {
	if tx == nil || tx.Statement == nil {
		return ErrAgentGatewayCallInvalid
	}
	if _, exists := tx.Statement.Clauses["ON CONFLICT"]; exists {
		return ErrAgentGatewayCallInvalid
	}
	if call.Attempt == 0 {
		call.Attempt = 1
	}
	if call.State == "" {
		call.State = AgentGatewayCallStatePrepared
	}
	if call.FundingState == "" {
		call.FundingState = AgentGatewayCallCommitStatePending
	}
	if call.TokenState == "" {
		call.TokenState = AgentGatewayCallCommitStatePending
	}
	if call.ReconcileStatus == "" {
		call.ReconcileStatus = AgentGatewayCallReconcilePending
	}
	now := time.Now().UnixMilli()
	if call.ID != 0 || call.CreatedAt != 0 || call.UpdatedAt != 0 || call.Revision != 0 && call.Revision != 1 ||
		call.TeamID <= 0 || call.WorkspaceID <= 0 || call.RunID <= 0 || call.StepID <= 0 || call.FundingTokenID <= 0 ||
		!agentLedgerCallReferenceValid(call.LogicalCallID) || !agentLedgerCallReferenceValid(call.GatewayRequestID) || call.Attempt != 1 ||
		call.LeaseEpoch < 1 || call.LeaseEpoch > agentDefinitionMaxInteger || !agentDigestValid(call.RequestHash) ||
		call.ModelName == "" || len(call.ModelName) > 256 || !utf8.ValidString(call.ModelName) || strings.TrimSpace(call.ModelName) != call.ModelName || strings.ContainsFunc(call.ModelName, unicode.IsControl) ||
		call.State != AgentGatewayCallStatePrepared || call.FundingState != AgentGatewayCallCommitStatePending || call.TokenState != AgentGatewayCallCommitStatePending || call.ReconcileStatus != AgentGatewayCallReconcilePending ||
		call.ChannelID != nil || call.UpstreamRequestID != nil || call.PreconsumeQuota != nil || call.ActualQuota != nil || call.ConsumeLogID != nil || call.FundingSource != nil ||
		call.UsageJSON != nil || call.PricingSnapshotJSON != nil || call.DispatchedAt != nil || call.RespondedAt != nil || call.SettledAt != nil || call.ReconciledBy != nil || call.ReconcileNote != nil ||
		now < 1 || now > agentDefinitionMaxInteger {
		return ErrAgentGatewayCallInvalid
	}
	tx = tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard})
	var run AgentRun
	if err := lockForUpdate(tx).Where("id = ? AND team_id = ? AND workspace_id = ?", call.RunID, call.TeamID, call.WorkspaceID).Take(&run).Error; err != nil {
		return errors.Join(ErrAgentGatewayCallReference, err)
	}
	if !AgentRunExecutionSnapshotValid(&run) || run.FundingTokenID != call.FundingTokenID || run.LeaseEpoch != call.LeaseEpoch {
		return ErrAgentGatewayCallReference
	}
	var step AgentRunStep
	if err := lockForUpdate(tx).Where("id = ? AND run_id = ? AND team_id = ? AND workspace_id = ?", call.StepID, call.RunID, call.TeamID, call.WorkspaceID).Take(&step).Error; err != nil {
		return errors.Join(ErrAgentGatewayCallReference, err)
	}
	if step.Kind != AgentRunStepKindModel || step.LeaseEpoch != call.LeaseEpoch || step.LogicalCallID != nil && *step.LogicalCallID != call.LogicalCallID {
		return ErrAgentGatewayCallReference
	}
	call.CreatedAt, call.UpdatedAt, call.Revision = now, now, 1
	return nil
}

func (*AgentGatewayCall) BeforeUpdate(*gorm.DB) error { return ErrAgentGatewayCallInvalid }
func (*AgentGatewayCall) BeforeDelete(*gorm.DB) error { return ErrAgentGatewayCallInvalid }
