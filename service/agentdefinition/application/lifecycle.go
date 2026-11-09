package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"reflect"
	"strings"

	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

type RestoreDraftInput struct {
	VersionID        int64
	ExpectedRevision int64
}

type ActivateVersionInput struct {
	VersionID        int64
	ExpectedRevision int64
	Reason           string
}

type SetStatusInput struct {
	ExpectedRevision int64
	Status           string
	Reason           string
}

type ArchiveDefinitionInput struct {
	ExpectedRevision int64
	Reason           string
}

type LifecycleResult struct {
	AgentID          int64
	Status           string
	Revision         int64
	CurrentVersionID *int64
	ArchivedAt       *int64
}

type LifecycleAction string

const (
	LifecycleRestore  LifecycleAction = "agent.restore_draft"
	LifecycleActivate LifecycleAction = "agent.activate_version"
	LifecycleStatus   LifecycleAction = "agent.status.update"
	LifecycleArchive  LifecycleAction = "agent.archive"
)

type LifecycleDefinition struct {
	Name             string
	Status           string
	MetadataRevision int64
	DraftRevision    int64
	CurrentVersionID *int64
}

type LifecycleVersion struct {
	ID      int64
	Revoked bool
	Config  StoredVersionConfiguration
}

// LifecycleRepository checks the requested action against live facts in the
// same workspace transaction as the change; it must not cache role decisions.
type LifecycleRepository interface {
	WithLifecycleWorkspace(context.Context, int64, LifecycleAction, func(LifecycleTransaction) error) error
	GatewayLimits() GatewayLimits
}

type LifecycleTransaction interface {
	LockDefinition(int64) (LifecycleDefinition, error)
	ReadVersion(int64) (LifecycleVersion, error)
	ReadPolicy(context.Context, string) (DraftPolicy, error)
	RestoreDraft(versionID, expectedDraftRevision int64) (int64, error)
	ActivateVersion(versionID, expectedRevision int64) (LifecycleResult, error)
	ChangeStatus(expectedRevision int64, status string) (LifecycleResult, error)
	Archive(expectedRevision int64) (LifecycleResult, error)
	ArchiveDependenciesAvailable() (bool, error)
	AuditLifecycle(LifecycleAction, int64, int64, int64, string, string, string, string) error
}

func RestoreDraft(ctx context.Context, workspaceID, agentID int64, input RestoreDraftInput, requestID string, repository LifecycleRepository) (DraftResult, error) {
	if err := validateLifecycleRequest(ctx, workspaceID, agentID, input.ExpectedRevision, repository); err != nil {
		return DraftResult{}, err
	}
	if input.VersionID <= 0 {
		return DraftResult{}, agenttypes.NewInvalidArgument("version_id", "Version ID must be positive")
	}
	var result DraftResult
	err := repository.WithLifecycleWorkspace(ctx, workspaceID, LifecycleRestore, func(tx LifecycleTransaction) error {
		result = DraftResult{}
		definition, err := tx.LockDefinition(agentID)
		if err != nil {
			return err
		}
		if definition.DraftRevision <= 0 || definition.DraftRevision > agenttypes.MaxSafeInteger {
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
		if definition.DraftRevision != input.ExpectedRevision {
			return agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
		}
		if definition.DraftRevision == agenttypes.MaxSafeInteger {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		version, err := tx.ReadVersion(input.VersionID)
		if err != nil {
			return err
		}
		if version.Revoked {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		config, err := DecodeVersionConfiguration(version.Config, repository.GatewayLimits())
		if err != nil {
			return err
		}
		if config.Name != definition.Name {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		revision, err := tx.RestoreDraft(input.VersionID, input.ExpectedRevision)
		if err != nil {
			return err
		}
		if revision != input.ExpectedRevision+1 {
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
		if err := tx.AuditLifecycle(LifecycleRestore, version.ID, input.ExpectedRevision, revision, definition.Status, definition.Status, "", requestID); err != nil {
			return err
		}
		result = DraftResult{AgentID: agentID, Revision: revision, Config: config}
		return nil
	})
	if err != nil {
		return DraftResult{}, err
	}
	return result, nil
}

func ActivateVersion(ctx context.Context, workspaceID, agentID int64, input ActivateVersionInput, requestID string, repository LifecycleRepository) (LifecycleResult, error) {
	if err := validateLifecycleRequest(ctx, workspaceID, agentID, input.ExpectedRevision, repository); err != nil {
		return LifecycleResult{}, err
	}
	if input.VersionID <= 0 {
		return LifecycleResult{}, agenttypes.NewInvalidArgument("version_id", "Version ID must be positive")
	}
	reasonHash, err := lifecycleReasonDigest(input.Reason)
	if err != nil {
		return LifecycleResult{}, err
	}
	var result LifecycleResult
	err = repository.WithLifecycleWorkspace(ctx, workspaceID, LifecycleActivate, func(tx LifecycleTransaction) error {
		result = LifecycleResult{}
		definition, err := tx.LockDefinition(agentID)
		if err != nil {
			return err
		}
		if err := checkLifecycleMetadataRevision(definition, input.ExpectedRevision); err != nil {
			return err
		}
		version, err := tx.ReadVersion(input.VersionID)
		if err != nil {
			return err
		}
		if version.Revoked {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		if err := validateLifecycleVersionPolicy(ctx, workspaceID, version, tx, repository.GatewayLimits()); err != nil {
			return err
		}
		result, err = tx.ActivateVersion(input.VersionID, input.ExpectedRevision)
		if err != nil {
			return err
		}
		return tx.AuditLifecycle(LifecycleActivate, version.ID, input.ExpectedRevision, result.Revision, definition.Status, result.Status, reasonHash, requestID)
	})
	if err != nil {
		return LifecycleResult{}, err
	}
	return result, nil
}

func SetStatus(ctx context.Context, workspaceID, agentID int64, input SetStatusInput, requestID string, repository LifecycleRepository) (LifecycleResult, error) {
	if err := validateLifecycleRequest(ctx, workspaceID, agentID, input.ExpectedRevision, repository); err != nil {
		return LifecycleResult{}, err
	}
	if input.Status != "active" && input.Status != "disabled" {
		return LifecycleResult{}, agenttypes.NewInvalidArgument("status", "Status must be active or disabled")
	}
	reasonHash, err := lifecycleReasonDigest(input.Reason)
	if err != nil {
		return LifecycleResult{}, err
	}
	var result LifecycleResult
	err = repository.WithLifecycleWorkspace(ctx, workspaceID, LifecycleStatus, func(tx LifecycleTransaction) error {
		result = LifecycleResult{}
		definition, err := tx.LockDefinition(agentID)
		if err != nil {
			return err
		}
		// An unchanged current state is observable without creating a mutation
		// or audit, but an old revision must never masquerade as a retry receipt.
		if definition.MetadataRevision <= 0 || definition.MetadataRevision > agenttypes.MaxSafeInteger {
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
		if definition.MetadataRevision != input.ExpectedRevision {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		if definition.Status == input.Status {
			result = LifecycleResult{AgentID: agentID, Status: definition.Status, Revision: definition.MetadataRevision, CurrentVersionID: definition.CurrentVersionID}
			return nil
		}
		if err := checkLifecycleMetadataRevision(definition, input.ExpectedRevision); err != nil {
			return err
		}
		versionID := int64(0)
		if definition.CurrentVersionID != nil {
			versionID = *definition.CurrentVersionID
		}
		if input.Status == "active" && versionID != 0 {
			version, err := tx.ReadVersion(versionID)
			if err != nil {
				return err
			}
			if version.Revoked {
				return agenttypes.NewError(agenttypes.InvalidState, nil)
			}
			if err := validateLifecycleVersionPolicy(ctx, workspaceID, version, tx, repository.GatewayLimits()); err != nil {
				return err
			}
		}
		result, err = tx.ChangeStatus(input.ExpectedRevision, input.Status)
		if err != nil {
			return err
		}
		return tx.AuditLifecycle(LifecycleStatus, versionID, input.ExpectedRevision, result.Revision, definition.Status, result.Status, reasonHash, requestID)
	})
	if err != nil {
		return LifecycleResult{}, err
	}
	return result, nil
}

func ArchiveDefinition(ctx context.Context, workspaceID, agentID int64, input ArchiveDefinitionInput, requestID string, repository LifecycleRepository) (LifecycleResult, error) {
	if err := validateLifecycleRequest(ctx, workspaceID, agentID, input.ExpectedRevision, repository); err != nil {
		return LifecycleResult{}, err
	}
	reasonHash, err := lifecycleReasonDigest(input.Reason)
	if err != nil {
		return LifecycleResult{}, err
	}
	var result LifecycleResult
	err = repository.WithLifecycleWorkspace(ctx, workspaceID, LifecycleArchive, func(tx LifecycleTransaction) error {
		result = LifecycleResult{}
		definition, err := tx.LockDefinition(agentID)
		if err != nil {
			return err
		}
		if err := checkLifecycleMetadataRevision(definition, input.ExpectedRevision); err != nil {
			return err
		}
		available, err := tx.ArchiveDependenciesAvailable()
		if err != nil {
			return err
		}
		if !available {
			return agenttypes.NewError(agenttypes.RuntimeUnavailable, nil)
		}
		result, err = tx.Archive(input.ExpectedRevision)
		if err != nil {
			return err
		}
		versionID := int64(0)
		if definition.CurrentVersionID != nil {
			versionID = *definition.CurrentVersionID
		}
		return tx.AuditLifecycle(LifecycleArchive, versionID, input.ExpectedRevision, result.Revision, definition.Status, result.Status, reasonHash, requestID)
	})
	if err != nil {
		return LifecycleResult{}, err
	}
	return result, nil
}

func validateLifecycleRequest(ctx context.Context, workspaceID, agentID, revision int64, repository LifecycleRepository) error {
	if ctx == nil || repository == nil {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if err := ctx.Err(); err != nil {
		return agenttypes.NewError(agenttypes.InternalError, err)
	}
	if workspaceID <= 0 {
		return agenttypes.NewInvalidArgument("workspace_id", "Workspace ID must be positive")
	}
	if agentID <= 0 {
		return agenttypes.NewInvalidArgument("agent_id", "Agent ID must be positive")
	}
	if revision <= 0 || revision > agenttypes.MaxSafeInteger {
		return agenttypes.NewInvalidArgument("expected_revision", "Expected revision must be a positive safe JSON integer")
	}
	return nil
}

func checkLifecycleMetadataRevision(definition LifecycleDefinition, expected int64) error {
	if definition.MetadataRevision <= 0 || definition.MetadataRevision > agenttypes.MaxSafeInteger ||
		definition.CurrentVersionID != nil && *definition.CurrentVersionID <= 0 {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if definition.MetadataRevision != expected || expected == agenttypes.MaxSafeInteger {
		return agenttypes.NewError(agenttypes.InvalidState, nil)
	}
	return nil
}

func lifecycleReasonDigest(reason string) (string, error) {
	if !validDefinitionFilterText(reason, 1024, 1024) || strings.TrimSpace(reason) == "" {
		return "", agenttypes.NewInvalidArgument("reason", "Reason must contain 1 to 1024 UTF-8 bytes")
	}
	digest := sha256.Sum256([]byte(strings.TrimSpace(reason)))
	return hex.EncodeToString(digest[:]), nil
}

func validateLifecycleVersionPolicy(ctx context.Context, workspaceID int64, version LifecycleVersion, tx LifecycleTransaction, gateway GatewayLimits) error {
	config, err := DecodeVersionConfiguration(version.Config, gateway)
	if err != nil {
		return err
	}
	readPolicy := func(ctx context.Context, _ int64, modelName string) (DraftPolicy, error) {
		return tx.ReadPolicy(ctx, modelName)
	}
	validated, err := ValidateDraft(ctx, workspaceID, []byte(version.Config.ConfigJSON), readPolicy, gateway)
	if err != nil {
		var controlled *agenttypes.Error
		if errors.As(err, &controlled) && controlled.Code() == agenttypes.InvalidArgument {
			return agenttypes.NewError(agenttypes.DependencyUnavailable, nil)
		}
		return err
	}
	if !reflect.DeepEqual(config, validated) {
		return agenttypes.NewError(agenttypes.DependencyUnavailable, nil)
	}
	return nil
}
