package agent

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
)

type CreateWorkspaceInput struct {
	Name           string `json:"-"`
	Description    string `json:"-"`
	Slug           string `json:"-"`
	IdempotencyKey string `json:"-"`
}

type UpdateWorkspaceInput struct {
	Name             *string `json:"-"`
	Description      *string `json:"-"`
	ExpectedRevision int64   `json:"-"`
}

type ArchiveWorkspaceInput struct {
	Reason           string `json:"-"`
	IdempotencyKey   string `json:"-"`
	ExpectedRevision int64  `json:"-"`
}

// WriteWorkspaceResult 将不可变POST收据与编辑后的当前详情分开，均由DTO公开。
type WriteWorkspaceResult struct {
	ID                   int64          `json:"-"`
	Slug                 string         `json:"-"`
	Status               string         `json:"-"`
	Revision             int64          `json:"-"`
	CreatedAt            int64          `json:"-"`
	ArchivedAt           int64          `json:"-"`
	IdempotencyExpiresAt int64          `json:"-"`
	Workspace            *WorkspaceView `json:"-"`
}

type workspaceCreateReceipt struct {
	ID        string `json:"id"`
	Slug      string `json:"slug"`
	Status    string `json:"status"`
	Revision  int64  `json:"revision"`
	CreatedAt int64  `json:"created_at"`
}

type workspaceArchiveReceipt struct {
	ID               string `json:"id"`
	Status           string `json:"status"`
	Revision         int64  `json:"revision"`
	ArchivedAt       int64  `json:"archived_at"`
	BlockingRunCount int    `json:"blocking_run_count"`
}

// CreateWorkspace 原子建立空间、显式初始管理员、去重收据及审计事实。
func CreateWorkspace(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, input CreateWorkspaceInput, requestID string) (*WriteWorkspaceResult, error) {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return nil, err
	}
	if !workspaceWriteNameValid(input.Name) {
		return nil, agenttypes.NewInvalidArgument("name", "Name must contain 1 to 128 valid characters")
	}
	if !workspaceWriteDescriptionValid(input.Description) {
		return nil, agenttypes.NewInvalidArgument("description", "Description must contain at most 4096 UTF-8 bytes")
	}
	if input.Slug != "" && !workspaceWriteSlugValid(input.Slug) {
		return nil, agenttypes.NewInvalidArgument("slug", "Slug must use canonical lowercase ASCII characters")
	}
	if !workspaceWriteKeyValid(input.IdempotencyKey) {
		return nil, agenttypes.NewInvalidArgument("Idempotency-Key", "Idempotency key must contain 16 to 128 visible ASCII characters")
	}
	input.Name = strings.TrimSpace(input.Name)
	requestID = workspaceWriteRequestID(requestID)
	generatedSlug := input.Slug
	if generatedSlug == "" {
		var random [16]byte
		if _, err := rand.Read(random[:]); err != nil {
			return nil, agenttypes.NewError(agenttypes.InternalError, err)
		}
		generatedSlug = "ws-" + hex.EncodeToString(random[:])
	}
	var result *WriteWorkspaceResult
	err := model.WithAgentWorkspaceWriteFacts(db.WithContext(ctx), identity, 0, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) error {
		result = nil // every confirmed-rollback attempt constructs fresh model objects.
		if facts.TeamID <= 0 || facts.TeamOwnerUserID != facts.UserID || facts.TeamMemberRole != model.TeamRoleOwner {
			return agenttypes.NewError(agenttypes.PermissionDenied, nil)
		}
		scopeHash, requestHash, err := workspaceWriteHashes(facts, "workspace.create", "POST", "/api/agent-platform/workspaces", "", map[string]any{"name": input.Name, "description": input.Description, "slug": input.Slug})
		if err != nil {
			return err
		}
		stored, err := model.GetAgentIdempotencyKey(tx, facts.TeamID, scopeHash, workspaceWriteDigest(input.IdempotencyKey))
		if err == nil {
			if err := workspaceWriteStoredResultValid(stored, "workspace.create", requestHash, http.StatusCreated); err != nil {
				return err
			}
			if err := model.LockAgentWorkspaceWriteTarget(tx, facts, stored.WorkspaceID); err != nil {
				return err
			}
			if _, err := workspaceWriteRole(facts, false); err != nil {
				return err
			}
			var receipt workspaceCreateReceipt
			if err := workspaceWriteDecodeReceipt(*stored.ResponseJSON, []string{"id", "slug", "status", "revision", "created_at"}, &receipt); err != nil {
				return err
			}
			if receipt.ID != strconv.FormatInt(stored.WorkspaceID, 10) || receipt.Slug != facts.Workspace.Slug || !workspaceWriteSlugValid(receipt.Slug) || receipt.Status != model.AgentWorkspaceStatusActive || receipt.Revision != 1 || receipt.CreatedAt != facts.Workspace.CreatedAt || receipt.CreatedAt <= 0 || receipt.CreatedAt > agenttypes.MaxSafeInteger {
				return agenttypes.NewError(agenttypes.InternalError, nil)
			}
			result = &WriteWorkspaceResult{ID: stored.WorkspaceID, Slug: receipt.Slug, Status: receipt.Status, Revision: receipt.Revision, CreatedAt: receipt.CreatedAt, IdempotencyExpiresAt: stored.ExpiresAt}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		workspace := &model.AgentWorkspace{TeamID: facts.TeamID, Slug: generatedSlug, Name: input.Name, Description: input.Description,
			Status: model.AgentWorkspaceStatusActive, DefaultMemberRole: model.AgentWorkspaceRoleViewer, PolicyJSON: `{"schema_version":1}`, CreatedBy: facts.UserID}
		if err := tx.Create(workspace).Error; err != nil {
			return err
		}
		member := &model.AgentWorkspaceMember{TeamID: facts.TeamID, WorkspaceID: workspace.ID, UserID: facts.UserID,
			Role: model.AgentWorkspaceRoleAdmin, Status: model.AgentWorkspaceMemberStatusActive, GrantedBy: facts.UserID, CreatedBy: facts.UserID}
		if err := tx.Create(member).Error; err != nil {
			return err
		}
		receipt := workspaceCreateReceipt{ID: strconv.FormatInt(workspace.ID, 10), Slug: workspace.Slug, Status: workspace.Status, Revision: workspace.Revision, CreatedAt: workspace.CreatedAt}
		expires, err := workspaceWriteCompleteReceipt(tx, facts, workspace.ID, "workspace.create", scopeHash, requestHash, input.IdempotencyKey, http.StatusCreated, receipt)
		if err != nil {
			return err
		}
		if err := workspaceWriteAudit(tx, facts, workspace.ID, "workspace.create", 0, 1, requestID, []string{"name", "description", "slug", "status", "administrator"}, ""); err != nil {
			return err
		}
		result = &WriteWorkspaceResult{ID: workspace.ID, Slug: workspace.Slug, Status: workspace.Status, Revision: workspace.Revision, CreatedAt: workspace.CreatedAt, IdempotencyExpiresAt: expires}
		return nil
	})
	if err != nil {
		return nil, workspaceWriteError(err)
	}
	workspaceWriteProjectAudit(db, requestID)
	return result, nil
}

func UpdateWorkspace(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID int64, input UpdateWorkspaceInput, requestID string) (*WriteWorkspaceResult, error) {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return nil, err
	}
	if workspaceID <= 0 || input.ExpectedRevision < 1 || input.ExpectedRevision > agenttypes.MaxSafeInteger || (input.Name == nil && input.Description == nil) {
		return nil, agenttypes.NewInvalidArgument("request", "A positive workspace ID, revision and editable field are required")
	}
	if input.Name != nil && !workspaceWriteNameValid(*input.Name) {
		return nil, agenttypes.NewInvalidArgument("name", "Name must contain 1 to 128 valid characters")
	}
	if input.Description != nil && !workspaceWriteDescriptionValid(*input.Description) {
		return nil, agenttypes.NewInvalidArgument("description", "Description must contain at most 4096 UTF-8 bytes")
	}
	requestID = workspaceWriteRequestID(requestID)
	var result *WriteWorkspaceResult
	err := model.WithAgentWorkspaceWriteFacts(db.WithContext(ctx), identity, workspaceID, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) error {
		result = nil
		role, err := workspaceWriteRole(facts, false)
		if err != nil {
			return err
		}
		workspace := facts.Workspace
		if workspace.Revision != input.ExpectedRevision || workspace.Revision >= agenttypes.MaxSafeInteger {
			return agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
		}
		now := time.Now().UnixMilli()
		candidateName, candidateDescription := workspace.Name, workspace.Description
		if input.Name != nil {
			candidateName = strings.TrimSpace(*input.Name)
		}
		if input.Description != nil {
			candidateDescription = *input.Description
		}
		// Validate the complete eventual DTO while rollback is still possible.
		// A damaged unchanged column must not turn a committed edit into HTTP 500.
		if !workspaceWriteNameValid(candidateName) || !workspaceWriteDescriptionValid(candidateDescription) || !workspaceWriteSlugValid(workspace.Slug) ||
			workspace.CreatedAt < 0 || workspace.CreatedAt > agenttypes.MaxSafeInteger || now < 0 || now > agenttypes.MaxSafeInteger || workspace.Revision < 1 ||
			(workspace.Status != model.AgentWorkspaceStatusActive && workspace.Status != model.AgentWorkspaceStatusSuspended) {
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
		updates := map[string]any{"revision": workspace.Revision + 1, "updated_at": now, "updated_by": facts.UserID}
		changed := make([]string, 0, 2)
		if input.Name != nil {
			updates["name"] = strings.TrimSpace(*input.Name)
			changed = append(changed, "name")
		}
		if input.Description != nil {
			updates["description"] = *input.Description
			changed = append(changed, "description")
		}
		updated := tx.Model(&model.AgentWorkspace{}).Where("team_id = ? AND id = ? AND revision = ? AND status IN ? AND archived_at IS NULL", facts.TeamID, workspaceID, input.ExpectedRevision, []string{model.AgentWorkspaceStatusActive, model.AgentWorkspaceStatusSuspended}).Updates(updates)
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
		}
		if err := workspaceWriteAudit(tx, facts, workspaceID, "workspace.update", workspace.Revision, workspace.Revision+1, requestID, changed, ""); err != nil {
			return err
		}
		if input.Name != nil {
			workspace.Name = strings.TrimSpace(*input.Name)
		}
		if input.Description != nil {
			workspace.Description = *input.Description
		}
		workspace.Revision++
		workspace.UpdatedAt = now
		view := workspaceReadProjection(model.AgentWorkspaceReadRecord{ID: workspace.ID, TeamID: workspace.TeamID, Slug: workspace.Slug, Name: workspace.Name, Description: workspace.Description,
			Status: workspace.Status, CreatedAt: workspace.CreatedAt, UpdatedAt: workspace.UpdatedAt, Revision: workspace.Revision, Role: role})
		result = &WriteWorkspaceResult{ID: workspaceID, Status: workspace.Status, Revision: workspace.Revision, Workspace: &view}
		return nil
	})
	if err != nil {
		return nil, workspaceWriteError(err)
	}
	workspaceWriteProjectAudit(db, requestID)
	return result, nil
}

func ArchiveWorkspace(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID int64, input ArchiveWorkspaceInput, requestID string) (*WriteWorkspaceResult, error) {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return nil, err
	}
	if workspaceID <= 0 || input.ExpectedRevision < 1 || input.ExpectedRevision > agenttypes.MaxSafeInteger {
		return nil, agenttypes.NewInvalidArgument("expected_revision", "A positive workspace ID and safe revision are required")
	}
	if !utf8.ValidString(input.Reason) || strings.ContainsRune(input.Reason, 0) || len(input.Reason) > 2048 || utf8.RuneCountInString(input.Reason) > 512 || strings.TrimSpace(input.Reason) == "" {
		return nil, agenttypes.NewInvalidArgument("reason", "Reason must contain 1 to 512 valid characters")
	}
	if !workspaceWriteKeyValid(input.IdempotencyKey) {
		return nil, agenttypes.NewInvalidArgument("Idempotency-Key", "Idempotency key must contain 16 to 128 visible ASCII characters")
	}
	input.Reason = strings.TrimSpace(input.Reason)
	requestID = workspaceWriteRequestID(requestID)
	var result *WriteWorkspaceResult
	err := model.WithAgentWorkspaceWriteFacts(db.WithContext(ctx), identity, workspaceID, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) error {
		result = nil
		if _, err := workspaceWriteRole(facts, true); err != nil {
			return err
		}
		workspace := facts.Workspace
		actualPath := "/api/agent-platform/workspaces/" + strconv.FormatInt(workspaceID, 10) + "/archive"
		scopeHash, requestHash, err := workspaceWriteHashes(facts, "workspace.archive", "POST", "/api/agent-platform/workspaces/:workspace_id/archive", actualPath, map[string]any{"expected_revision": input.ExpectedRevision, "reason": input.Reason})
		if err != nil {
			return err
		}
		stored, err := model.GetAgentIdempotencyKey(tx, facts.TeamID, scopeHash, workspaceWriteDigest(input.IdempotencyKey))
		if err == nil {
			if err := workspaceWriteStoredResultValid(stored, "workspace.archive", requestHash, http.StatusOK); err != nil {
				return err
			}
			var receipt workspaceArchiveReceipt
			if err := workspaceWriteDecodeReceipt(*stored.ResponseJSON, []string{"id", "status", "revision", "archived_at", "blocking_run_count"}, &receipt); err != nil {
				return err
			}
			if stored.WorkspaceID != workspaceID || receipt.ID != strconv.FormatInt(workspaceID, 10) || receipt.Status != model.AgentWorkspaceStatusArchived || receipt.Revision < 2 || receipt.Revision > agenttypes.MaxSafeInteger || receipt.ArchivedAt <= 0 || receipt.ArchivedAt > agenttypes.MaxSafeInteger || receipt.BlockingRunCount != 0 ||
				workspace.Status != model.AgentWorkspaceStatusArchived || workspace.ArchivedAt == nil || receipt.ArchivedAt != *workspace.ArchivedAt || receipt.Revision != workspace.Revision {
				return agenttypes.NewError(agenttypes.InternalError, nil)
			}
			result = &WriteWorkspaceResult{ID: workspaceID, Status: receipt.Status, Revision: receipt.Revision, ArchivedAt: receipt.ArchivedAt, IdempotencyExpiresAt: stored.ExpiresAt}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if workspace.Status == model.AgentWorkspaceStatusArchived {
			return agenttypes.NewError(agenttypes.ResourceNotFound, nil)
		}
		if workspace.Revision != input.ExpectedRevision || workspace.Revision >= agenttypes.MaxSafeInteger {
			return agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
		}
		if workspace.ActiveRunCount < 0 {
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
		if workspace.ActiveRunCount > 0 {
			return agenttypes.NewError(agenttypes.ResourceInUse, nil)
		}
		available, err := model.AgentWorkspaceArchiveDependenciesAvailable(tx)
		if err != nil {
			return err
		}
		if !available {
			return agenttypes.NewError(agenttypes.RuntimeUnavailable, nil)
		}
		now := time.Now().UnixMilli()
		updated := tx.Model(&model.AgentWorkspace{}).Where("team_id = ? AND id = ? AND revision = ? AND status IN ? AND archived_at IS NULL AND active_run_count = 0", facts.TeamID, workspaceID, input.ExpectedRevision, []string{model.AgentWorkspaceStatusActive, model.AgentWorkspaceStatusSuspended}).
			Updates(map[string]any{"status": model.AgentWorkspaceStatusArchived, "archived_at": now, "updated_at": now, "updated_by": facts.UserID, "revision": workspace.Revision + 1})
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
		}
		receipt := workspaceArchiveReceipt{ID: strconv.FormatInt(workspaceID, 10), Status: model.AgentWorkspaceStatusArchived, Revision: workspace.Revision + 1, ArchivedAt: now}
		expires, err := workspaceWriteCompleteReceipt(tx, facts, workspaceID, "workspace.archive", scopeHash, requestHash, input.IdempotencyKey, http.StatusOK, receipt)
		if err != nil {
			return err
		}
		if err := workspaceWriteAudit(tx, facts, workspaceID, "workspace.archive", workspace.Revision, workspace.Revision+1, requestID, []string{"status"}, workspaceWriteDigest(input.Reason)); err != nil {
			return err
		}
		result = &WriteWorkspaceResult{ID: workspaceID, Status: receipt.Status, Revision: receipt.Revision, ArchivedAt: receipt.ArchivedAt, IdempotencyExpiresAt: expires}
		return nil
	})
	if err != nil {
		return nil, workspaceWriteError(err)
	}
	workspaceWriteProjectAudit(db, requestID)
	return result, nil
}

func workspaceWriteRole(facts *model.AgentWorkspaceWriteFacts, allowArchived bool) (string, error) {
	if facts.TeamID <= 0 || facts.TeamOwnerUserID <= 0 || facts.Workspace == nil || facts.Workspace.TeamID != facts.TeamID {
		return "", agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	workspace := facts.Workspace
	validStatus := workspace.ArchivedAt == nil && (workspace.Status == model.AgentWorkspaceStatusActive || workspace.Status == model.AgentWorkspaceStatusSuspended)
	if allowArchived && workspace.Status == model.AgentWorkspaceStatusArchived && workspace.ArchivedAt != nil && *workspace.ArchivedAt > 0 {
		validStatus = true
	}
	if !validStatus {
		return "", agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	role := ""
	if facts.TeamOwnerUserID == facts.UserID {
		if facts.TeamMemberRole == model.TeamRoleOwner {
			role = model.AgentWorkspaceRoleAdmin
		}
	} else if facts.TeamMemberRole == model.TeamRoleMember && facts.Member != nil && facts.Member.Status == model.AgentWorkspaceMemberStatusActive {
		role = facts.Member.Role
	}
	if WorkspacePermissionForRole(role, WorkspaceRead).Scope == WorkspaceScopeNone {
		return "", agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if WorkspacePermissionForRole(role, WorkspaceManage).Scope == WorkspaceScopeNone {
		return "", agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	return role, nil
}

func workspaceWriteHashes(facts *model.AgentWorkspaceWriteFacts, operation, method, route, target string, input any) (string, string, error) {
	if target == "" {
		target = route
	}
	scope := map[string]any{"schema_version": 1, "team_id": strconv.FormatInt(facts.TeamID, 10), "actor_id": strconv.FormatInt(facts.UserID, 10), "operation": operation, "method": method, "route": route}
	if operation != "workspace.create" {
		scope["workspace_id"] = strconv.FormatInt(facts.Workspace.ID, 10)
	}
	scopeBytes, err := common.Marshal(scope)
	if err != nil {
		return "", "", err
	}
	requestBytes, err := common.Marshal(map[string]any{"scope": scope, "target": target, "input": input})
	if err != nil {
		return "", "", err
	}
	return workspaceWriteDigest(string(scopeBytes)), workspaceWriteDigest(string(requestBytes)), nil
}

func workspaceWriteCompleteReceipt(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts, workspaceID int64, operation, scopeHash, requestHash, key string, status int32, receipt any) (int64, error) {
	encoded, err := common.Marshal(receipt)
	if err != nil {
		return 0, err
	}
	response, resourceType := string(encoded), "workspace"
	record := &model.AgentIdempotencyKey{TeamID: facts.TeamID, WorkspaceID: workspaceID, ScopeHash: scopeHash, KeyHash: workspaceWriteDigest(key), RequestHash: requestHash,
		Operation: operation, State: "completed", ResourceType: &resourceType, ResourceID: &workspaceID, ResponseStatus: &status, ResponseJSON: &response}
	if err := tx.Create(record).Error; err != nil {
		return 0, err
	}
	return record.ExpiresAt, nil
}

func workspaceWriteStoredResultValid(record *model.AgentIdempotencyKey, operation, requestHash string, status int32) error {
	if record.State != "completed" || record.Operation != operation || record.WorkspaceID <= 0 || record.ResourceType == nil || *record.ResourceType != "workspace" || record.ResourceID == nil || *record.ResourceID != record.WorkspaceID ||
		record.ResponseStatus == nil || *record.ResponseStatus != status || record.ResponseJSON == nil || len(*record.ResponseJSON) > 60*1024 || record.ExpiresAt <= 0 || record.ExpiresAt > agenttypes.MaxSafeInteger {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if record.RequestHash != requestHash {
		return agenttypes.NewError(agenttypes.IdempotencyConflict, nil)
	}
	return nil
}

func workspaceWriteDecodeReceipt(raw string, fields []string, result any) error {
	shape, err := common.UnmarshalJSONObjectStrict([]byte(raw))
	if err != nil || len(shape) != len(fields) {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	for _, field := range fields {
		if value, exists := shape[field]; !exists || string(value) == "null" {
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
	}
	if err := common.UnmarshalJsonStr(raw, result); err != nil {
		return agenttypes.NewError(agenttypes.InternalError, err)
	}
	return nil
}

func workspaceWriteAudit(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts, workspaceID int64, operation string, previous, revision int64, requestID string, changed []string, reasonHash string) error {
	var random [32]byte
	if _, err := rand.Read(random[:]); err != nil {
		return err
	}
	eventKey := hex.EncodeToString(random[:])
	payload := model.WorkspaceAuditPayload{SchemaVersion: 1, EventID: eventKey, ActorID: strconv.FormatInt(facts.UserID, 10), ActorRole: facts.ActorRole,
		TeamID: strconv.FormatInt(facts.TeamID, 10), WorkspaceID: strconv.FormatInt(workspaceID, 10), Operation: operation, PreviousRevision: previous, Revision: revision,
		RequestID: requestID, Timestamp: time.Now().UnixMilli(), ChangedFields: changed, ReasonHash: reasonHash}
	encoded, err := common.Marshal(payload)
	if err != nil {
		return err
	}
	return tx.Create(&model.AgentOutbox{TeamID: facts.TeamID, WorkspaceID: workspaceID, EventKey: eventKey, Kind: "workspace_audit", AggregateType: "workspace", AggregateID: workspaceID, PayloadJSON: string(encoded), Status: "pending"}).Error
}

func workspaceWriteProjectAudit(db *gorm.DB, requestID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if _, err := model.ProjectWorkspaceAudit(ctx, db, model.LOG_DB, 20); err != nil {
		common.SysError("Workspace audit projection pending: request_id=" + requestID)
	}
}

func workspaceWriteError(err error) error {
	var public *agenttypes.Error
	if errors.As(err, &public) {
		return public
	}
	if errors.Is(err, model.ErrUserSessionInactive) {
		return agenttypes.NewError(agenttypes.AuthRequired, nil)
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if model.AgentUniqueConstraint(err) {
		return agenttypes.NewError(agenttypes.ResourceInUse, nil)
	}
	return agenttypes.NewError(agenttypes.InternalError, err)
}

func workspaceWriteNameValid(value string) bool {
	return utf8.ValidString(value) && !strings.ContainsRune(value, 0) && len(value) <= 512 && utf8.RuneCountInString(value) <= 128 && strings.TrimSpace(value) != ""
}

func workspaceWriteDescriptionValid(value string) bool {
	return utf8.ValidString(value) && !strings.ContainsRune(value, 0) && len(value) <= 4096
}

func workspaceWriteSlugValid(value string) bool {
	if len(value) < 1 || len(value) > 64 {
		return false
	}
	for index, character := range []byte(value) {
		if (character < 'a' || character > 'z') && (character < '0' || character > '9') && (index == 0 || (character != '_' && character != '-')) {
			return false
		}
	}
	return true
}

func workspaceWriteKeyValid(value string) bool {
	if len(value) < 16 || len(value) > 128 {
		return false
	}
	for _, character := range []byte(value) {
		if character < 0x21 || character > 0x7e {
			return false
		}
	}
	return true
}

func workspaceWriteDigest(value string) string {
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:])
}

func workspaceWriteRequestID(value string) string {
	valid := len(value) > 0 && len(value) <= 64
	for _, character := range value {
		if (character < 'a' || character > 'z') && (character < 'A' || character > 'Z') && (character < '0' || character > '9') && !strings.ContainsRune("-_.:", character) {
			valid = false
		}
	}
	if !valid {
		return common.NewRequestId()
	}
	return value
}
