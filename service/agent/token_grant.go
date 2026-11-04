package agent

import (
	"context"
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

const tokenGrantCreateOperation = "token_grant.create"

type TokenGrantView struct {
	ID           int64  `json:"-"`
	TokenID      int64  `json:"-"`
	Scope        string `json:"-"`
	ResourceType string `json:"-"`
	ResourceID   int64  `json:"-"`
	Status       string `json:"-"`
	ExpiresAt    *int64 `json:"-"`
	Revision     int64  `json:"-"`
	CreatedAt    int64  `json:"-"`
	UpdatedAt    int64  `json:"-"`
	RevokedAt    *int64 `json:"-"`
}

type CreateTokenGrantInput struct {
	TokenID        int64  `json:"-"`
	Scope          string `json:"-"`
	ResourceType   string `json:"-"`
	ResourceID     int64  `json:"-"`
	ExpiresAt      *int64 `json:"-"`
	IdempotencyKey string `json:"-"`
}

type CreateTokenGrantResult struct {
	Grant                TokenGrantView `json:"-"`
	HTTPStatus           int            `json:"-"`
	IdempotencyExpiresAt int64          `json:"-"`
}

// ListTokenGrants checks control of the requested Key before counting its grants.
func ListTokenGrants(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID, tokenID int64, page agenttypes.PageQuery) (agenttypes.Page[TokenGrantView], error) {
	var result agenttypes.Page[TokenGrantView]
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return result, err
	}
	if workspaceID <= 0 || tokenID <= 0 {
		return result, agenttypes.NewInvalidArgument("token_id", "Workspace and token IDs must be positive")
	}
	offset, err := page.Offset()
	if err != nil {
		return result, err
	}
	err = model.WithAgentWorkspaceWriteFacts(db.WithContext(ctx), identity, workspaceID, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) error {
		if _, err := requireTokenGrantManager(facts); err != nil {
			return err
		}
		if _, err := lockManagedGrantToken(tx, facts, tokenID); err != nil {
			return err
		}
		rows, total, err := model.AgentTokenGrantPage(tx, facts.TeamID, workspaceID, tokenID, offset, page.PageSize())
		if err != nil {
			return err
		}
		items := make([]TokenGrantView, 0, len(rows))
		for _, row := range rows {
			view, err := tokenGrantView(&row)
			if err != nil {
				return err
			}
			items = append(items, view)
		}
		result, err = agenttypes.NewPage(items, total, page)
		return err
	})
	if err != nil {
		return agenttypes.Page[TokenGrantView]{}, workspaceWriteError(err)
	}
	return result, nil
}

// CreateTokenGrant serializes tuple creation, the durable receipt and audit under
// the same workspace transaction. A revoked tuple cannot be reissued in P01.
func CreateTokenGrant(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID int64, input CreateTokenGrantInput, requestID string) (*CreateTokenGrantResult, error) {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return nil, err
	}
	if workspaceID <= 0 || input.TokenID <= 0 {
		return nil, agenttypes.NewInvalidArgument("token_id", "Workspace and token IDs must be positive")
	}
	if !model.ValidAgentTokenGrantScope(input.Scope) {
		return nil, agenttypes.NewInvalidArgument("scope", "Scope is not supported")
	}
	if input.ResourceType != model.AgentTokenGrantResourceWorkspace || input.ResourceID != workspaceID {
		return nil, agenttypes.NewInvalidArgument("resource_id", "Resource must match the current workspace")
	}
	if input.ExpiresAt != nil && (*input.ExpiresAt <= 0 || *input.ExpiresAt > agenttypes.MaxSafeInteger) {
		return nil, agenttypes.NewInvalidArgument("expires_at", "Expiry must be a positive safe Unix millisecond value")
	}
	if !workspaceWriteKeyValid(input.IdempotencyKey) {
		return nil, agenttypes.NewInvalidArgument("Idempotency-Key", "Idempotency key must contain 16 to 128 visible ASCII characters")
	}
	requestID = workspaceWriteRequestID(requestID)
	keyHash := workspaceWriteDigest(input.IdempotencyKey)
	var result *CreateTokenGrantResult
	var mutated bool
	err := model.WithAgentWorkspaceWriteFacts(db.WithContext(ctx), identity, workspaceID, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) error {
		result, mutated = nil, false
		role, err := requireTokenGrantManager(facts)
		if err != nil {
			return err
		}
		if facts.Workspace.Status != model.AgentWorkspaceStatusActive {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		token, err := lockManagedGrantToken(tx, facts, input.TokenID)
		if err != nil {
			return err
		}
		if err := requireGrantOwnerScope(tx, facts, token, role, input.Scope); err != nil {
			return err
		}
		actualPath := "/api/agent-platform/workspaces/" + strconv.FormatInt(workspaceID, 10) + "/token-grants"
		scopeHash, requestHash, err := workspaceWriteHashes(facts, tokenGrantCreateOperation, "POST", "/api/agent-platform/workspaces/:workspace_id/token-grants", actualPath, map[string]any{
			"token_id": strconv.FormatInt(input.TokenID, 10), "scope": input.Scope, "resource_type": input.ResourceType,
			"resource_id": strconv.FormatInt(input.ResourceID, 10), "expires_at": input.ExpiresAt,
		})
		if err != nil {
			return err
		}
		receipt, err := model.GetAgentIdempotencyKey(tx, facts.TeamID, scopeHash, keyHash)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if receipt != nil && receipt.RequestHash != requestHash {
			return agenttypes.NewError(agenttypes.IdempotencyConflict, nil)
		}
		now := time.Now()
		if token.Status != common.TokenStatusEnabled || token.ExpiredTime != -1 && token.ExpiredTime <= now.Unix() {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		grant, err := model.LockAgentTokenWorkspaceGrant(tx, facts.TeamID, workspaceID, input.TokenID, input.Scope)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if receipt != nil && grant == nil {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		status := http.StatusOK
		if grant == nil {
			if input.ExpiresAt != nil && *input.ExpiresAt <= time.Now().UnixMilli() {
				return agenttypes.NewInvalidArgument("expires_at", "Expiry must be in the future")
			}
			// Compare milliseconds to legacy seconds without multiplying a
			// potentially out-of-range value stored on the Key.
			if input.ExpiresAt != nil && token.ExpiredTime > 0 && (*input.ExpiresAt-1)/1000 >= token.ExpiredTime {
				return agenttypes.NewInvalidArgument("expires_at", "Expiry cannot exceed the token expiry")
			}
			grant = &model.AgentTokenGrant{TeamID: facts.TeamID, WorkspaceID: workspaceID, TokenID: input.TokenID,
				Scope: input.Scope, ResourceType: input.ResourceType, ResourceID: input.ResourceID,
				Status: model.AgentTokenGrantStatusActive, ExpiresAt: input.ExpiresAt, CreatedBy: facts.UserID}
			if err := tx.Create(grant).Error; err != nil {
				return err
			}
			mutated, status = true, http.StatusCreated
		}
		view, err := tokenGrantView(grant)
		if err != nil {
			return err
		}
		if view.Status != model.AgentTokenGrantStatusActive || !sameGrantExpiry(view.ExpiresAt, input.ExpiresAt) ||
			(view.ExpiresAt != nil && *view.ExpiresAt <= time.Now().UnixMilli()) {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		encoded, err := encodeTokenGrantReceipt(view)
		if err != nil {
			return err
		}
		if receipt != nil {
			if err := validateTokenGrantReceipt(receipt, facts, grant, encoded, now.UnixMilli()); err != nil {
				return err
			}
			result = &CreateTokenGrantResult{Grant: view, HTTPStatus: int(*receipt.ResponseStatus), IdempotencyExpiresAt: receipt.ExpiresAt}
			return nil
		}
		resourceType, receiptStatus := "token_grant", int32(status)
		receipt = &model.AgentIdempotencyKey{TeamID: facts.TeamID, WorkspaceID: workspaceID, ScopeHash: scopeHash, KeyHash: keyHash,
			RequestHash: requestHash, Operation: tokenGrantCreateOperation, State: "completed", ResourceType: &resourceType,
			ResourceID: &grant.ID, ResponseStatus: &receiptStatus, ResponseJSON: &encoded}
		if err := tx.Create(receipt).Error; err != nil {
			return err
		}
		if mutated {
			if err := recordTokenGrantAudit(tx, facts, tokenGrantCreateOperation, grant, requestID, ""); err != nil {
				return err
			}
		}
		result = &CreateTokenGrantResult{Grant: view, HTTPStatus: status, IdempotencyExpiresAt: receipt.ExpiresAt}
		return nil
	})
	if err != nil {
		return nil, workspaceWriteError(err)
	}
	if mutated {
		workspaceWriteProjectAudit(db, requestID)
	}
	return result, nil
}

// RevokeTokenGrant keeps a tombstone and records the hash of the explanation.
func RevokeTokenGrant(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID, grantID int64, reason, requestID string) (*TokenGrantView, error) {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return nil, err
	}
	if workspaceID <= 0 || grantID <= 0 {
		return nil, agenttypes.NewInvalidArgument("grant_id", "Workspace and grant IDs must be positive")
	}
	if len(reason) > 1024 || !utf8.ValidString(reason) || strings.ContainsRune(reason, 0) || strings.TrimSpace(reason) == "" {
		return nil, agenttypes.NewInvalidArgument("reason", "Reason must contain at most 1024 valid UTF-8 bytes")
	}
	reasonHash := workspaceWriteDigest(strings.TrimSpace(reason))
	requestID = workspaceWriteRequestID(requestID)
	var result *TokenGrantView
	var mutated bool
	err := model.WithAgentWorkspaceWriteFacts(db.WithContext(ctx), identity, workspaceID, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) error {
		result, mutated = nil, false
		if _, err := requireTokenGrantManager(facts); err != nil {
			return err
		}
		grant, err := model.LockAgentTokenGrantByID(tx, facts.TeamID, workspaceID, grantID)
		if err != nil {
			return err
		}
		if _, err := lockManagedGrantToken(tx, facts, grant.TokenID); err != nil {
			return err
		}
		view, err := tokenGrantView(grant)
		if err != nil {
			return err
		}
		if grant.Status == model.AgentTokenGrantStatusRevoked {
			result = &view
			return nil
		}
		now := max(grant.UpdatedAt, time.Now().UnixMilli())
		updated, err := model.RevokeAgentTokenGrant(tx, grant, facts.UserID, now)
		if err != nil {
			return err
		}
		if !updated {
			return agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
		}
		grant.Status, grant.RevokedAt, grant.UpdatedAt, grant.UpdatedBy = model.AgentTokenGrantStatusRevoked, &now, now, &facts.UserID
		grant.Revision++
		view, err = tokenGrantView(grant)
		if err != nil {
			return err
		}
		if err := recordTokenGrantAudit(tx, facts, "token_grant.revoke", grant, requestID, reasonHash); err != nil {
			return err
		}
		result, mutated = &view, true
		return nil
	})
	if err != nil {
		return nil, workspaceWriteError(err)
	}
	if mutated {
		workspaceWriteProjectAudit(db, requestID)
	}
	return result, nil
}

func requireTokenGrantManager(facts *model.AgentWorkspaceWriteFacts) (string, error) {
	if facts.ActorRole == common.RoleGuestUser {
		return "", agenttypes.NewError(agenttypes.AuthRequired, nil)
	}
	if facts.TeamID <= 0 || facts.TeamOwnerUserID <= 0 || facts.Workspace == nil || facts.Workspace.TeamID != facts.TeamID || facts.Workspace.ArchivedAt != nil ||
		(facts.Workspace.Status != model.AgentWorkspaceStatusActive && facts.Workspace.Status != model.AgentWorkspaceStatusSuspended) {
		return "", agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	role := ""
	if facts.UserID == facts.TeamOwnerUserID {
		if facts.TeamMemberRole == model.TeamRoleOwner {
			role = model.AgentWorkspaceRoleAdmin
		}
	} else if facts.TeamMemberRole == model.TeamRoleMember && facts.Member != nil && facts.Member.Status == model.AgentWorkspaceMemberStatusActive {
		role = facts.Member.Role
	}
	if WorkspacePermissionForRole(role, WorkspaceRead).Scope == WorkspaceScopeNone {
		return "", agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if WorkspacePermissionForRole(role, TokenGrantManage).Scope == WorkspaceScopeNone {
		return "", agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	return role, nil
}

func lockManagedGrantToken(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts, tokenID int64) (*model.Token, error) {
	token, err := model.LockAgentGrantManagementToken(tx, facts.TeamID, tokenID)
	if err != nil {
		return nil, err
	}
	if int64(token.Id) != tokenID || int64(token.TeamId) != facts.TeamID || token.UserId <= 0 ||
		(facts.UserID != facts.TeamOwnerUserID && int64(token.UserId) != facts.UserID) {
		return nil, gorm.ErrRecordNotFound
	}
	return token, nil
}

func requireGrantOwnerScope(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts, token *model.Token, actorRole, scope string) error {
	if !runTokenScopePermitted(actorRole, scope) {
		return agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	if int64(token.UserId) == facts.UserID {
		return nil // The actor's locked workspace facts are also the Key owner's.
	}
	member, err := model.LockAgentWorkspaceMemberTarget(tx, facts, int64(token.UserId))
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	if member == nil || member.Status != model.AgentWorkspaceMemberStatusActive || !runTokenScopePermitted(member.Role, scope) {
		return agenttypes.NewError(agenttypes.PermissionDenied, nil)
	}
	return nil
}

func tokenGrantView(grant *model.AgentTokenGrant) (TokenGrantView, error) {
	if grant.ID <= 0 || grant.TeamID <= 0 || grant.WorkspaceID <= 0 || grant.TokenID <= 0 || !model.ValidAgentTokenGrantScope(grant.Scope) ||
		grant.ResourceType != model.AgentTokenGrantResourceWorkspace || grant.ResourceID != grant.WorkspaceID ||
		grant.CreatedAt <= 0 || grant.UpdatedAt < grant.CreatedAt || grant.UpdatedAt > agenttypes.MaxSafeInteger ||
		(grant.ExpiresAt != nil && (*grant.ExpiresAt <= grant.CreatedAt || *grant.ExpiresAt > agenttypes.MaxSafeInteger)) ||
		(grant.Status != model.AgentTokenGrantStatusActive && grant.Status != model.AgentTokenGrantStatusRevoked) ||
		(grant.Status == model.AgentTokenGrantStatusActive && (grant.RevokedAt != nil || grant.Revision != 1)) ||
		(grant.Status == model.AgentTokenGrantStatusRevoked && (grant.RevokedAt == nil || *grant.RevokedAt != grant.UpdatedAt || grant.Revision != 2)) {
		return TokenGrantView{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return TokenGrantView{ID: grant.ID, TokenID: grant.TokenID, Scope: grant.Scope, ResourceType: grant.ResourceType, ResourceID: grant.ResourceID,
		Status: grant.Status, ExpiresAt: grant.ExpiresAt, Revision: grant.Revision, CreatedAt: grant.CreatedAt, UpdatedAt: grant.UpdatedAt, RevokedAt: grant.RevokedAt}, nil
}

func sameGrantExpiry(a, b *int64) bool {
	return a == nil && b == nil || a != nil && b != nil && *a == *b
}

func encodeTokenGrantReceipt(view TokenGrantView) (string, error) {
	encoded, err := common.Marshal(map[string]any{
		"id": strconv.FormatInt(view.ID, 10), "token_id": strconv.FormatInt(view.TokenID, 10), "scope": view.Scope,
		"resource_type": view.ResourceType, "resource_id": strconv.FormatInt(view.ResourceID, 10), "status": view.Status,
		"expires_at": view.ExpiresAt, "revision": view.Revision, "created_at": view.CreatedAt, "updated_at": view.UpdatedAt, "revoked_at": view.RevokedAt,
	})
	return string(encoded), err
}

func validateTokenGrantReceipt(receipt *model.AgentIdempotencyKey, facts *model.AgentWorkspaceWriteFacts, grant *model.AgentTokenGrant, encoded string, now int64) error {
	if receipt.State != "completed" || receipt.Operation != tokenGrantCreateOperation || receipt.TeamID != facts.TeamID || receipt.WorkspaceID != facts.Workspace.ID ||
		receipt.ResourceType == nil || *receipt.ResourceType != "token_grant" || receipt.ResourceID == nil || *receipt.ResourceID != grant.ID ||
		receipt.ResponseStatus == nil || (*receipt.ResponseStatus != http.StatusCreated && *receipt.ResponseStatus != http.StatusOK) ||
		receipt.ResponseJSON == nil || *receipt.ResponseJSON != encoded || receipt.ExpiresAt <= 0 || receipt.ExpiresAt > agenttypes.MaxSafeInteger {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if receipt.ExpiresAt <= now {
		return agenttypes.NewError(agenttypes.InvalidState, nil)
	}
	return nil
}
