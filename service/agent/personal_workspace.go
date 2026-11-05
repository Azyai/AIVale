package agent

import (
	"context"
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/model"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
)

func ReadPersonalWorkspace(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity) (*model.AgentPersonalWorkspace, error) {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return nil, err
	}
	workspace, err := model.ReadAgentPersonalWorkspace(db.WithContext(ctx), identity)
	if err != nil {
		return nil, workspaceWriteError(err)
	}
	if workspace != nil && !personalWorkspaceResultValid(workspace, identity) {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return workspace, nil
}

func SavePersonalWorkspace(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, name, description string, expectedRevision int64) (*model.AgentPersonalWorkspace, error) {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return nil, err
	}
	if !workspaceWriteNameValid(name) {
		return nil, agenttypes.NewInvalidArgument("name", "Name must contain 1 to 128 valid characters")
	}
	if !workspaceWriteDescriptionValid(description) {
		return nil, agenttypes.NewInvalidArgument("description", "Description must contain at most 4096 UTF-8 bytes")
	}
	if expectedRevision < 0 || expectedRevision > agenttypes.MaxSafeInteger {
		return nil, agenttypes.NewInvalidArgument("expected_revision", "Expected revision must be a nonnegative safe integer")
	}
	workspace, err := model.SaveAgentPersonalWorkspace(db.WithContext(ctx), identity, strings.TrimSpace(name), description, expectedRevision, agenttypes.MaxSafeInteger)
	if errors.Is(err, model.ErrAgentPersonalWorkspaceRevision) {
		return nil, agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
	}
	if err != nil {
		return nil, workspaceWriteError(err)
	}
	if !personalWorkspaceResultValid(workspace, identity) {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return workspace, nil
}

func personalWorkspaceResultValid(workspace *model.AgentPersonalWorkspace, identity model.AuthSessionIdentity) bool {
	return workspace != nil && workspace.OwnerUserID == int64(identity.UserID) &&
		workspace.Revision > 0 && workspace.Revision <= agenttypes.MaxSafeInteger &&
		workspace.UpdatedAt > 0 && workspace.UpdatedAt <= agenttypes.MaxSafeInteger &&
		workspaceWriteNameValid(workspace.Name) && workspaceWriteDescriptionValid(workspace.Description)
}
