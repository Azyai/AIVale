package agent

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
)

const tokenGrantRenewOperation = "token_grant.renew"

type RenewTokenGrantInput struct {
	ExpectedRevision int64  `json:"-"`
	ExpiresAt        int64  `json:"-"`
	IdempotencyKey   string `json:"-"`
}

// RenewTokenGrant advances only a revoked or expired generation after current
// authorization and token eligibility checks. A receipt never authorizes a later generation.
func RenewTokenGrant(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID, grantID int64, input RenewTokenGrantInput, requestID string) (*CreateTokenGrantResult, error) {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return nil, err
	}
	if workspaceID <= 0 || grantID <= 0 {
		return nil, agenttypes.NewInvalidArgument("grant_id", "Workspace and grant IDs must be positive")
	}
	if input.ExpectedRevision <= 0 || input.ExpectedRevision > agenttypes.MaxSafeInteger {
		return nil, agenttypes.NewInvalidArgument("expected_revision", "Expected revision must be a positive safe integer")
	}
	if input.ExpiresAt <= 0 || input.ExpiresAt > agenttypes.MaxSafeInteger {
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
		prior, err := model.LockAgentTokenGrantByID(tx, facts.TeamID, workspaceID, grantID)
		if err != nil {
			return err
		}
		token, err := lockManagedGrantToken(tx, facts, prior.TokenID)
		if err != nil {
			return err
		}
		view, err := tokenGrantView(prior)
		if err != nil {
			return err
		}
		if err := requireGrantOwnerScope(tx, facts, token, role, prior.Scope); err != nil {
			return err
		}
		const route = "/api/agent-platform/workspaces/:workspace_id/token-grants/:grant_id/renew"
		target := "/api/agent-platform/workspaces/" + strconv.FormatInt(workspaceID, 10) + "/token-grants/" + strconv.FormatInt(grantID, 10) + "/renew"
		scopeHash, requestHash, err := workspaceWriteHashes(facts, tokenGrantRenewOperation, http.MethodPost, route, target, map[string]any{
			"expected_revision": input.ExpectedRevision, "expires_at": input.ExpiresAt,
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
		if !tokenGrantKeyEligible(token, now.Unix()) {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		if receipt != nil {
			if view.Status != model.AgentTokenGrantStatusActive || view.Revision-1 != input.ExpectedRevision || view.ExpiresAt == nil ||
				*view.ExpiresAt != input.ExpiresAt || *view.ExpiresAt <= now.UnixMilli() {
				return agenttypes.NewError(agenttypes.InvalidState, nil)
			}
			encoded, err := encodeTokenGrantReceipt(view)
			if err != nil {
				return err
			}
			if err := validateTokenGrantReceipt(receipt, facts, prior, tokenGrantRenewOperation, encoded, now.UnixMilli()); err != nil {
				return err
			}
			result = &CreateTokenGrantResult{Grant: view, HTTPStatus: http.StatusOK, IdempotencyExpiresAt: receipt.ExpiresAt}
			return nil
		}
		if view.Revision != input.ExpectedRevision {
			return agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
		}
		if view.Revision >= agenttypes.MaxSafeInteger || view.Status == model.AgentTokenGrantStatusActive &&
			(view.ExpiresAt == nil || *view.ExpiresAt > now.UnixMilli()) {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		updatedAt := max(view.UpdatedAt, now.UnixMilli())
		if input.ExpiresAt <= updatedAt {
			return agenttypes.NewInvalidArgument("expires_at", "Expiry must be in the future")
		}
		if token.ExpiredTime > 0 && (input.ExpiresAt-1)/1000 >= token.ExpiredTime {
			return agenttypes.NewInvalidArgument("expires_at", "Expiry cannot exceed the token expiry")
		}
		updated, err := model.RenewAgentTokenGrant(tx, prior, facts.UserID, now.UnixMilli(), updatedAt, input.ExpiresAt)
		if err != nil {
			return err
		}
		if !updated {
			return agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
		}
		next := *prior
		next.Status, next.Revision = model.AgentTokenGrantStatusActive, prior.Revision+1
		next.ExpiresAt, next.RevokedAt, next.UpdatedAt, next.UpdatedBy = &input.ExpiresAt, nil, updatedAt, &facts.UserID
		view, err = tokenGrantView(&next)
		if err != nil {
			return err
		}
		encoded, err := encodeTokenGrantReceipt(view)
		if err != nil {
			return err
		}
		resourceType, responseStatus := "token_grant", int32(http.StatusOK)
		receipt = &model.AgentIdempotencyKey{TeamID: facts.TeamID, WorkspaceID: workspaceID, ScopeHash: scopeHash, KeyHash: keyHash,
			RequestHash: requestHash, Operation: tokenGrantRenewOperation, State: "completed", ResourceType: &resourceType,
			ResourceID: &next.ID, ResponseStatus: &responseStatus, ResponseJSON: &encoded}
		if err := tx.Create(receipt).Error; err != nil {
			return err
		}
		if err := recordTokenGrantRenewalAudit(tx, facts, prior, &next, requestID); err != nil {
			return err
		}
		mutated = true
		result = &CreateTokenGrantResult{Grant: view, HTTPStatus: http.StatusOK, IdempotencyExpiresAt: receipt.ExpiresAt}
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

type TokenGrantPermissionView struct {
	Scope     string `json:"-"`
	GrantID   int64  `json:"-"`
	Revision  int64  `json:"-"`
	ExpiresAt *int64 `json:"-"`
}

type TokenGrantPermissionsView struct {
	TokenID int64                      `json:"-"`
	Scopes  []TokenGrantPermissionView `json:"-"`
}

// TokenGrantPermissions reports the current workspace-layer candidates. It
// does not authenticate the model Key, check request IP, or authorize a Run.
func TokenGrantPermissions(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID, tokenID int64) (*TokenGrantPermissionsView, error) {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return nil, err
	}
	if workspaceID <= 0 || tokenID <= 0 {
		return nil, agenttypes.NewInvalidArgument("token_id", "Workspace and token IDs must be positive")
	}
	result := &TokenGrantPermissionsView{TokenID: tokenID, Scopes: make([]TokenGrantPermissionView, 0)}
	err := model.WithAgentWorkspaceWriteFacts(db.WithContext(ctx), identity, workspaceID, func(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts) error {
		result.Scopes = result.Scopes[:0]
		role, err := requireTokenGrantManager(facts)
		if err != nil {
			return err
		}
		token, err := lockManagedGrantToken(tx, facts, tokenID)
		if err != nil {
			return err
		}
		if facts.Workspace.Status != model.AgentWorkspaceStatusActive || !tokenGrantKeyEligible(token, time.Now().Unix()) {
			return nil
		}
		ownerRole, err := tokenGrantOwnerRole(tx, facts, token, role)
		if err != nil {
			return err
		}
		rows, err := model.AgentActiveTokenGrantScopes(tx, facts.TeamID, workspaceID, tokenID)
		if err != nil {
			return err
		}
		now := time.Now()
		if !tokenGrantKeyEligible(token, now.Unix()) {
			return nil
		}
		for i := range rows {
			row := &rows[i]
			if !model.ValidAgentTokenGrantVersion(row.Status, row.Revision, row.CreatedAt, row.UpdatedAt, row.ExpiresAt, row.RevokedAt) ||
				row.ID <= 0 || row.Status != model.AgentTokenGrantStatusActive || !runTokenScopePermitted(ownerRole, row.Scope) ||
				(row.ExpiresAt != nil && *row.ExpiresAt <= now.UnixMilli()) {
				continue
			}
			result.Scopes = append(result.Scopes, TokenGrantPermissionView{Scope: row.Scope, GrantID: row.ID, Revision: row.Revision, ExpiresAt: row.ExpiresAt})
		}
		return nil
	})
	if err != nil {
		return nil, workspaceWriteError(err)
	}
	return result, nil
}

func tokenGrantKeyEligible(token *model.Token, nowSeconds int64) bool {
	return token.Status == common.TokenStatusEnabled && (token.ExpiredTime == -1 || token.ExpiredTime > nowSeconds) &&
		(token.UnlimitedQuota || token.RemainQuota > 0)
}
