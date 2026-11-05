package model

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	AgentDefinitionKindSingle     = "single"
	AgentDefinitionStatusActive   = "active"
	AgentDefinitionStatusDisabled = "disabled"
	AgentDefinitionStatusArchived = "archived"
	AgentVersionKindRelease       = "release"
	AgentVersionKindDebug         = "debug"
	agentDefinitionMaxInteger     = int64(9007199254740991)
)

var (
	ErrAgentDefinitionInvalid   = errors.New("invalid agent definition input")
	ErrAgentDefinitionReference = errors.New("invalid agent definition reference")
	ErrAgentDefinitionRevision  = errors.New("agent definition revision changed")
	ErrAgentVersionImmutable    = errors.New("agent version content is immutable")
)

// AgentDefinition 是团队工作区内的可变定义；个人工作区元数据不能作为其父资源。
// 本模型和仓储只约束存储归属，后续管理服务仍须验证实时身份和动作权限。
type AgentDefinition struct {
	ID               int64  `json:"-" gorm:"primaryKey;index:idx_ag_agents_workspace_status_updated_id,priority:4;comment:Agent有符号64位主键，由GORM生成"`                                                            // Agent有符号64位主键，由GORM生成。
	CreatedAt        int64  `json:"-" gorm:"type:bigint;not null;autoCreateTime:false;comment:首次创建时间，UTC Unix毫秒"`                                                                                            // 首次创建时间，UTC Unix毫秒。
	UpdatedAt        int64  `json:"-" gorm:"type:bigint;not null;autoUpdateTime:false;index:idx_ag_agents_workspace_status_updated_id,priority:3;comment:最后变更时间，UTC Unix毫秒"`                                 // 最后变更时间，UTC Unix毫秒。
	Revision         int64  `json:"-" gorm:"type:bigint;not null;default:1;comment:基础元数据和发布指针CAS版本，与草稿版本独立"`                                                                                                 // 基础元数据和发布指针CAS版本，与草稿版本独立。
	TeamID           int64  `json:"-" gorm:"type:bigint;not null;comment:当前团队归属，与父工作区保持一致"`                                                                                                                  // 当前团队归属，与父工作区保持一致。
	WorkspaceID      int64  `json:"-" gorm:"type:bigint;not null;uniqueIndex:ux_ag_agents_workspace_slug,priority:1;index:idx_ag_agents_workspace_status_updated_id,priority:1;comment:所属团队工作区，不能引用个人元数据空间"` // 所属团队工作区，不能引用个人元数据空间。
	CreatedBy        int64  `json:"-" gorm:"type:bigint;not null;comment:创建者，引用同Team现有启用用户"`                                                                                                                 // 创建者，引用同Team现有启用用户。
	UpdatedBy        *int64 `json:"-" gorm:"type:bigint;comment:最后变更用户"`                                                                                                                                     // 最后变更用户；NULL表示尚无人工变更。
	ArchivedAt       *int64 `json:"-" gorm:"type:bigint;comment:业务归档时间，UTC毫秒"`                                                                                                                               // 业务归档时间，UTC毫秒；未归档为NULL。
	Slug             string `json:"-" gorm:"type:varchar(64);not null;uniqueIndex:ux_ag_agents_workspace_slug,priority:2;comment:工作区内唯一的小写ASCII稳定标识，归档不回收"`                                                  // 工作区内唯一的小写ASCII稳定标识，归档不回收。
	Name             string `json:"-" gorm:"type:varchar(128);not null;comment:UTF-8显示名，1至128个字符，可重复"`                                                                                                       // UTF-8显示名，1至128个字符，可重复。
	Description      string `json:"-" gorm:"type:text;not null;comment:UTF-8描述，最多4KiB，不保存凭据"`                                                                                                                // UTF-8描述，最多4KiB，不保存凭据。
	TagsJSON         string `json:"-" gorm:"column:tags_json;type:text;not null;comment:最多32个去空白标签，每项最多64字符，无重复"`                                                                                            // 最多32个去空白标签，每项最多64字符，无重复。
	Kind             string `json:"-" gorm:"type:varchar(16);not null;default:single;comment:当前只允许single"`                                                                                                   // 当前只允许single；workflow由P09单独扩展。
	Status           string `json:"-" gorm:"type:varchar(16);not null;default:active;index:idx_ag_agents_workspace_status_updated_id,priority:2;comment:active、disabled、archived生命周期状态"`                     // active、disabled、archived生命周期状态。
	DraftJSON        string `json:"-" gorm:"column:draft_json;type:text;not null;comment:schema_version=1的配置对象，最多60KiB"`                                                                                     // schema_version=1的配置对象，最多60KiB；模型/工具语义由后续服务校验。
	DraftRevision    int64  `json:"-" gorm:"type:bigint;not null;default:1;comment:独立草稿编辑CAS版本，从1递增"`                                                                                                        // 独立草稿编辑CAS版本，从1递增。
	DraftHash        string `json:"-" gorm:"type:char(64);not null;comment:规范化草稿的SHA-256小写十六进制摘要，不是授权凭据"`                                                                                                    // 规范化草稿的SHA-256小写十六进制摘要，不是授权凭据。
	NextVersion      int64  `json:"-" gorm:"type:bigint;not null;default:1;comment:下一不可变版本序号，发布和调试共用，允许序号空洞"`                                                                                                // 下一不可变版本序号，发布和调试共用，允许序号空洞。
	CurrentVersionID *int64 `json:"-" gorm:"type:bigint;comment:当前同Agent、同Team/工作区的release版本"`                                                                                                               // 当前同Agent、同Team/工作区的release版本；未发布为NULL。
}

func (AgentDefinition) TableName() string { return "ag_agents" }

// AgentVersion 只追加完整配置快照。内容不可覆盖，撤销元数据由后续专用生命周期仓储管理。
type AgentVersion struct {
	ID                  int64   `json:"-" gorm:"primaryKey;index:idx_ag_agent_versions_workspace_agent_kind_id,priority:4;comment:不可变版本有符号64位主键"`                                                                              // 不可变版本有符号64位主键。
	CreatedAt           int64   `json:"-" gorm:"type:bigint;not null;autoCreateTime:false;comment:快照创建时间，UTC Unix毫秒"`                                                                                                          // 快照创建时间，UTC Unix毫秒。
	TeamID              int64   `json:"-" gorm:"type:bigint;not null;comment:与父Agent、工作区一致的Team归属"`                                                                                                                            // 与父Agent、工作区一致的Team归属。
	WorkspaceID         int64   `json:"-" gorm:"type:bigint;not null;index:idx_ag_agent_versions_workspace_agent_kind_id,priority:1;comment:与父Agent一致的工作区归属"`                                                                  // 与父Agent一致的工作区归属。
	CreatedBy           int64   `json:"-" gorm:"type:bigint;not null;comment:快照创建者，引用同Team现有启用用户"`                                                                                                                             // 快照创建者，引用同Team现有启用用户。
	AgentID             int64   `json:"-" gorm:"type:bigint;not null;uniqueIndex:ux_ag_agent_versions_agent_number,priority:1;index:idx_ag_agent_versions_workspace_agent_kind_id,priority:2;comment:所属Agent，必须与Team和工作区同时匹配"` // 所属Agent，必须与Team和工作区同时匹配。
	VersionNo           int64   `json:"-" gorm:"type:bigint;not null;uniqueIndex:ux_ag_agent_versions_agent_number,priority:2;comment:同一Agent从1分配的唯一版本序号"`                                                                     // 同一Agent从1分配的唯一版本序号。
	VersionKind         string  `json:"-" gorm:"type:varchar(16);not null;default:release;index:idx_ag_agent_versions_workspace_agent_kind_id,priority:3;comment:release对外发布或debug私有调试快照"`                                     // release对外发布或debug私有调试快照。
	SourceDraftRevision int64   `json:"-" gorm:"type:bigint;not null;comment:冻结时的草稿版本，之后不随草稿修改"`                                                                                                                               // 冻结时的草稿版本，之后不随草稿修改。
	SchemaVersion       int32   `json:"-" gorm:"type:int;not null;default:1;comment:配置结构版本，当前仅1"`                                                                                                                              // 配置结构版本，当前仅1。
	ConfigJSON          string  `json:"-" gorm:"column:config_json;type:text;not null;comment:冻结的完整配置对象，最多60KiB，禁止原地修改"`                                                                                                       // 冻结的完整配置对象，最多60KiB，禁止原地修改。
	ConfigHash          string  `json:"-" gorm:"type:char(64);not null;comment:规范化配置摘要"`                                                                                                                                       // 规范化配置摘要；当前未开放绑定，不能冒充运行许可。
	InputSchemaJSON     string  `json:"-" gorm:"column:input_schema_json;type:text;not null;comment:冻结的JSON输入契约对象，最多60KiB"`                                                                                                    // 冻结的JSON输入契约对象，最多60KiB。
	OutputSchemaJSON    string  `json:"-" gorm:"column:output_schema_json;type:text;not null;comment:冻结的JSON输出契约对象，无结构要求时为{}"`                                                                                                 // 冻结的JSON输出契约对象，无结构要求时为{}。
	ReleaseNote         string  `json:"-" gorm:"type:text;not null;comment:发布说明，最多4KiB，无凭据"`                                                                                                                                   // 发布说明，最多4KiB，无凭据。
	PublishedAt         *int64  `json:"-" gorm:"type:bigint;comment:release发布时间UTC毫秒"`                                                                                                                                         // release发布时间UTC毫秒；debug为NULL。
	RevokedAt           *int64  `json:"-" gorm:"type:bigint;comment:首次撤销UTC毫秒"`                                                                                                                                                // 首次撤销UTC毫秒；未撤销为NULL，不改变内容。
	RevokedBy           *int64  `json:"-" gorm:"type:bigint;comment:撤销操作者"`                                                                                                                                                    // 撤销操作者；未撤销为NULL。
	RevocationReason    *string `json:"-" gorm:"type:varchar(256);comment:脱敏撤销理由，最多256字符"`                                                                                                                                     // 脱敏撤销理由，最多256字符；未撤销为NULL。
}

func (AgentVersion) TableName() string { return "ag_agent_versions" }

func (definition *AgentDefinition) BeforeCreate(tx *gorm.DB) error {
	if conflict, exists := tx.Statement.Clauses["ON CONFLICT"]; exists {
		if value, ok := conflict.Expression.(clause.OnConflict); !ok || !value.DoNothing {
			return ErrAgentDefinitionInvalid
		}
	}
	definition.Slug = strings.TrimSpace(definition.Slug)
	for _, character := range definition.Slug {
		if character > 127 {
			return ErrAgentDefinitionInvalid
		}
	}
	definition.Slug = strings.ToLower(definition.Slug)
	definition.Name = strings.TrimSpace(definition.Name)
	if definition.Kind == "" {
		definition.Kind = AgentDefinitionKindSingle
	}
	if definition.Status == "" {
		definition.Status = AgentDefinitionStatusActive
	}
	if definition.ID != 0 || definition.TeamID <= 0 || definition.WorkspaceID <= 0 || definition.CreatedBy <= 0 ||
		definition.UpdatedBy != nil || definition.CurrentVersionID != nil || definition.ArchivedAt != nil ||
		!agentWorkspaceSlug.MatchString(definition.Slug) || !agentDefinitionTextValid(definition.Name, 128, 512, false) ||
		!agentDefinitionTextValid(definition.Description, 4096, 4096, true) ||
		definition.Kind != AgentDefinitionKindSingle || !slices.Contains([]string{AgentDefinitionStatusActive, AgentDefinitionStatusDisabled}, definition.Status) ||
		definition.Revision != 0 && definition.Revision != 1 || definition.DraftRevision != 0 && definition.DraftRevision != 1 || definition.NextVersion != 0 && definition.NextVersion != 1 {
		return ErrAgentDefinitionInvalid
	}
	var tags []string
	if len(definition.TagsJSON) > 16*1024 {
		return ErrAgentDefinitionInvalid
	}
	if _, err := common.UnmarshalJSONObjectStrict([]byte(`{"tags":` + definition.TagsJSON + `}`)); err != nil {
		return ErrAgentDefinitionInvalid
	}
	if err := common.UnmarshalJsonStr(definition.TagsJSON, &tags); err != nil || tags == nil || len(tags) > 32 {
		return ErrAgentDefinitionInvalid
	}
	seen := make(map[string]bool, len(tags))
	for index, tag := range tags {
		tag = strings.TrimSpace(tag)
		if !agentDefinitionTextValid(tag, 64, 256, false) || seen[tag] {
			return ErrAgentDefinitionInvalid
		}
		seen[tag], tags[index] = true, tag
	}
	tagsWire, err := common.Marshal(tags)
	if err != nil {
		return err
	}
	draft, err := canonicalAgentDefinitionObject(definition.DraftJSON, true)
	if err != nil {
		return err
	}
	hash := sha256.Sum256([]byte(draft))
	digest := hex.EncodeToString(hash[:])
	if definition.DraftHash != "" && definition.DraftHash != digest {
		return ErrAgentDefinitionInvalid
	}
	definition.TagsJSON, definition.DraftJSON, definition.DraftHash = string(tagsWire), draft, digest
	definition.CreatedAt = time.Now().UnixMilli()
	definition.UpdatedAt, definition.Revision, definition.DraftRevision, definition.NextVersion = definition.CreatedAt, 1, 1, 1
	return nil
}

func (*AgentDefinition) BeforeUpdate(*gorm.DB) error { return ErrAgentDefinitionInvalid }
func (*AgentDefinition) BeforeDelete(*gorm.DB) error { return ErrAgentDefinitionInvalid }

func (version *AgentVersion) BeforeCreate(tx *gorm.DB) error {
	if conflict, exists := tx.Statement.Clauses["ON CONFLICT"]; exists {
		if value, ok := conflict.Expression.(clause.OnConflict); !ok || !value.DoNothing {
			return ErrAgentVersionImmutable
		}
	}
	if version.VersionKind == "" {
		version.VersionKind = AgentVersionKindRelease
	}
	if version.SchemaVersion == 0 {
		version.SchemaVersion = 1
	}
	if version.ID != 0 || version.TeamID <= 0 || version.WorkspaceID <= 0 || version.AgentID <= 0 || version.CreatedBy <= 0 ||
		version.VersionNo <= 0 || version.VersionNo > agentDefinitionMaxInteger ||
		version.SourceDraftRevision <= 0 || version.SourceDraftRevision > agentDefinitionMaxInteger || version.SchemaVersion != 1 ||
		version.RevokedAt != nil || version.RevokedBy != nil || version.RevocationReason != nil ||
		!slices.Contains([]string{AgentVersionKindRelease, AgentVersionKindDebug}, version.VersionKind) ||
		!agentDefinitionTextValid(version.ReleaseNote, 4096, 4096, true) {
		return ErrAgentDefinitionInvalid
	}
	config, err := canonicalAgentDefinitionObject(version.ConfigJSON, true)
	if err != nil {
		return err
	}
	input, err := canonicalAgentDefinitionObject(version.InputSchemaJSON, false)
	if err != nil {
		return err
	}
	output, err := canonicalAgentDefinitionObject(version.OutputSchemaJSON, false)
	if err != nil {
		return err
	}
	fields, err := common.UnmarshalJSONObjectStrict([]byte(config))
	if err != nil {
		return ErrAgentDefinitionInvalid
	}
	// The separately stored input/output contracts must describe this exact
	// frozen configuration; otherwise the same hash could name different APIs.
	for _, schema := range []struct{ key, value string }{{"input_schema", input}, {"output_schema", output}} {
		raw, present := fields[schema.key]
		if !present {
			raw = []byte(`{}`)
		}
		expected, err := canonicalAgentDefinitionObject(string(raw), false)
		if err != nil || schema.value != expected {
			return ErrAgentDefinitionInvalid
		}
	}
	digest := sha256.Sum256([]byte(config))
	hash := hex.EncodeToString(digest[:])
	if version.ConfigHash != "" && version.ConfigHash != hash {
		return ErrAgentDefinitionInvalid
	}
	version.ConfigJSON, version.ConfigHash, version.InputSchemaJSON, version.OutputSchemaJSON = config, hash, input, output
	version.CreatedAt = time.Now().UnixMilli()
	if version.VersionKind == AgentVersionKindDebug {
		if version.PublishedAt != nil {
			return ErrAgentDefinitionInvalid
		}
	} else {
		if version.PublishedAt == nil {
			now := version.CreatedAt
			version.PublishedAt = &now
		}
		if *version.PublishedAt <= 0 || *version.PublishedAt > agentDefinitionMaxInteger {
			return ErrAgentDefinitionInvalid
		}
	}
	return nil
}

func (*AgentVersion) BeforeUpdate(*gorm.DB) error { return ErrAgentVersionImmutable }
func (*AgentVersion) BeforeDelete(*gorm.DB) error { return ErrAgentVersionImmutable }

// CreateAgentDefinition checks logical parents in one short transaction. A
// pre-authorized scope is still required by its future service caller.
func CreateAgentDefinition(db *gorm.DB, definition *AgentDefinition) error {
	if db == nil || definition == nil {
		return ErrAgentDefinitionInvalid
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := lockAgentDefinitionParents(tx, definition.TeamID, definition.WorkspaceID, definition.CreatedBy); err != nil {
			return err
		}
		return tx.Create(definition).Error
	})
}

func agentDefinitionScopedQuery(db *gorm.DB, teamID, workspaceID int64) *gorm.DB {
	return db.Model(&AgentDefinition{}).
		Joins("JOIN ag_workspaces ON ag_workspaces.id = ag_agents.workspace_id AND ag_workspaces.team_id = ag_agents.team_id").
		Joins("JOIN teams ON teams.id = ag_agents.team_id").
		Joins("LEFT JOIN ag_agent_versions AS published ON published.id = ag_agents.current_version_id AND published.agent_id = ag_agents.id AND published.workspace_id = ag_agents.workspace_id AND published.team_id = ag_agents.team_id AND "+agentWorkspaceExactColumn(db, "published.version_kind")+" = ? AND published.published_at > 0", AgentVersionKindRelease).
		Where("ag_agents.team_id = ? AND ag_agents.workspace_id = ? AND (ag_agents.current_version_id IS NULL OR published.id IS NOT NULL)", teamID, workspaceID)
}

func GetAgentDefinition(db *gorm.DB, teamID, workspaceID, agentID int64) (*AgentDefinition, error) {
	if db == nil || teamID <= 0 || workspaceID <= 0 || agentID <= 0 {
		return nil, ErrAgentDefinitionInvalid
	}
	var definition AgentDefinition
	err := agentDefinitionScopedQuery(db, teamID, workspaceID).Select("ag_agents.*").Where("ag_agents.id = ?", agentID).Take(&definition).Error
	if err != nil {
		return nil, err
	}
	return &definition, nil
}

// ListAgentDefinitions reads bounded metadata, never the private draft JSON.
func ListAgentDefinitions(db *gorm.DB, teamID, workspaceID int64, offset, limit int) ([]AgentDefinition, error) {
	if db == nil || teamID <= 0 || workspaceID <= 0 || offset < 0 || offset > 10000 || limit < 1 || limit > 100 {
		return nil, ErrAgentDefinitionInvalid
	}
	items := make([]AgentDefinition, 0)
	err := agentDefinitionScopedQuery(db, teamID, workspaceID).
		Select("ag_agents.id, ag_agents.created_at, ag_agents.updated_at, ag_agents.revision, ag_agents.team_id, ag_agents.workspace_id, ag_agents.created_by, ag_agents.updated_by, ag_agents.archived_at, ag_agents.slug, ag_agents.name, ag_agents.description, ag_agents.tags_json, ag_agents.kind, ag_agents.status, ag_agents.draft_revision, ag_agents.draft_hash, ag_agents.next_version, ag_agents.current_version_id").
		Order("ag_agents.updated_at DESC, ag_agents.id DESC").Offset(offset).Limit(limit).Find(&items).Error
	return items, err
}

// UpdateAgentDefinitionDraft changes only draft content/version. Revision is
// reserved for metadata and publication pointers, not a replacement draft CAS.
func UpdateAgentDefinitionDraft(db *gorm.DB, teamID, workspaceID, agentID, actorID, expectedDraftRevision int64, draftJSON string) error {
	if db == nil || agentID <= 0 || expectedDraftRevision <= 0 || expectedDraftRevision >= agentDefinitionMaxInteger {
		return ErrAgentDefinitionInvalid
	}
	draft, err := canonicalAgentDefinitionObject(draftJSON, true)
	if err != nil {
		return err
	}
	hash := sha256.Sum256([]byte(draft))
	return db.Transaction(func(tx *gorm.DB) error {
		if err := lockAgentDefinitionParents(tx, teamID, workspaceID, actorID); err != nil {
			return err
		}
		var current AgentDefinition
		if err := lockForUpdate(tx).Where("team_id = ? AND workspace_id = ? AND id = ? AND archived_at IS NULL AND "+agentWorkspaceExactColumn(tx, "status")+" IN ?", teamID, workspaceID, agentID, []string{AgentDefinitionStatusActive, AgentDefinitionStatusDisabled}).Take(&current).Error; err != nil {
			return err
		}
		if current.DraftRevision != expectedDraftRevision {
			return ErrAgentDefinitionRevision
		}
		updated := tx.Session(&gorm.Session{SkipHooks: true}).Model(&AgentDefinition{}).
			Where("team_id = ? AND workspace_id = ? AND id = ? AND draft_revision = ?", teamID, workspaceID, agentID, expectedDraftRevision).
			Updates(map[string]any{"draft_json": draft, "draft_hash": hex.EncodeToString(hash[:]), "draft_revision": expectedDraftRevision + 1, "updated_at": max(time.Now().UnixMilli(), current.UpdatedAt), "updated_by": actorID})
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return ErrAgentDefinitionRevision
		}
		return nil
	})
}

// CreateAgentVersion appends a draft snapshot and advances the allocator. It
// never changes the public pointer or claims publish-time business validation.
func CreateAgentVersion(db *gorm.DB, version *AgentVersion) error {
	if db == nil || version == nil || version.AgentID <= 0 {
		return ErrAgentDefinitionInvalid
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := lockAgentDefinitionParents(tx, version.TeamID, version.WorkspaceID, version.CreatedBy); err != nil {
			return err
		}
		var definition AgentDefinition
		if err := lockForUpdate(tx).Where("team_id = ? AND workspace_id = ? AND id = ? AND archived_at IS NULL AND "+agentWorkspaceExactColumn(tx, "status")+" IN ?", version.TeamID, version.WorkspaceID, version.AgentID, []string{AgentDefinitionStatusActive, AgentDefinitionStatusDisabled}).Take(&definition).Error; err != nil {
			return err
		}
		if definition.NextVersion <= 0 || definition.NextVersion >= agentDefinitionMaxInteger || version.SourceDraftRevision != definition.DraftRevision || version.VersionNo != 0 && version.VersionNo != definition.NextVersion {
			return ErrAgentDefinitionRevision
		}
		version.VersionNo = definition.NextVersion
		if err := version.BeforeCreate(tx); err != nil {
			return err
		}
		if version.ConfigJSON != definition.DraftJSON || version.ConfigHash != definition.DraftHash {
			return ErrAgentDefinitionRevision
		}
		if err := tx.Create(version).Error; err != nil {
			return err
		}
		updated := tx.Session(&gorm.Session{SkipHooks: true}).Model(&AgentDefinition{}).
			Where("team_id = ? AND workspace_id = ? AND id = ? AND next_version = ? AND draft_revision = ?", definition.TeamID, definition.WorkspaceID, definition.ID, definition.NextVersion, definition.DraftRevision).
			Update("next_version", definition.NextVersion+1)
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return ErrAgentDefinitionRevision
		}
		return nil
	})
}

func agentVersionScopedQuery(db *gorm.DB, teamID, workspaceID, agentID int64) *gorm.DB {
	return db.Model(&AgentVersion{}).
		Joins("JOIN ag_agents ON ag_agents.id = ag_agent_versions.agent_id AND ag_agents.workspace_id = ag_agent_versions.workspace_id AND ag_agents.team_id = ag_agent_versions.team_id").
		Joins("JOIN ag_workspaces ON ag_workspaces.id = ag_agents.workspace_id AND ag_workspaces.team_id = ag_agents.team_id").
		Joins("JOIN teams ON teams.id = ag_agents.team_id").
		Where("ag_agent_versions.team_id = ? AND ag_agent_versions.workspace_id = ? AND ag_agent_versions.agent_id = ?", teamID, workspaceID, agentID)
}

func GetAgentVersion(db *gorm.DB, teamID, workspaceID, agentID, versionID int64) (*AgentVersion, error) {
	if db == nil || teamID <= 0 || workspaceID <= 0 || agentID <= 0 || versionID <= 0 {
		return nil, ErrAgentDefinitionInvalid
	}
	var version AgentVersion
	err := agentVersionScopedQuery(db, teamID, workspaceID, agentID).Select("ag_agent_versions.*").Where("ag_agent_versions.id = ?", versionID).Take(&version).Error
	if err != nil {
		return nil, err
	}
	return &version, nil
}

// Version metadata includes debug snapshots. Authorization and the public
// release-only view must be added explicitly by the future version service.
func ListAgentVersions(db *gorm.DB, teamID, workspaceID, agentID int64, offset, limit int) ([]AgentVersion, error) {
	if db == nil || teamID <= 0 || workspaceID <= 0 || agentID <= 0 || offset < 0 || offset > 10000 || limit < 1 || limit > 100 {
		return nil, ErrAgentDefinitionInvalid
	}
	items := make([]AgentVersion, 0)
	err := agentVersionScopedQuery(db, teamID, workspaceID, agentID).
		Select("ag_agent_versions.id, ag_agent_versions.created_at, ag_agent_versions.team_id, ag_agent_versions.workspace_id, ag_agent_versions.created_by, ag_agent_versions.agent_id, ag_agent_versions.version_no, ag_agent_versions.version_kind, ag_agent_versions.source_draft_revision, ag_agent_versions.schema_version, ag_agent_versions.config_hash, ag_agent_versions.release_note, ag_agent_versions.published_at, ag_agent_versions.revoked_at, ag_agent_versions.revoked_by, ag_agent_versions.revocation_reason").
		Order("ag_agent_versions.version_no DESC, ag_agent_versions.id DESC").Offset(offset).Limit(limit).Find(&items).Error
	return items, err
}

// SetAgentCurrentVersion accepts an actual same-Agent release, never an opaque
// caller-provided version ID. Future publication combines this storage helper
// with snapshot creation in one outer transaction and performs its own policy.
func SetAgentCurrentVersion(db *gorm.DB, teamID, workspaceID, agentID, versionID, actorID, expectedRevision int64) error {
	if db == nil || agentID <= 0 || versionID <= 0 || expectedRevision <= 0 || expectedRevision >= agentDefinitionMaxInteger {
		return ErrAgentDefinitionInvalid
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := lockAgentDefinitionParents(tx, teamID, workspaceID, actorID); err != nil {
			return err
		}
		var definition AgentDefinition
		if err := lockForUpdate(tx).Where("team_id = ? AND workspace_id = ? AND id = ? AND archived_at IS NULL AND "+agentWorkspaceExactColumn(tx, "status")+" IN ?", teamID, workspaceID, agentID, []string{AgentDefinitionStatusActive, AgentDefinitionStatusDisabled}).Take(&definition).Error; err != nil {
			return err
		}
		if definition.Revision != expectedRevision {
			return ErrAgentDefinitionRevision
		}
		var version AgentVersion
		if err := lockForUpdate(tx).Where("team_id = ? AND workspace_id = ? AND agent_id = ? AND id = ? AND "+agentWorkspaceExactColumn(tx, "version_kind")+" = ? AND published_at > 0 AND revoked_at IS NULL AND version_no < ?", teamID, workspaceID, agentID, versionID, AgentVersionKindRelease, definition.NextVersion).Take(&version).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAgentDefinitionReference
			}
			return err
		}
		updated := tx.Session(&gorm.Session{SkipHooks: true}).Model(&AgentDefinition{}).
			Where("team_id = ? AND workspace_id = ? AND id = ? AND revision = ?", teamID, workspaceID, agentID, expectedRevision).
			Updates(map[string]any{"current_version_id": version.ID, "revision": expectedRevision + 1, "updated_at": max(time.Now().UnixMilli(), definition.UpdatedAt), "updated_by": actorID})
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return ErrAgentDefinitionRevision
		}
		return nil
	})
}

func lockAgentDefinitionParents(tx *gorm.DB, teamID, workspaceID, actorID int64) error {
	if teamID <= 0 || workspaceID <= 0 || actorID <= 0 {
		return ErrAgentDefinitionInvalid
	}
	var team Team
	if err := lockForUpdate(tx).Select("id").Where("id = ?", teamID).Take(&team).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrAgentDefinitionReference
		}
		return err
	}
	var workspace AgentWorkspace
	if err := lockForUpdate(tx).Select("id", "status", "archived_at").Where("team_id = ? AND id = ?", teamID, workspaceID).Take(&workspace).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrAgentDefinitionReference
		}
		return err
	}
	if workspace.Status != AgentWorkspaceStatusActive || workspace.ArchivedAt != nil {
		return ErrAgentDefinitionReference
	}
	if err := validateAgentWorkspaceTeamUsers(tx, teamID, []int64{actorID}); err != nil {
		if errors.Is(err, ErrAgentWorkspaceReference) {
			return ErrAgentDefinitionReference
		}
		return err
	}
	return nil
}

func agentDefinitionTextValid(value string, maxCharacters, maxBytes int, empty bool) bool {
	return utf8.ValidString(value) && !strings.ContainsRune(value, 0) && len(value) <= maxBytes && utf8.RuneCountInString(value) <= maxCharacters && (empty || strings.TrimSpace(value) != "")
}

func canonicalAgentDefinitionObject(value string, configuration bool) (string, error) {
	if len(value) > 60*1024 {
		return "", ErrAgentDefinitionInvalid
	}
	fields, err := common.UnmarshalJSONObjectStrict([]byte(value))
	if err != nil {
		return "", ErrAgentDefinitionInvalid
	}
	if configuration && !bytes.Equal(bytes.TrimSpace(fields["schema_version"]), []byte("1")) {
		return "", ErrAgentDefinitionInvalid
	}
	canonical, err := canonicalAgentDefinitionJSON([]byte(value), 0)
	if err != nil || len(canonical) > 60*1024 {
		return "", ErrAgentDefinitionInvalid
	}
	return string(canonical), nil
}

// Canonical storage sorts object keys and normalizes strings while retaining
// numeric spelling, avoiding loss of precision before P02's semantic validator.
func canonicalAgentDefinitionJSON(raw []byte, depth int) ([]byte, error) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || len(raw) > 60*1024 || depth > 32 {
		return nil, ErrAgentDefinitionInvalid
	}
	switch raw[0] {
	case '{':
		fields, err := common.UnmarshalJSONObjectStrict(raw)
		if err != nil {
			return nil, err
		}
		for key, value := range fields {
			if strings.ContainsRune(key, 0) {
				return nil, ErrAgentDefinitionInvalid
			}
			canonical, err := canonicalAgentDefinitionJSON(value, depth+1)
			if err != nil {
				return nil, err
			}
			fields[key] = canonical
		}
		return common.Marshal(fields)
	case '[':
		var entries []common.RawMessage
		if err := common.Unmarshal(raw, &entries); err != nil {
			return nil, err
		}
		for index, value := range entries {
			canonical, err := canonicalAgentDefinitionJSON(value, depth+1)
			if err != nil {
				return nil, err
			}
			entries[index] = canonical
		}
		return common.Marshal(entries)
	case '"':
		var text string
		if err := common.Unmarshal(raw, &text); err != nil || strings.ContainsRune(text, 0) {
			return nil, ErrAgentDefinitionInvalid
		}
		return common.Marshal(text)
	default:
		return raw, nil
	}
}
