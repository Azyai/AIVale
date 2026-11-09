package model

import (
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const (
	AgentBudgetReservationStatusReserved       = "reserved"
	AgentBudgetReservationStatusSettled        = "settled"
	AgentBudgetReservationStatusReleased       = "released"
	AgentBudgetReservationStatusOutcomeUnknown = "outcome_unknown"
	AgentBudgetReservationCostKindModel        = "model"
)

var (
	ErrAgentBudgetReservationInvalid   = errors.New("invalid agent budget reservation")
	ErrAgentBudgetReservationReference = errors.New("invalid agent budget reservation reference")
)

// AgentBudgetReservation 是Run执行预算的保守上界预留，不是钱包或Token预扣。
// 结果未知时保留预留，不能因期限到达、Run终态或租约丢失自动释放。
type AgentBudgetReservation struct {
	ID                   int64  `json:"-" gorm:"primaryKey;index:idx_ag_budget_res_run_status_id,priority:3;index:idx_ag_budget_res_status_expires_id,priority:3;comment:预留主键，由GORM生成"`                                             // 预留主键，由GORM生成。
	CreatedAt            int64  `json:"-" gorm:"type:bigint;not null;autoCreateTime:false;comment:预留创建时间，UTC毫秒"`                                                                                                                    // 预留创建时间，UTC毫秒。
	UpdatedAt            int64  `json:"-" gorm:"type:bigint;not null;autoUpdateTime:false;comment:预留状态最后变更时间，UTC毫秒"`                                                                                                                // 预留状态最后变更时间，UTC毫秒。
	Revision             int64  `json:"-" gorm:"type:bigint;not null;comment:预留CAS修订号，从1递增"`                                                                                                                                        // 预留CAS修订号，从1递增。
	TeamID               int64  `json:"-" gorm:"type:bigint;not null;comment:与父Run一致的Team归属"`                                                                                                                                       // 与父Run一致的Team归属。
	WorkspaceID          int64  `json:"-" gorm:"type:bigint;not null;comment:与父Run一致的工作区归属"`                                                                                                                                        // 与父Run一致的工作区归属。
	RunID                int64  `json:"-" gorm:"type:bigint;not null;uniqueIndex:ux_ag_budget_res_call_attempt_kind,priority:1;index:idx_ag_budget_res_run_status_id,priority:1;comment:所属实际执行Run，预算根字段在P10添加"`                     // 所属实际执行Run，预算根字段在P10添加。
	StepID               int64  `json:"-" gorm:"type:bigint;not null;comment:同Run模型步骤引用"`                                                                                                                                           // 同Run模型步骤引用。
	LogicalCallID        string `json:"-" gorm:"type:varchar(64);not null;uniqueIndex:ux_ag_budget_res_call_attempt_kind,priority:2;comment:服务端生成的小写ASCII稳定逻辑调用ID"`                                                                 // 服务端生成的小写ASCII稳定逻辑调用ID。
	Attempt              int32  `json:"-" gorm:"type:int;not null;uniqueIndex:ux_ag_budget_res_call_attempt_kind,priority:3;comment:调用尝试序号，当前只允许1"`                                                                                 // 调用尝试序号，当前只允许1。
	CostKind             string `json:"-" gorm:"type:varchar(16);not null;uniqueIndex:ux_ag_budget_res_call_attempt_kind,priority:4;comment:成本类别，当前只允许model"`                                                                       // 成本类别，当前只允许model。
	EstimatedQuota       int64  `json:"-" gorm:"type:bigint;not null;comment:本次完整模型调用的可证明保守上界，既有quota单位"`                                                                                                                           // 本次完整模型调用的可证明保守上界，既有quota单位。
	SettledQuota         *int64 `json:"-" gorm:"type:bigint;comment:确认结算额度，未知及未结算为NULL"`                                                                                                                                            // 确认结算额度，未知及未结算为NULL。
	Status               string `json:"-" gorm:"type:varchar(24);not null;index:idx_ag_budget_res_run_status_id,priority:2;index:idx_ag_budget_res_status_expires_id,priority:1;comment:reserved、settled、released或outcome_unknown"` // reserved、settled、released或outcome_unknown。
	EstimateSnapshotJSON string `json:"-" gorm:"column:estimate_snapshot_json;type:text;not null;comment:估计规则及数量上界引用对象，最多60KiB，不含请求正文"`                                                                                             // 估计规则及数量上界引用对象，最多60KiB，不含请求正文。
	ExpiresAt            int64  `json:"-" gorm:"type:bigint;not null;index:idx_ag_budget_res_status_expires_id,priority:2;comment:复查期限，UTC毫秒，到期不能自动释放"`                                                                             // 复查期限，UTC毫秒，到期不能自动释放。
	SettledAt            *int64 `json:"-" gorm:"type:bigint;comment:确认结算时间，UTC毫秒，尚未结算为NULL"`                                                                                                                                        // 确认结算时间，UTC毫秒，尚未结算为NULL。
	ReleasedAt           *int64 `json:"-" gorm:"type:bigint;comment:确认未发送后的释放时间，UTC毫秒，未释放为NULL"`                                                                                                                                    // 确认未发送后的释放时间，UTC毫秒，未释放为NULL。
}

func (AgentBudgetReservation) TableName() string { return "ag_budget_reservations" }

func (reservation *AgentBudgetReservation) BeforeCreate(tx *gorm.DB) error {
	if tx == nil || tx.Statement == nil {
		return ErrAgentBudgetReservationInvalid
	}
	if _, exists := tx.Statement.Clauses["ON CONFLICT"]; exists {
		return ErrAgentBudgetReservationInvalid
	}
	if reservation.Attempt == 0 {
		reservation.Attempt = 1
	}
	if reservation.Status == "" {
		reservation.Status = AgentBudgetReservationStatusReserved
	}
	if reservation.CostKind == "" {
		reservation.CostKind = AgentBudgetReservationCostKindModel
	}
	now := time.Now().UnixMilli()
	if reservation.ID != 0 || reservation.CreatedAt != 0 || reservation.UpdatedAt != 0 || reservation.Revision != 0 && reservation.Revision != 1 ||
		reservation.TeamID <= 0 || reservation.WorkspaceID <= 0 || reservation.RunID <= 0 || reservation.StepID <= 0 ||
		!agentLedgerCallReferenceValid(reservation.LogicalCallID) || reservation.Attempt != 1 || reservation.CostKind != AgentBudgetReservationCostKindModel ||
		reservation.EstimatedQuota < 0 || reservation.EstimatedQuota > common.MaxQuota || reservation.SettledQuota != nil ||
		reservation.Status != AgentBudgetReservationStatusReserved || reservation.SettledAt != nil || reservation.ReleasedAt != nil ||
		now < 1 || now > agentDefinitionMaxInteger || reservation.ExpiresAt <= now || reservation.ExpiresAt > agentDefinitionMaxInteger ||
		!agentLedgerJSONObjectValid(reservation.EstimateSnapshotJSON) {
		return ErrAgentBudgetReservationInvalid
	}
	tx = tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard})
	var run AgentRun
	if err := lockForUpdate(tx).Where("id = ? AND team_id = ? AND workspace_id = ?", reservation.RunID, reservation.TeamID, reservation.WorkspaceID).Take(&run).Error; err != nil {
		return errors.Join(ErrAgentBudgetReservationReference, err)
	}
	if !AgentRunExecutionSnapshotValid(&run) {
		return ErrAgentBudgetReservationReference
	}
	var step AgentRunStep
	if err := lockForUpdate(tx).Where("id = ? AND run_id = ? AND team_id = ? AND workspace_id = ?", reservation.StepID, reservation.RunID, reservation.TeamID, reservation.WorkspaceID).Take(&step).Error; err != nil {
		return errors.Join(ErrAgentBudgetReservationReference, err)
	}
	if step.Kind != AgentRunStepKindModel || step.LogicalCallID != nil && *step.LogicalCallID != reservation.LogicalCallID {
		return ErrAgentBudgetReservationReference
	}
	reservation.CreatedAt, reservation.UpdatedAt, reservation.Revision = now, now, 1
	return nil
}

func (*AgentBudgetReservation) BeforeUpdate(*gorm.DB) error { return ErrAgentBudgetReservationInvalid }
func (*AgentBudgetReservation) BeforeDelete(*gorm.DB) error { return ErrAgentBudgetReservationInvalid }
