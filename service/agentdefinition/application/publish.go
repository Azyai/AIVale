package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"reflect"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

type PublishInput struct {
	DraftRevision  int64
	ReleaseNote    string
	IdempotencyKey string
}

// PublishedVersion is the immutable receipt. It contains no editable content
// and does not grant permission to execute the version.
type PublishedVersion struct {
	ID                  int64
	AgentID             int64
	VersionNo           int64
	VersionKind         string
	SourceDraftRevision int64
	ConfigHash          string
	PublishedAt         int64
}

type PublishResult struct {
	Version              PublishedVersion
	IdempotencyExpiresAt int64
}

type PublicationDefinition struct {
	Draft            StoredDraft
	Status           string
	MetadataRevision int64
	NextVersion      int64
}

type PublicationReceipt struct {
	Version        PublishedVersion
	ExpiresAt      int64
	RequestMatches bool
}

// PublishRepository authorizes agent:publish against locked live management
// and workspace facts before invoking the transaction, including on retries.
type PublishRepository interface {
	WithPublishWorkspace(context.Context, int64, func(PublishWorkspaceTransaction) error) error
	GatewayLimits() GatewayLimits
}

// PublishWorkspaceTransaction freezes the exact locked draft and commits the
// version, pointer, receipt and audit together. A replay never changes a pointer.
type PublishWorkspaceTransaction interface {
	LockDefinition(agentID int64) (PublicationDefinition, error)
	FindReceipt(agentID int64, keyDigest, inputDigest string) (*PublicationReceipt, error)
	ReadPolicy(context.Context, string) (DraftPolicy, error)
	PublishDefinition(agentID, expectedDraftRevision int64, configJSON, inputSchemaJSON, outputSchemaJSON, releaseNote string) (PublishedVersion, error)
	SaveReceipt(agentID int64, keyDigest, inputDigest string, version PublishedVersion) (int64, error)
	AuditPublication(agentID, versionID, draftRevision, previousMetadataRevision, metadataRevision int64, requestID string) error
}

func Publish(ctx context.Context, workspaceID, agentID int64, input PublishInput, requestID string, repository PublishRepository) (PublishResult, error) {
	if ctx == nil || repository == nil {
		return PublishResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if err := ctx.Err(); err != nil {
		return PublishResult{}, agenttypes.NewError(agenttypes.InternalError, err)
	}
	if workspaceID <= 0 {
		return PublishResult{}, agenttypes.NewInvalidArgument("workspace_id", "Workspace ID must be positive")
	}
	if agentID <= 0 {
		return PublishResult{}, agenttypes.NewInvalidArgument("agent_id", "Agent ID must be positive")
	}
	if input.DraftRevision <= 0 || input.DraftRevision > agenttypes.MaxSafeInteger {
		return PublishResult{}, agenttypes.NewInvalidArgument("draft_revision", "Draft revision must be a positive safe JSON integer")
	}
	if !validDefinitionFilterText(input.ReleaseNote, 4096, 4096) {
		return PublishResult{}, agenttypes.NewInvalidArgument("release_note", "Release note must contain at most 4096 UTF-8 bytes")
	}
	if len(input.IdempotencyKey) < 16 || len(input.IdempotencyKey) > 128 {
		return PublishResult{}, agenttypes.NewInvalidArgument("idempotency_key", "Idempotency key must contain 16 to 128 visible ASCII characters")
	}
	for _, value := range []byte(input.IdempotencyKey) {
		if value < 0x21 || value > 0x7e {
			return PublishResult{}, agenttypes.NewInvalidArgument("idempotency_key", "Idempotency key must contain 16 to 128 visible ASCII characters")
		}
	}
	input.ReleaseNote = strings.TrimSpace(input.ReleaseNote)
	intent, err := common.Marshal(map[string]string{
		"draft_revision": strconv.FormatInt(input.DraftRevision, 10), "release_note": input.ReleaseNote,
	})
	if err != nil {
		return PublishResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	keySum, inputSum := sha256.Sum256([]byte(input.IdempotencyKey)), sha256.Sum256(intent)
	keyDigest, inputDigest := hex.EncodeToString(keySum[:]), hex.EncodeToString(inputSum[:])
	gateway := repository.GatewayLimits()
	var result PublishResult
	err = repository.WithPublishWorkspace(ctx, workspaceID, func(tx PublishWorkspaceTransaction) error {
		result = PublishResult{}
		definition, err := tx.LockDefinition(agentID)
		if err != nil {
			return err
		}
		receipt, err := tx.FindReceipt(agentID, keyDigest, inputDigest)
		if err != nil {
			return err
		}
		if receipt != nil {
			if !receipt.RequestMatches {
				return agenttypes.NewError(agenttypes.IdempotencyConflict, nil)
			}
			result = PublishResult{Version: receipt.Version, IdempotencyExpiresAt: receipt.ExpiresAt}
			return nil
		}
		if definition.Status != "active" {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		if definition.Draft.Revision <= 0 || definition.Draft.Revision > agenttypes.MaxSafeInteger ||
			definition.MetadataRevision <= 0 || definition.MetadataRevision > agenttypes.MaxSafeInteger ||
			definition.NextVersion <= 0 || definition.NextVersion > agenttypes.MaxSafeInteger {
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
		if definition.Draft.Revision != input.DraftRevision {
			return agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
		}
		if definition.MetadataRevision == agenttypes.MaxSafeInteger || definition.NextVersion == agenttypes.MaxSafeInteger {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		config, err := decodeStoredDraft(definition.Draft, gateway)
		if err != nil {
			return err
		}
		if config == nil {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		readPolicy := func(ctx context.Context, _ int64, modelName string) (DraftPolicy, error) {
			return tx.ReadPolicy(ctx, modelName)
		}
		validated, err := ValidateDraft(ctx, workspaceID, []byte(definition.Draft.Config), readPolicy, gateway)
		if err != nil {
			// The stored normalized form has already passed structural checks.
			// A now-tighter live policy must reject publication, not rewrite it.
			var controlled *agenttypes.Error
			if errors.As(err, &controlled) && controlled.Code() == agenttypes.InvalidArgument {
				return agenttypes.NewError(agenttypes.DependencyUnavailable, nil)
			}
			return err
		}
		if !reflect.DeepEqual(config, validated) {
			return agenttypes.NewError(agenttypes.DependencyUnavailable, nil)
		}
		version, err := tx.PublishDefinition(agentID, input.DraftRevision, definition.Draft.Config, string(config.InputSchema), string(config.OutputSchema), input.ReleaseNote)
		if err != nil {
			return err
		}
		expiresAt, err := tx.SaveReceipt(agentID, keyDigest, inputDigest, version)
		if err != nil {
			return err
		}
		if err := tx.AuditPublication(agentID, version.ID, input.DraftRevision, definition.MetadataRevision, definition.MetadataRevision+1, requestID); err != nil {
			return err
		}
		result = PublishResult{Version: version, IdempotencyExpiresAt: expiresAt}
		return nil
	})
	if err != nil {
		return PublishResult{}, err
	}
	return result, nil
}
