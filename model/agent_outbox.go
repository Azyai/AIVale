package model

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	agentOutboxKindWorkspaceAudit         = "workspace_audit"
	AgentOutboxKindWorkspaceMemberAudit   = "workspace_member_audit"
	AgentOutboxKindTokenGrantAudit        = "token_grant_audit"
	AgentOutboxKindTokenGrantRenewalAudit = "token_grant_renewal_audit"
	AgentOutboxKindDefinitionAudit        = "agent_definition_audit"
	AgentOutboxKindPublicationAudit       = "agent_publication_audit"
	AgentOutboxKindLifecycleAudit         = "agent_lifecycle_audit"
	AgentOutboxKindRunMetadataAudit       = "run_metadata_audit"
	agentDefinitionAuditSchemaVersion     = 5
	agentPublicationAuditSchemaVersion    = 6
	agentLifecycleAuditSchemaVersion      = 7
	agentRunMetadataAuditSchemaVersion    = 8
)

// AgentOutbox 保存事务审计事实和运行通知；投递入口显式调用，不启动worker。
type AgentOutbox struct {
	ID             int64   `json:"-" gorm:"primaryKey;index:idx_ag_outbox_ready_id,priority:3"`                // 主库事件自增主键。
	CreatedAt      int64   `json:"-" gorm:"type:bigint;not null;autoCreateTime:false"`                         // 事实创建时间，UTC毫秒。
	UpdatedAt      int64   `json:"-" gorm:"type:bigint;not null;autoUpdateTime:false"`                         // 投递记录最后更新时间，UTC毫秒。
	Revision       int64   `json:"-" gorm:"type:bigint;not null"`                                              // 投递状态CAS修订号，从1递增。
	TeamID         int64   `json:"-" gorm:"type:bigint;not null"`                                              // 服务端已核对的现有Team引用。
	WorkspaceID    int64   `json:"-" gorm:"type:bigint;not null"`                                              // 同事务业务工作区引用，不使用0哨兵。
	EventKey       string  `json:"-" gorm:"type:varchar(64);not null;uniqueIndex:ux_ag_outbox_event_key"`      // 全局唯一小写64位十六进制事件键，兼作日志EventID。
	Kind           string  `json:"-" gorm:"type:varchar(32);not null"`                                         // 固定审计或运行通知类别，消费端按各自白名单领取。
	AggregateType  string  `json:"-" gorm:"type:varchar(24);not null"`                                         // 审计聚合类别workspace、agent或run，与事件类别匹配。
	AggregateID    int64   `json:"-" gorm:"type:bigint;not null"`                                              // 审计所属工作区、Agent或Run主键，按事件类别校验。
	PayloadJSON    string  `json:"-" gorm:"type:text;not null"`                                                // 版本化引用载荷，最多16KiB，无正文或凭据。
	Status         string  `json:"-" gorm:"type:varchar(16);not null;index:idx_ag_outbox_ready_id,priority:1"` // pending、delivering、delivered、dead；审计投影仍仅处理pending。
	Attempts       int32   `json:"-" gorm:"type:int;not null"`                                                 // 已尝试投递次数，非负且受溢出检查。
	AvailableAt    int64   `json:"-" gorm:"type:bigint;not null;index:idx_ag_outbox_ready_id,priority:2"`      // 可投递时间，UTC毫秒。
	LeaseOwner     *string `json:"-" gorm:"type:varchar(96)"`                                                  // 运行通知投递租约主体，审计投影不使用。
	LeaseExpiresAt *int64  `json:"-" gorm:"type:bigint"`                                                       // 运行通知租约截止UTC毫秒，过期允许其他投递者接管。
	LastErrorCode  *string `json:"-" gorm:"type:varchar(64)"`                                                  // 固定安全错误码；无失败时NULL，不保存错误原文。
	DeliveredAt    *int64  `json:"-" gorm:"type:bigint"`                                                       // 确认投递UTC毫秒；尚未确认时NULL。
}

func (AgentOutbox) TableName() string { return "ag_outbox" }

func (event *AgentOutbox) BeforeCreate(tx *gorm.DB) error {
	if event.ID != 0 || event.TeamID <= 0 || event.WorkspaceID <= 0 || !agentDigestValid(event.EventKey) ||
		!agentAuditAggregateValid(event) || event.Status != "pending" || event.Attempts != 0 ||
		event.LeaseOwner != nil || event.LeaseExpiresAt != nil || event.DeliveredAt != nil || event.LastErrorCode != nil ||
		!utf8.ValidString(event.PayloadJSON) || len(event.PayloadJSON) > 16*1024 {
		return ErrAgentWorkspaceInvalid
	}
	payload, err := decodeWorkspaceAuditPayload(event.Kind, event.PayloadJSON)
	if err != nil || !workspaceAuditPayloadValid(event, payload) {
		return ErrAgentWorkspaceInvalid
	}
	now := time.Now().UnixMilli()
	event.CreatedAt, event.UpdatedAt, event.Revision, event.AvailableAt = now, now, 1, now
	return nil
}

func agentAuditAggregateValid(event *AgentOutbox) bool {
	if event.Kind == AgentOutboxKindRunMetadataAudit {
		return event.AggregateType == "run" && event.AggregateID > 0
	}
	if event.Kind == AgentOutboxKindDefinitionAudit || event.Kind == AgentOutboxKindPublicationAudit || event.Kind == AgentOutboxKindLifecycleAudit {
		return event.AggregateType == "agent" && event.AggregateID > 0
	}
	return event.AggregateType == "workspace" && event.AggregateID == event.WorkspaceID
}

// WorkspaceAuditPayload 只保存引用及变更类别，不保存正文、原始理由或认证材料。
type WorkspaceAuditPayload struct {
	SchemaVersion          int      `json:"schema_version"`
	EventID                string   `json:"event_id"`
	ActorID                string   `json:"actor_id"`
	ActorRole              int      `json:"actor_role"`
	TeamID                 string   `json:"team_id"`
	WorkspaceID            string   `json:"workspace_id"`
	Operation              string   `json:"operation"`
	PreviousRevision       int64    `json:"previous_revision"`
	Revision               int64    `json:"revision"`
	RequestID              string   `json:"request_id"`
	Timestamp              int64    `json:"timestamp"`
	ChangedFields          []string `json:"changed_fields"`
	ReasonHash             string   `json:"reason_hash,omitempty"`
	TargetUserID           string   `json:"target_user_id,omitempty"`
	PreviousRole           string   `json:"previous_role,omitempty"`
	Role                   string   `json:"role,omitempty"`
	TokenID                string   `json:"token_id,omitempty"`
	GrantID                string   `json:"grant_id,omitempty"`
	GrantScope             string   `json:"grant_scope,omitempty"`
	PreviousGrantStatus    string   `json:"previous_grant_status,omitempty"`
	PreviousGrantExpiresAt *int64   `json:"previous_grant_expires_at,omitempty"`
	PreviousGrantRevokedAt *int64   `json:"previous_grant_revoked_at,omitempty"`
	GrantExpiresAt         *int64   `json:"grant_expires_at,omitempty"`
	AgentID                string   `json:"agent_id,omitempty"`
	VersionID              string   `json:"version_id,omitempty"`            // 发布审计引用的不可变版本ID，规范正十进制字符串。
	SourceDraftRevision    int64    `json:"source_draft_revision,omitempty"` // 发布时冻结的草稿修订号；非发布事件不包含此字段。
	PreviousAgentStatus    string   `json:"previous_agent_status,omitempty"` // 生命周期变更前的Agent状态，不包含配置正文。
	AgentStatus            string   `json:"agent_status,omitempty"`          // 生命周期变更后的Agent状态；归档记录archived。
	RunID                  string   `json:"run_id,omitempty"`                // 仅v8元数据创建审计包含的Run引用，不包含输入或运行授权。
}

func workspaceAuditPayloadValid(event *AgentOutbox, payload WorkspaceAuditPayload) bool {
	actor, err := strconv.ParseInt(payload.ActorID, 10, 64)
	if err != nil || actor <= 0 || strconv.FormatInt(actor, 10) != payload.ActorID || int64(int(actor)) != actor || !common.IsValidateRole(payload.ActorRole) ||
		event.TeamID <= 0 || event.WorkspaceID <= 0 || !agentDigestValid(event.EventKey) || payload.EventID != event.EventKey || payload.TeamID != strconv.FormatInt(event.TeamID, 10) || payload.WorkspaceID != strconv.FormatInt(event.WorkspaceID, 10) ||
		payload.PreviousRevision < 0 || payload.PreviousRevision >= 9007199254740991 || payload.Revision < 1 || payload.Revision > 9007199254740991 || payload.Revision != payload.PreviousRevision+1 ||
		payload.Timestamp < 1 || payload.Timestamp > 9007199254740991 || !agentRequestIDValid(payload.RequestID) {
		return false
	}
	if payload.RunID != "" && event.Kind != AgentOutboxKindRunMetadataAudit {
		return false
	}
	if event.Kind == AgentOutboxKindRunMetadataAudit {
		if payload.SchemaVersion != agentRunMetadataAuditSchemaVersion || !agentAuditAggregateValid(event) ||
			payload.RunID != strconv.FormatInt(event.AggregateID, 10) || payload.Operation != "run.metadata.create" ||
			payload.PreviousRevision != 0 || payload.Revision != 1 || payload.ChangedFields == nil || len(payload.ChangedFields) != 0 {
			return false
		}
		for _, id := range []string{payload.AgentID, payload.VersionID} {
			value, err := strconv.ParseInt(id, 10, 64)
			if err != nil || value <= 0 || strconv.FormatInt(value, 10) != id {
				return false
			}
		}
		return true
	}
	if event.Kind == AgentOutboxKindWorkspaceMemberAudit {
		return workspaceMemberAuditPayloadValid(payload)
	}
	if event.Kind == AgentOutboxKindDefinitionAudit {
		if payload.SchemaVersion != agentDefinitionAuditSchemaVersion || !agentAuditAggregateValid(event) ||
			payload.AgentID != strconv.FormatInt(event.AggregateID, 10) || payload.ChangedFields == nil || len(payload.ChangedFields) != 0 {
			return false
		}
		switch payload.Operation {
		case "agent.create":
			return payload.PreviousRevision == 0
		case "agent.draft.update":
			return payload.PreviousRevision > 0
		default:
			return false
		}
	}
	if event.Kind == AgentOutboxKindPublicationAudit {
		versionID, err := strconv.ParseInt(payload.VersionID, 10, 64)
		return err == nil && versionID > 0 && strconv.FormatInt(versionID, 10) == payload.VersionID &&
			payload.SchemaVersion == agentPublicationAuditSchemaVersion && agentAuditAggregateValid(event) &&
			payload.AgentID == strconv.FormatInt(event.AggregateID, 10) && payload.SourceDraftRevision > 0 && payload.SourceDraftRevision <= 9007199254740991 &&
			payload.Operation == "agent.publish" && payload.PreviousRevision > 0 && payload.ChangedFields != nil && len(payload.ChangedFields) == 0
	}
	if event.Kind == AgentOutboxKindLifecycleAudit {
		if payload.SchemaVersion != agentLifecycleAuditSchemaVersion || !agentAuditAggregateValid(event) ||
			payload.AgentID != strconv.FormatInt(event.AggregateID, 10) || payload.PreviousRevision <= 0 ||
			payload.ChangedFields == nil || len(payload.ChangedFields) != 0 ||
			!slices.Contains([]string{AgentDefinitionStatusActive, AgentDefinitionStatusDisabled}, payload.PreviousAgentStatus) {
			return false
		}
		if payload.VersionID != "" {
			versionID, err := strconv.ParseInt(payload.VersionID, 10, 64)
			if err != nil || versionID <= 0 || strconv.FormatInt(versionID, 10) != payload.VersionID {
				return false
			}
		}
		switch payload.Operation {
		case "agent.restore_draft":
			return payload.VersionID != "" && payload.ReasonHash == "" && payload.AgentStatus == payload.PreviousAgentStatus
		case "agent.activate_version":
			return payload.VersionID != "" && agentDigestValid(payload.ReasonHash) && payload.AgentStatus == payload.PreviousAgentStatus
		case "agent.status.update":
			return agentDigestValid(payload.ReasonHash) && payload.AgentStatus != payload.PreviousAgentStatus &&
				slices.Contains([]string{AgentDefinitionStatusActive, AgentDefinitionStatusDisabled}, payload.AgentStatus)
		case "agent.archive":
			return agentDigestValid(payload.ReasonHash) && payload.AgentStatus == AgentDefinitionStatusArchived
		default:
			return false
		}
	}
	if event.Kind == AgentOutboxKindTokenGrantAudit || event.Kind == AgentOutboxKindTokenGrantRenewalAudit {
		if !ValidAgentTokenGrantScope(payload.GrantScope) {
			return false
		}
		for _, id := range []string{payload.TokenID, payload.GrantID} {
			value, err := strconv.ParseInt(id, 10, 64)
			if err != nil || value <= 0 || strconv.FormatInt(value, 10) != id {
				return false
			}
		}
		if event.Kind == AgentOutboxKindTokenGrantRenewalAudit {
			return tokenGrantRenewalAuditPayloadValid(payload)
		}
		if payload.SchemaVersion != 3 {
			return false
		}
		switch payload.Operation {
		case "token_grant.create":
			return payload.PreviousRevision == 0 && payload.ReasonHash == "" && slices.Equal(payload.ChangedFields, []string{"scope", "status"})
		case "token_grant.revoke":
			return payload.PreviousRevision > 0 && agentDigestValid(payload.ReasonHash) && slices.Equal(payload.ChangedFields, []string{"status"})
		default:
			return false
		}
	}
	if event.Kind != agentOutboxKindWorkspaceAudit || payload.SchemaVersion != 1 ||
		!slices.Contains([]string{"workspace.create", "workspace.update", "workspace.archive"}, payload.Operation) ||
		len(payload.ChangedFields) == 0 || len(payload.ChangedFields) > 5 ||
		(payload.ReasonHash != "" && !agentDigestValid(payload.ReasonHash)) {
		return false
	}
	seen := make(map[string]bool, len(payload.ChangedFields))
	for _, field := range payload.ChangedFields {
		if !slices.Contains([]string{"name", "description", "slug", "status", "administrator"}, field) || seen[field] {
			return false
		}
		seen[field] = true
	}
	return true
}

func tokenGrantRenewalAuditPayloadValid(payload WorkspaceAuditPayload) bool {
	if payload.SchemaVersion != 4 || payload.Operation != "token_grant.renew" || payload.PreviousRevision < 1 ||
		payload.ReasonHash != "" || payload.GrantExpiresAt == nil || *payload.GrantExpiresAt < 1 || *payload.GrantExpiresAt > 9007199254740991 ||
		(payload.PreviousGrantExpiresAt != nil && (*payload.PreviousGrantExpiresAt < 1 || *payload.PreviousGrantExpiresAt > 9007199254740991)) ||
		!slices.Equal(payload.ChangedFields, []string{"expires_at", "status"}) {
		return false
	}
	switch payload.PreviousGrantStatus {
	case AgentTokenGrantStatusActive:
		return payload.PreviousGrantRevokedAt == nil && payload.PreviousGrantExpiresAt != nil && *payload.PreviousGrantExpiresAt <= payload.Timestamp
	case AgentTokenGrantStatusRevoked:
		return payload.PreviousRevision >= 2 && payload.PreviousGrantRevokedAt != nil && *payload.PreviousGrantRevokedAt > 0 && *payload.PreviousGrantRevokedAt <= 9007199254740991
	default:
		return false
	}
}

func workspaceMemberAuditPayloadValid(payload WorkspaceAuditPayload) bool {
	target, err := strconv.ParseInt(payload.TargetUserID, 10, 64)
	roles := []string{AgentWorkspaceRoleAdmin, AgentWorkspaceRoleDeveloper, AgentWorkspaceRoleOperator, AgentWorkspaceRoleViewer}
	if err != nil || target <= 0 || strconv.FormatInt(target, 10) != payload.TargetUserID || payload.SchemaVersion != 2 ||
		payload.ReasonHash != "" || !slices.Contains(roles, payload.Role) ||
		(payload.PreviousRevision == 0 && payload.PreviousRole != "") ||
		(payload.PreviousRevision > 0 && !slices.Contains(roles, payload.PreviousRole)) {
		return false
	}
	switch payload.Operation {
	case "workspace.member.add":
		if payload.PreviousRole == payload.Role {
			return slices.Equal(payload.ChangedFields, []string{"status"})
		}
		return slices.Equal(payload.ChangedFields, []string{"role", "status"})
	case "workspace.member.update":
		return payload.PreviousRevision > 0 && payload.PreviousRole != payload.Role && slices.Equal(payload.ChangedFields, []string{"role"})
	case "workspace.member.remove":
		return payload.PreviousRevision > 0 && payload.PreviousRole == payload.Role && slices.Equal(payload.ChangedFields, []string{"status"})
	default:
		return false
	}
}

// decodeWorkspaceAuditPayload拒绝未知/重复key及损坏Unicode，保证持久化载荷白名单。
func decodeWorkspaceAuditPayload(kind, raw string) (WorkspaceAuditPayload, error) {
	var payload WorkspaceAuditPayload
	if len(raw) > 16*1024 {
		return payload, ErrAgentWorkspaceInvalid
	}
	fields, err := common.UnmarshalJSONObjectStrict([]byte(raw))
	if err != nil {
		return payload, ErrAgentWorkspaceInvalid
	}
	required := []string{"schema_version", "event_id", "actor_id", "actor_role", "team_id", "workspace_id", "operation", "previous_revision", "revision", "request_id", "timestamp", "changed_fields"}
	var optional []string
	switch kind {
	case agentOutboxKindWorkspaceAudit:
		optional = []string{"reason_hash"}
	case AgentOutboxKindWorkspaceMemberAudit:
		required = append(required, "target_user_id", "role")
		optional = []string{"previous_role"}
	case AgentOutboxKindTokenGrantAudit:
		required = append(required, "token_id", "grant_id", "grant_scope")
		optional = []string{"reason_hash"}
	case AgentOutboxKindTokenGrantRenewalAudit:
		required = append(required, "token_id", "grant_id", "grant_scope", "previous_grant_status", "grant_expires_at")
		optional = []string{"previous_grant_expires_at", "previous_grant_revoked_at"}
	case AgentOutboxKindDefinitionAudit:
		required = append(required, "agent_id")
	case AgentOutboxKindPublicationAudit:
		required = append(required, "agent_id", "version_id", "source_draft_revision")
	case AgentOutboxKindLifecycleAudit:
		required = append(required, "agent_id", "previous_agent_status", "agent_status")
		optional = []string{"version_id", "reason_hash"}
	case AgentOutboxKindRunMetadataAudit:
		required = append(required, "run_id", "agent_id", "version_id")
	default:
		return payload, ErrAgentWorkspaceInvalid
	}
	for _, key := range required {
		if _, present := fields[key]; !present {
			return payload, ErrAgentWorkspaceInvalid
		}
	}
	for key, value := range fields {
		if (!slices.Contains(optional, key) && !slices.Contains(required, key)) || string(value) == "null" ||
			(kind == AgentOutboxKindWorkspaceMemberAudit && key == "previous_role" && string(value) == `""`) {
			return payload, ErrAgentWorkspaceInvalid
		}
	}
	if err := common.UnmarshalJsonStr(raw, &payload); err != nil {
		return payload, ErrAgentWorkspaceInvalid
	}
	return payload, nil
}

func agentRequestIDValid(value string) bool {
	if len(value) < 1 || len(value) > 64 {
		return false
	}
	for _, character := range value {
		if (character < 'a' || character > 'z') && (character < 'A' || character > 'Z') && (character < '0' || character > '9') && !strings.ContainsRune("-_.:", character) {
			return false
		}
	}
	return true
}

// ProjectWorkspaceAudit 是显式有界恢复入口，只处理已实现的工作区审计事件。
// 主事实已提交后才调用。ClickHouse暂无唯一EventID保证，保留pending且返回错误。
func ProjectWorkspaceAudit(ctx context.Context, mainDB, logDB *gorm.DB, limit int) (int, error) {
	if ctx == nil || mainDB == nil || mainDB.Config == nil || mainDB.Dialector == nil || mainDB.Statement == nil || mainDB.Statement.ConnPool == nil || logDB == nil || logDB.Config == nil || logDB.Dialector == nil || logDB.Statement == nil || logDB.Statement.ConnPool == nil || limit < 1 || limit > 100 {
		return 0, ErrAgentWorkspaceInvalid
	}
	if _, transactional := mainDB.Statement.ConnPool.(gorm.TxCommitter); transactional {
		return 0, ErrAgentWorkspaceInvalid
	}
	if _, transactional := logDB.Statement.ConnPool.(gorm.TxCommitter); transactional {
		return 0, ErrAgentWorkspaceInvalid
	}
	if !slices.Contains([]string{"sqlite", "mysql", "postgres"}, logDB.Dialector.Name()) {
		return 0, errors.New("workspace audit projection requires a relational log store")
	}
	var events []AgentOutbox
	err := mainDB.WithContext(ctx).Where(agentWorkspaceExactColumn(mainDB, "kind")+" IN ? AND "+agentWorkspaceExactColumn(mainDB, "status")+" = ? AND available_at <= ?",
		[]string{agentOutboxKindWorkspaceAudit, AgentOutboxKindWorkspaceMemberAudit, AgentOutboxKindTokenGrantAudit, AgentOutboxKindTokenGrantRenewalAudit, AgentOutboxKindDefinitionAudit, AgentOutboxKindPublicationAudit, AgentOutboxKindLifecycleAudit, AgentOutboxKindRunMetadataAudit}, "pending", time.Now().UnixMilli()).Order("id ASC").Limit(limit).Find(&events).Error
	if err != nil {
		return 0, err
	}
	delivered := 0
	for _, event := range events {
		if err := ctx.Err(); err != nil {
			return delivered, err
		}
		if event.Status != "pending" || !agentAuditAggregateValid(&event) || event.Attempts < 0 || event.Attempts == 2147483647 || event.Revision < 1 || event.Revision >= 9007199254740991 {
			return delivered, ErrAgentWorkspaceInvalid
		}
		payload, err := decodeWorkspaceAuditPayload(event.Kind, event.PayloadJSON)
		if err != nil || !workspaceAuditPayloadValid(&event, payload) {
			return delivered, ErrAgentWorkspaceInvalid
		}
		if err := projectWorkspaceAuditEvent(ctx, logDB, payload); err != nil {
			// Failure metadata is static. A failed bookkeeping write cannot turn a
			// pending event into delivered or discard its durable payload.
			_ = mainDB.WithContext(ctx).Model(&AgentOutbox{}).Where("id = ? AND status = ? AND revision = ?", event.ID, "pending", event.Revision).
				Updates(map[string]any{"attempts": event.Attempts + 1, "last_error_code": "AG_INTERNAL_ERROR", "updated_at": time.Now().UnixMilli(), "revision": event.Revision + 1}).Error
			return delivered, err
		}
		now := time.Now().UnixMilli()
		updated := mainDB.WithContext(ctx).Model(&AgentOutbox{}).Where("id = ? AND event_key = ? AND kind = ? AND status = ? AND revision = ?", event.ID, event.EventKey, event.Kind, "pending", event.Revision).
			Updates(map[string]any{"status": "delivered", "attempts": event.Attempts + 1, "delivered_at": now, "last_error_code": nil, "updated_at": now, "revision": event.Revision + 1})
		if updated.Error != nil {
			return delivered, updated.Error
		}
		delivered += int(updated.RowsAffected)
	}
	return delivered, nil
}

func projectWorkspaceAuditEvent(ctx context.Context, logDB *gorm.DB, payload WorkspaceAuditPayload) error {
	actor, _ := strconv.Atoi(payload.ActorID) // validated before any insert.
	params := AuditFields{"team_id": payload.TeamID, "workspace_id": payload.WorkspaceID, "previous_revision": payload.PreviousRevision, "revision": payload.Revision, "changed_fields": payload.ChangedFields}
	if payload.ReasonHash != "" {
		params["reason_hash"] = payload.ReasonHash
	}
	if payload.SchemaVersion == 2 {
		params["target_user_id"] = payload.TargetUserID
		params["role"] = payload.Role
		if payload.PreviousRole != "" {
			params["previous_role"] = payload.PreviousRole
		}
	}
	if payload.SchemaVersion == 3 || payload.SchemaVersion == 4 {
		params["token_id"], params["grant_id"], params["grant_scope"] = payload.TokenID, payload.GrantID, payload.GrantScope
	}
	if payload.SchemaVersion == 4 {
		params["previous_grant_status"], params["grant_expires_at"] = payload.PreviousGrantStatus, *payload.GrantExpiresAt
		if payload.PreviousGrantExpiresAt != nil {
			params["previous_grant_expires_at"] = *payload.PreviousGrantExpiresAt
		}
		if payload.PreviousGrantRevokedAt != nil {
			params["previous_grant_revoked_at"] = *payload.PreviousGrantRevokedAt
		}
	}
	if payload.SchemaVersion == agentDefinitionAuditSchemaVersion || payload.SchemaVersion == agentPublicationAuditSchemaVersion || payload.SchemaVersion == agentLifecycleAuditSchemaVersion || payload.SchemaVersion == agentRunMetadataAuditSchemaVersion {
		params["agent_id"] = payload.AgentID
	}
	if payload.SchemaVersion == agentRunMetadataAuditSchemaVersion {
		params["run_id"], params["version_id"] = payload.RunID, payload.VersionID
	}
	if payload.SchemaVersion == agentPublicationAuditSchemaVersion {
		params["version_id"], params["source_draft_revision"] = payload.VersionID, payload.SourceDraftRevision
	}
	if payload.SchemaVersion == agentLifecycleAuditSchemaVersion {
		params["previous_agent_status"], params["agent_status"] = payload.PreviousAgentStatus, payload.AgentStatus
		if payload.VersionID != "" {
			params["version_id"] = payload.VersionID
		}
	}
	status := 200
	if payload.Operation == "workspace.create" || payload.Operation == "token_grant.create" || payload.Operation == "agent.create" || payload.Operation == "agent.publish" || payload.Operation == "run.metadata.create" {
		status = 201
	}
	entry := AuditLog{EventId: payload.EventID, UserId: actor, ActorRole: payload.ActorRole, CreatedAt: payload.Timestamp / 1000,
		Category: AuditCategoryOperation, Action: payload.Operation, AuthMethod: "session", Status: status, Success: true,
		RequestId: payload.RequestID, Content: payload.Operation, Other: AuditOther{Op: &AuditOperation{Action: payload.Operation, Params: params}}}
	if err := logDB.WithContext(ctx).Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "event_id"}}, DoNothing: true}).Create(&entry).Error; err != nil {
		return err
	}
	var stored struct {
		AuditLog
		EncodedOther string `gorm:"column:encoded_other"`
	}
	if err := logDB.WithContext(ctx).Table("audit_logs").Select("audit_logs.*, audit_logs.other AS encoded_other").Where(agentWorkspaceExactColumn(logDB, "event_id")+" = ?", payload.EventID).Take(&stored).Error; err != nil {
		return err
	}
	expectedOther, err := common.Marshal(entry.Other)
	if err != nil {
		return err
	}
	expectedOther, err = canonicalWorkspaceAuditOther(expectedOther, 0)
	if err != nil {
		return err
	}
	actualOther, err := canonicalWorkspaceAuditOther([]byte(stored.EncodedOther), 0)
	if err != nil {
		return err
	}
	if stored.EventId != entry.EventId || stored.UserId != entry.UserId || stored.ActorRole != entry.ActorRole || stored.CreatedAt != entry.CreatedAt ||
		stored.Category != entry.Category || stored.Action != entry.Action || stored.AuthMethod != entry.AuthMethod || stored.Status != entry.Status ||
		stored.Success != entry.Success || stored.RequestId != entry.RequestId || stored.Content != entry.Content || stored.Username != "" || stored.TokenRef != "" ||
		stored.Ip != "" || stored.UserAgent != "" || stored.Method != "" || stored.Route != "" || string(expectedOther) != string(actualOther) {
		return fmt.Errorf("workspace audit event identity mismatch")
	}
	return nil
}

// canonicalWorkspaceAuditOther对完整原始JSON排序及规范化字符串，保留数值词法。
// 不经AuditOther结构体丢弃未知字段，也不经float64舍入数值后误判内容相同。
func canonicalWorkspaceAuditOther(raw []byte, depth int) ([]byte, error) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || len(raw) > 16*1024 || depth > 16 {
		return nil, ErrAgentWorkspaceInvalid
	}
	switch raw[0] {
	case '{':
		fields, err := common.UnmarshalJSONObjectStrict(raw)
		if err != nil {
			return nil, err
		}
		for key, value := range fields {
			encoded, err := canonicalWorkspaceAuditOther(value, depth+1)
			if err != nil {
				return nil, err
			}
			fields[key] = encoded
		}
		return common.Marshal(fields)
	case '[':
		var entries []common.RawMessage
		if err := common.Unmarshal(raw, &entries); err != nil {
			return nil, err
		}
		for index, value := range entries {
			encoded, err := canonicalWorkspaceAuditOther(value, depth+1)
			if err != nil {
				return nil, err
			}
			entries[index] = encoded
		}
		return common.Marshal(entries)
	case '"':
		var value string
		if err := common.Unmarshal(raw, &value); err != nil {
			return nil, err
		}
		return common.Marshal(value)
	default:
		// Root/nested objects have already been validated by the strict codec.
		return raw, nil
	}
}
