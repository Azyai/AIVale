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
