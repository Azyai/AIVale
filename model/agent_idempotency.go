package model

import (
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// AgentIdempotencyKey 是主库受理收据。P01-T04仅保存与业务同事务完成的结果，
// P01-T06及后续阶段复用此表；原始Key、会话和请求正文不在这里保存。
type AgentIdempotencyKey struct {
	ID             int64   `json:"-" gorm:"primaryKey;index:idx_ag_idempotency_expiry_id,priority:2"`                     // 主库受理收据自增主键。
	CreatedAt      int64   `json:"-" gorm:"type:bigint;not null;autoCreateTime:false"`                                    // 收据创建UTC毫秒，与期限共用时钟。
	UpdatedAt      int64   `json:"-" gorm:"type:bigint;not null;autoUpdateTime:false"`                                    // 收据最后更新时间，UTC毫秒。
	Revision       int64   `json:"-" gorm:"type:bigint;not null"`                                                         // 收据修订号，本批创建为1且不修改结果。
	TeamID         int64   `json:"-" gorm:"type:bigint;not null"`                                                         // 已验证的现有Team引用。
	WorkspaceID    int64   `json:"-" gorm:"type:bigint;not null"`                                                         // 同事务实际生成/归档的工作区引用，不保存NULL或0。
	ScopeHash      string  `json:"-" gorm:"type:varchar(64);not null;uniqueIndex:ux_ag_idempotency_scope_key,priority:1"` // Team、主体及操作范围的SHA-256小写十六进制。
	KeyHash        string  `json:"-" gorm:"type:varchar(64);not null;uniqueIndex:ux_ag_idempotency_scope_key,priority:2"` // 原始Idempotency-Key的SHA-256，绝不保存原Key。
	RequestHash    string  `json:"-" gorm:"type:varchar(64);not null"`                                                    // 规范化目标/主体/业务输入的SHA-256。
	Operation      string  `json:"-" gorm:"type:varchar(48);not null"`                                                    // 工作区创建/归档或运行 Key 授权创建。
	State          string  `json:"-" gorm:"type:varchar(16);not null"`                                                    // 本批仅事务完成的completed，后续阶段扩展状态机。
	ResourceType   *string `json:"-" gorm:"type:varchar(24)"`                                                             // 已提交结果类别 workspace 或 token_grant。
	ResourceID     *int64  `json:"-" gorm:"type:bigint"`                                                                  // 已提交工作区或授权主键，按 Operation 校验。
	ResponseStatus *int32  `json:"-" gorm:"type:int"`                                                                     // 已提交HTTP成功状态；本批201/200，completed不可NULL。
	ResponseJSON   *string `json:"-" gorm:"type:text"`                                                                    // 最多60KiB不可变安全收据，无权限/秘密；completed不可NULL。
	ExpiresAt      int64   `json:"-" gorm:"type:bigint;not null;index:idx_ag_idempotency_expiry_id,priority:1"`           // UTC毫秒，至少创建后24h；本批到期仍不清理/复用。
}

func (AgentIdempotencyKey) TableName() string { return "ag_idempotency_keys" }

func (record *AgentIdempotencyKey) BeforeCreate(_ *gorm.DB) error {
	now := time.Now().UnixMilli()
	if record.ExpiresAt == 0 {
		record.ExpiresAt = now + int64(24*time.Hour/time.Millisecond)
	}
	if record.ID != 0 || record.TeamID <= 0 || record.WorkspaceID <= 0 || !agentDigestValid(record.ScopeHash) || !agentDigestValid(record.KeyHash) || !agentDigestValid(record.RequestHash) ||
		record.State != "completed" || record.ResourceType == nil || record.ResourceID == nil || *record.ResourceID <= 0 ||
		record.ResponseStatus == nil || (*record.ResponseStatus != 200 && *record.ResponseStatus != 201) || record.ResponseJSON == nil ||
		!utf8.ValidString(*record.ResponseJSON) || len(*record.ResponseJSON) > 60*1024 || record.ExpiresAt < now+int64(24*time.Hour/time.Millisecond) || record.ExpiresAt > 9007199254740991 {
		return ErrAgentWorkspaceInvalid
	}
	switch record.Operation {
	case "workspace.create", "workspace.archive":
		if *record.ResourceType != "workspace" || *record.ResourceID != record.WorkspaceID {
			return ErrAgentWorkspaceInvalid
		}
	case "token_grant.create":
		if *record.ResourceType != "token_grant" {
			return ErrAgentWorkspaceInvalid
		}
	default:
		return ErrAgentWorkspaceInvalid
	}
	var response map[string]common.RawMessage
	if err := common.UnmarshalJsonStr(*record.ResponseJSON, &response); err != nil || response == nil {
		return ErrAgentWorkspaceInvalid
	}
	record.CreatedAt, record.UpdatedAt, record.Revision = now, now, 1
	return nil
}

func agentDigestValid(value string) bool {
	return len(value) == 64 && strings.Trim(value, "0123456789abcdef") == ""
}

// GetAgentIdempotencyKey 必须在当前身份及租户事实已锁定后调用；不接受原始Key。
func GetAgentIdempotencyKey(tx *gorm.DB, teamID int64, scopeHash, keyHash string) (*AgentIdempotencyKey, error) {
	if tx == nil || teamID <= 0 || !agentDigestValid(scopeHash) || !agentDigestValid(keyHash) {
		return nil, ErrAgentWorkspaceInvalid
	}
	var record AgentIdempotencyKey
	if err := lockForUpdate(tx).Where("team_id = ? AND "+agentWorkspaceExactColumn(tx, "scope_hash")+" = ? AND "+agentWorkspaceExactColumn(tx, "key_hash")+" = ?", teamID, scopeHash, keyHash).Take(&record).Error; err != nil {
		return nil, err
	}
	return &record, nil
}
