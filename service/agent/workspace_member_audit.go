package agent

import (
	"strconv"

	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

// recordWorkspaceMemberAudit records the persisted grant transition in the same transaction.
func recordWorkspaceMemberAudit(tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts, operation string, prior, member *model.AgentWorkspaceMember, requestID string) error {
	if facts == nil || facts.Workspace == nil || member == nil || member.ID <= 0 || member.TeamID != facts.TeamID || member.WorkspaceID != facts.Workspace.ID {
		return model.ErrAgentWorkspaceInvalid
	}
	payload := model.WorkspaceAuditPayload{
		SchemaVersion: 2, Operation: operation, RequestID: requestID,
		TargetUserID: strconv.FormatInt(member.UserID, 10), Role: member.Role, Revision: member.Revision,
	}
	if prior != nil {
		if prior.ID != member.ID || prior.TeamID != member.TeamID || prior.WorkspaceID != member.WorkspaceID || prior.UserID != member.UserID {
			return model.ErrAgentWorkspaceInvalid
		}
		payload.PreviousRevision, payload.PreviousRole = prior.Revision, prior.Role
	}
	if prior == nil || prior.Role != member.Role {
		payload.ChangedFields = append(payload.ChangedFields, "role")
	}
	if prior == nil || prior.Status != member.Status {
		payload.ChangedFields = append(payload.ChangedFields, "status")
	}
	return persistWorkspaceAudit(tx, facts, member.WorkspaceID, model.AgentOutboxKindWorkspaceMemberAudit, payload)
}
