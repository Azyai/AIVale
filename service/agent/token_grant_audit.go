package agent

import (
	"strconv"

	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

func recordTokenGrantAudit(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts, operation string, grant *model.AgentTokenGrant, requestID, reasonHash string) error {
	if facts == nil || facts.Workspace == nil || grant == nil || grant.ID <= 0 || grant.TeamID != facts.TeamID || grant.WorkspaceID != facts.Workspace.ID ||
		grant.ResourceType != model.AgentTokenGrantResourceWorkspace || grant.ResourceID != grant.WorkspaceID {
		return model.ErrAgentWorkspaceInvalid
	}
	var changed []string
	switch {
	case operation == "token_grant.create" && grant.Status == model.AgentTokenGrantStatusActive && grant.RevokedAt == nil:
		changed = []string{"scope", "status"}
	case operation == "token_grant.revoke" && grant.Status == model.AgentTokenGrantStatusRevoked && grant.RevokedAt != nil:
		changed = []string{"status"}
	default:
		return model.ErrAgentWorkspaceInvalid
	}
	return persistWorkspaceAudit(tx, facts, grant.WorkspaceID, model.AgentOutboxKindTokenGrantAudit, model.WorkspaceAuditPayload{
		SchemaVersion: 3, Operation: operation, RequestID: requestID, TokenID: strconv.FormatInt(grant.TokenID, 10),
		GrantID: strconv.FormatInt(grant.ID, 10), GrantScope: grant.Scope, PreviousRevision: grant.Revision - 1, Revision: grant.Revision,
		ChangedFields: changed, ReasonHash: reasonHash,
	})
}

// recordTokenGrantRenewalAudit retains the prior authorization state even
// though the grant row is reused at a higher revision.
func recordTokenGrantRenewalAudit(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts, prior, next *model.AgentTokenGrant, requestID string) error {
	if facts == nil || facts.Workspace == nil || prior == nil || next == nil || next.ID <= 0 || prior.ID != next.ID ||
		next.TeamID != facts.TeamID || next.WorkspaceID != facts.Workspace.ID || prior.TeamID != next.TeamID || prior.WorkspaceID != next.WorkspaceID ||
		prior.TokenID != next.TokenID || prior.Scope != next.Scope || prior.ResourceType != next.ResourceType || prior.ResourceID != next.ResourceID ||
		next.ResourceType != model.AgentTokenGrantResourceWorkspace || next.ResourceID != next.WorkspaceID ||
		next.Status != model.AgentTokenGrantStatusActive || next.RevokedAt != nil || next.ExpiresAt == nil {
		return model.ErrAgentWorkspaceInvalid
	}
	return persistWorkspaceAudit(tx, facts, next.WorkspaceID, model.AgentOutboxKindTokenGrantRenewalAudit, model.WorkspaceAuditPayload{
		SchemaVersion: 4, Operation: "token_grant.renew", RequestID: requestID, TokenID: strconv.FormatInt(next.TokenID, 10),
		GrantID: strconv.FormatInt(next.ID, 10), GrantScope: next.Scope, PreviousRevision: prior.Revision, Revision: next.Revision,
		ChangedFields: []string{"expires_at", "status"}, PreviousGrantStatus: prior.Status, PreviousGrantExpiresAt: prior.ExpiresAt,
		PreviousGrantRevokedAt: prior.RevokedAt, GrantExpiresAt: next.ExpiresAt,
	})
}
