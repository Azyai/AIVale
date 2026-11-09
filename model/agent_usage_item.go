package model

import (
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const (
	AgentUsageItemSourceKindModel = "model"
	AgentUsageItemKindCharge      = "charge"
)

var (
	ErrAgentUsageItemInvalid   = errors.New("invalid agent usage item")
	ErrAgentUsageItemReference = errors.New("invalid agent usage item reference")
)

// AgentUsageItem 是已确认费用的只追加展示事实，不是收费指令。
// 本批不装配生产收据投影入口，退款和未知费用核账按后续阶段完成。
type AgentUsageItem struct {
	ID                int64  `json:"-" gorm:"primaryKey;index:idx_ag_usage_items_run_id,priority:2;index:idx_ag_usage_items_workspace_occurred_id,priority:3;comment:用量事实主键，由GORM生成"` // 用量事实主键，由GORM生成。
	CreatedAt         int64  `json:"-" gorm:"type:bigint;not null;autoCreateTime:false;comment:用量事实入库时间，UTC毫秒，不等于实际发生时间"`                                                             // 用量事实入库时间，UTC毫秒，不等于实际发生时间。
	TeamID            int64  `json:"-" gorm:"type:bigint;not null;comment:与实际调用Run一致的Team归属"`                                                                                         // 与实际调用Run一致的Team归属。
	WorkspaceID       int64  `json:"-" gorm:"type:bigint;not null;index:idx_ag_usage_items_workspace_occurred_id,priority:1;comment:与实际调用Run一致的工作区归属"`                                // 与实际调用Run一致的工作区归属。
	RunID             int64  `json:"-" gorm:"type:bigint;not null;index:idx_ag_usage_items_run_id,priority:1;comment:实际费用所属Run，根Run汇总字段在P10添加"`                                       // 实际费用所属Run，根Run汇总字段在P10添加。
	StepID            int64  `json:"-" gorm:"type:bigint;not null;comment:同Run的实际模型步骤引用"`                                                                                             // 同Run的实际模型步骤引用。
	GatewayCallID     *int64 `json:"-" gorm:"type:bigint;comment:可信调用账本引用，当前model项目必填"`                                                                                               // 可信调用账本引用，当前model项目必填。
	LogicalCallID     string `json:"-" gorm:"type:varchar(64);not null;comment:与调用账本一致的稳定逻辑调用ID"`                                                                                     // 与调用账本一致的稳定逻辑调用ID。
	SourceKind        string `json:"-" gorm:"type:varchar(16);not null;comment:用量来源，当前只允许model"`                                                                                      // 用量来源，当前只允许model。
	SourceEventKey    string `json:"-" gorm:"type:char(64);not null;uniqueIndex:ux_ag_usage_items_source_event;comment:可信生产者及调用结算事件的小写SHA256去重键"`                                     // 可信生产者及调用结算事件的小写SHA256去重键。
	ItemKind          string `json:"-" gorm:"type:varchar(16);not null;comment:费用事实种类，当前只允许charge，退款修正后置"`                                                                            // 费用事实种类，当前只允许charge，退款修正后置。
	RelatedItemID     *int64 `json:"-" gorm:"type:bigint;comment:退款或更正对应原项目，当前charge初值为NULL"`                                                                                         // 退款或更正对应原项目，当前charge初值为NULL。
	Quota             int64  `json:"-" gorm:"type:bigint;not null;comment:网关已确认的非负模型费用，既有quota单位，不能凭worker自报"`                                                                        // 网关已确认的非负模型费用，既有quota单位，不能凭worker自报。
	QuantityJSON      string `json:"-" gorm:"column:quantity_json;type:text;not null;comment:可信模型用量对象，最多60KiB，不从回答长度反推"`                                                              // 可信模型用量对象，最多60KiB，不从回答长度反推。
	PriceSnapshotJSON string `json:"-" gorm:"column:price_snapshot_json;type:text;not null;comment:对应原收费规则及单位引用对象，最多60KiB"`                                                           // 对应原收费规则及单位引用对象，最多60KiB。
	SourceRefJSON     string `json:"-" gorm:"column:source_ref_json;type:text;not null;comment:原网关请求及可信计量收据引用对象，最多60KiB"`                                                             // 原网关请求及可信计量收据引用对象，最多60KiB。
	OccurredAt        int64  `json:"-" gorm:"type:bigint;not null;index:idx_ag_usage_items_workspace_occurred_id,priority:2;comment:实际费用发生时间，UTC毫秒"`                                  // 实际费用发生时间，UTC毫秒。
}

func (AgentUsageItem) TableName() string { return "ag_usage_items" }

func (item *AgentUsageItem) BeforeCreate(tx *gorm.DB) error {
	if tx == nil || tx.Statement == nil {
		return ErrAgentUsageItemInvalid
	}
	if _, exists := tx.Statement.Clauses["ON CONFLICT"]; exists {
		return ErrAgentUsageItemInvalid
	}
	if item.SourceKind == "" {
		item.SourceKind = AgentUsageItemSourceKindModel
	}
	if item.ItemKind == "" {
		item.ItemKind = AgentUsageItemKindCharge
	}
	now := time.Now().UnixMilli()
	if item.ID != 0 || item.CreatedAt != 0 || item.TeamID <= 0 || item.WorkspaceID <= 0 || item.RunID <= 0 || item.StepID <= 0 ||
		item.GatewayCallID == nil || *item.GatewayCallID <= 0 || !agentLedgerCallReferenceValid(item.LogicalCallID) || !agentDigestValid(item.SourceEventKey) ||
		item.SourceKind != AgentUsageItemSourceKindModel || item.ItemKind != AgentUsageItemKindCharge || item.RelatedItemID != nil ||
		item.Quota < 0 || item.Quota > common.MaxQuota || !agentLedgerJSONObjectValid(item.QuantityJSON) || !agentLedgerJSONObjectValid(item.PriceSnapshotJSON) || !agentLedgerJSONObjectValid(item.SourceRefJSON) ||
		now < 1 || now > agentDefinitionMaxInteger || item.OccurredAt < 1 || item.OccurredAt > now {
		return ErrAgentUsageItemInvalid
	}
	tx = tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard})
	var run AgentRun
	if err := lockForUpdate(tx).Where("id = ? AND team_id = ? AND workspace_id = ?", item.RunID, item.TeamID, item.WorkspaceID).Take(&run).Error; err != nil {
		return errors.Join(ErrAgentUsageItemReference, err)
	}
	if !AgentRunExecutionSnapshotValid(&run) {
		return ErrAgentUsageItemReference
	}
	var step AgentRunStep
	if err := lockForUpdate(tx).Where("id = ? AND run_id = ? AND team_id = ? AND workspace_id = ?", item.StepID, item.RunID, item.TeamID, item.WorkspaceID).Take(&step).Error; err != nil {
		return errors.Join(ErrAgentUsageItemReference, err)
	}
	if step.Kind != AgentRunStepKindModel || step.LogicalCallID == nil || *step.LogicalCallID != item.LogicalCallID {
		return ErrAgentUsageItemReference
	}
	var call AgentGatewayCall
	if err := lockForUpdate(tx).Where("id = ? AND run_id = ? AND step_id = ? AND team_id = ? AND workspace_id = ?", *item.GatewayCallID, item.RunID, item.StepID, item.TeamID, item.WorkspaceID).Take(&call).Error; err != nil {
		return errors.Join(ErrAgentUsageItemReference, err)
	}
	confirmed := func(state string) bool {
		return state == AgentGatewayCallCommitStateApplied || state == AgentGatewayCallCommitStateRefunded
	}
	if call.LogicalCallID != item.LogicalCallID || call.FundingTokenID != run.FundingTokenID || call.State != AgentGatewayCallStateSettled ||
		call.ActualQuota == nil || *call.ActualQuota != item.Quota || !confirmed(call.FundingState) || !confirmed(call.TokenState) ||
		call.SettledAt == nil || *call.SettledAt < 1 || *call.SettledAt > now {
		return ErrAgentUsageItemReference
	}
	item.CreatedAt = now
	return nil
}

func (*AgentUsageItem) BeforeUpdate(*gorm.DB) error { return ErrAgentUsageItemInvalid }
func (*AgentUsageItem) BeforeDelete(*gorm.DB) error { return ErrAgentUsageItemInvalid }
