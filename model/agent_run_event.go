package model

import (
	"errors"
	"slices"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const (
	AgentRunEventVisibilityUser  = "user"
	AgentRunEventVisibilityAdmin = "admin"
)

var (
	ErrAgentRunEventInvalid   = errors.New("invalid agent run event")
	ErrAgentRunEventReference = errors.New("invalid agent run event reference")
)

// AgentRunEvent 是同域 Run 的只追加脱敏事件事实，没有可变版本或更新时间。
// 序号分配和 Run.last_event_seq 推进由持有 Run 锁的专用事务完成。
type AgentRunEvent struct {
	ID                   int64  `json:"-" gorm:"primaryKey;comment:事件有符号64位主键，由GORM生成"`                                                                                                                                                                  // 事件有符号64位主键，由GORM生成。
	CreatedAt            int64  `json:"-" gorm:"type:bigint;not null;autoCreateTime:false;comment:事件持久化时间，UTC Unix毫秒"`                                                                                                                                   // 事件持久化时间，UTC Unix毫秒。
	TeamID               int64  `json:"-" gorm:"type:bigint;not null;comment:与父Run一致的Team归属"`                                                                                                                                                            // 与父Run一致的Team归属。
	WorkspaceID          int64  `json:"-" gorm:"type:bigint;not null;index:idx_ag_run_events_workspace_run_seq,priority:1;comment:与父Run一致的工作区归属"`                                                                                                        // 与父Run一致的工作区归属。
	RunID                int64  `json:"-" gorm:"type:bigint;not null;uniqueIndex:ux_ag_run_events_run_seq,priority:1;uniqueIndex:ux_ag_run_events_run_key,priority:1;index:idx_ag_run_events_workspace_run_seq,priority:2;comment:所属Run，必须同时匹配Team和工作区"` // 所属Run，必须同时匹配Team和工作区。
	Seq                  int64  `json:"-" gorm:"type:bigint;not null;uniqueIndex:ux_ag_run_events_run_seq,priority:2;index:idx_ag_run_events_workspace_run_seq,priority:3;comment:Run内从1递增的安全整数序号"`                                                      // Run内从1递增的安全整数序号。
	EventKey             string `json:"-" gorm:"type:char(64);not null;uniqueIndex:ux_ag_run_events_run_key,priority:2;comment:生产者逻辑事件SHA256小写去重键，不是授权凭据"`                                                                                               // 生产者逻辑事件SHA256小写去重键，不是授权凭据。
	StepID               *int64 `json:"-" gorm:"type:bigint;comment:同Run相关步骤，无相关步骤为NULL"`                                                                                                                                                                // 同Run相关步骤，无相关步骤为NULL。
	EventType            string `json:"-" gorm:"type:varchar(48);not null;comment:可扩展事件类型，1至48字节可见ASCII标识"`                                                                                                                                              // 可扩展事件类型，1至48字节可见ASCII标识。
	PayloadJSON          string `json:"-" gorm:"column:payload_json;type:text;not null;comment:版本化脱敏载荷对象，最多16KiB，禁止凭据和隐藏推理"`                                                                                                                             // 版本化脱敏载荷对象，最多16KiB，禁止凭据和隐藏推理。
	PayloadSchemaVersion int32  `json:"-" gorm:"type:int;not null;comment:事件载荷结构版本，当前为1"`                                                                                                                                                                // 事件载荷结构版本，当前为1。
	Visibility           string `json:"-" gorm:"type:varchar(16);not null;comment:可见范围user或admin，不能替代读取授权"`                                                                                                                                              // 可见范围user或admin，不能替代读取授权。
}

func (AgentRunEvent) TableName() string { return "ag_run_events" }

func (event *AgentRunEvent) BeforeCreate(tx *gorm.DB) error {
	if tx == nil || tx.Statement == nil {
		return ErrAgentRunEventInvalid
	}
	if _, exists := tx.Statement.Clauses["ON CONFLICT"]; exists {
		return ErrAgentRunEventInvalid
	}
	if event.PayloadSchemaVersion == 0 {
		event.PayloadSchemaVersion = 1
	}
	if event.Visibility == "" {
		event.Visibility = AgentRunEventVisibilityUser
	}
	if event.ID != 0 || event.CreatedAt != 0 || event.TeamID <= 0 || event.WorkspaceID <= 0 || event.RunID <= 0 ||
		event.Seq < 1 || event.Seq > agentDefinitionMaxInteger || !agentDigestValid(event.EventKey) || event.StepID != nil && *event.StepID <= 0 ||
		len(event.EventType) < 1 || len(event.EventType) > 48 || len(event.PayloadJSON) > 16*1024 || event.PayloadSchemaVersion != 1 ||
		!slices.Contains([]string{AgentRunEventVisibilityUser, AgentRunEventVisibilityAdmin}, event.Visibility) {
		return ErrAgentRunEventInvalid
	}
	for _, character := range []byte(event.EventType) {
		if character < 0x21 || character > 0x7e {
			return ErrAgentRunEventInvalid
		}
	}
	if _, err := common.UnmarshalJSONObjectStrict([]byte(event.PayloadJSON)); err != nil {
		return ErrAgentRunEventInvalid
	}
	now := time.Now().UnixMilli()
	if now <= 0 || now > agentDefinitionMaxInteger {
		return ErrAgentRunEventInvalid
	}
	// Isolate the callback's event Statement while retaining its transaction.
	tx = tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard})
	var run AgentRun
	if err := lockForUpdate(tx).Select("id").Where("id = ? AND team_id = ? AND workspace_id = ?", event.RunID, event.TeamID, event.WorkspaceID).Take(&run).Error; err != nil {
		return errors.Join(ErrAgentRunEventReference, err)
	}
	if event.StepID != nil {
		var step AgentRunStep
		if err := lockForUpdate(tx).Select("id").Where("id = ? AND team_id = ? AND workspace_id = ? AND run_id = ?", *event.StepID, event.TeamID, event.WorkspaceID, event.RunID).Take(&step).Error; err != nil {
			return errors.Join(ErrAgentRunEventReference, err)
		}
	}
	event.CreatedAt = now
	return nil
}

func (*AgentRunEvent) BeforeUpdate(*gorm.DB) error { return ErrAgentRunEventInvalid }
func (*AgentRunEvent) BeforeDelete(*gorm.DB) error { return ErrAgentRunEventInvalid }
