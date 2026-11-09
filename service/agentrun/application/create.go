// Package application owns the Run metadata foundation. It does not admit
// executable work, expose an HTTP handler, reserve funds or call a model.
package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

type CreateMetadataInput struct {
	VersionID      int64
	FundingTokenID int64
	InputJSON      []byte
	MetadataJSON   []byte
	IdempotencyKey string
}

type MetadataReference struct {
	AgentID        int64
	VersionID      int64
	FundingTokenID int64
}

// MetadataReceipt is an immutable creation receipt, not a live Run snapshot
// or a promise that the runtime has admitted this record for execution.
type MetadataReceipt struct {
	ID             int64
	AgentID        int64
	AgentVersionID int64
	Status         string
	Mode           string
	CreatedAt      int64
}

type MetadataResult struct {
	Run                  MetadataReceipt
	IdempotencyExpiresAt int64
}

type LockedRelease struct {
	InputSchema common.RawMessage
}

type MetadataReplay struct {
	Run            MetadataReceipt
	ExpiresAt      int64
	RequestMatches bool
}

// MetadataRepository must reauthorize a live management session and lock the
// parent resources and funding reference before invoking the transaction.
// The resource checks are for metadata only; RunCreate remains fail closed.
type MetadataRepository interface {
	WithMetadataWorkspace(context.Context, int64, MetadataReference, func(MetadataTransaction, LockedRelease) error) error
}

type MetadataTransaction interface {
	FindReceipt(keyDigest, intentDigest string) (*MetadataReplay, error)
	AppendRun(inputJSON, metadataJSON, intentDigest string) (MetadataReceipt, error)
	SaveReceipt(keyDigest, intentDigest string, receipt MetadataReceipt) (int64, error)
	AuditCreation(runID int64, requestID string) error
}

// CreateMetadata creates only an internal, metadata_only record. An explicit
// release is mandatory; a moving publication pointer is never part of intent.
func CreateMetadata(ctx context.Context, workspaceID, agentID int64, input CreateMetadataInput, requestID string, repository MetadataRepository) (MetadataResult, error) {
	if ctx == nil || repository == nil || ctx.Err() != nil {
		return MetadataResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	for _, field := range []struct {
		name string
		id   int64
	}{{"workspace_id", workspaceID}, {"agent_id", agentID}, {"version_id", input.VersionID}, {"funding_token_id", input.FundingTokenID}} {
		if field.id <= 0 {
			return MetadataResult{}, agenttypes.NewInvalidArgument(field.name, "A positive resource ID is required")
		}
	}
	if len(input.IdempotencyKey) < 16 || len(input.IdempotencyKey) > 128 {
		return MetadataResult{}, agenttypes.NewInvalidArgument("idempotency_key", "A 16 to 128 character visible ASCII key is required")
	}
	for _, value := range []byte(input.IdempotencyKey) {
		if value < 0x21 || value > 0x7e {
			return MetadataResult{}, agenttypes.NewInvalidArgument("idempotency_key", "A 16 to 128 character visible ASCII key is required")
		}
	}
	// Request IDs are server correlation, never caller-supplied resource identity.
	if requestID == "" || len(requestID) > 64 {
		return MetadataResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	for _, value := range []byte(requestID) {
		if !(value >= 'a' && value <= 'z' || value >= 'A' && value <= 'Z' || value >= '0' && value <= '9' || strings.ContainsRune("-_.:", rune(value))) {
			return MetadataResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
		}
	}
	inputObject, canonicalInput, err := normalizeRunObject(input.InputJSON, 60*1024)
	if err != nil {
		return MetadataResult{}, agenttypes.NewInvalidArgument("input", "Input must be a bounded, unambiguous JSON object")
	}
	metadata := input.MetadataJSON
	if len(metadata) == 0 {
		metadata = []byte(`{}`)
	}
	_, canonicalMetadata, err := normalizeRunObject(metadata, 4*1024)
	if err != nil || !runMetadataFieldsAllowed(canonicalMetadata) {
		return MetadataResult{}, agenttypes.NewInvalidArgument("metadata", "Metadata must be a bounded object without reserved authority fields")
	}
	intent, err := common.Marshal(map[string]any{
		"agent_id": strconv.FormatInt(agentID, 10), "agent_version_id": strconv.FormatInt(input.VersionID, 10),
		"funding_token_id": strconv.FormatInt(input.FundingTokenID, 10),
		"input":            common.RawMessage(canonicalInput), "metadata": common.RawMessage(canonicalMetadata),
		"mode": "production", "trigger_type": "manual", "admission": "metadata_only",
	})
	if err != nil {
		return MetadataResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	keyHash, intentHash := sha256.Sum256([]byte(input.IdempotencyKey)), sha256.Sum256(intent)
	keyDigest, intentDigest := hex.EncodeToString(keyHash[:]), hex.EncodeToString(intentHash[:])
	var result MetadataResult
	err = repository.WithMetadataWorkspace(ctx, workspaceID, MetadataReference{AgentID: agentID, VersionID: input.VersionID, FundingTokenID: input.FundingTokenID}, func(tx MetadataTransaction, release LockedRelease) error {
		result = MetadataResult{}
		replay, err := tx.FindReceipt(keyDigest, intentDigest)
		if err != nil {
			return err
		}
		if replay != nil {
			if !replay.RequestMatches {
				return agenttypes.NewError(agenttypes.IdempotencyConflict, nil)
			}
			result = MetadataResult{Run: replay.Run, IdempotencyExpiresAt: replay.ExpiresAt}
			return nil
		}
		if !runInputMatchesSchema(inputObject, release.InputSchema) {
			return agenttypes.NewInvalidArgument("input", "Input does not satisfy the fixed version schema")
		}
		receipt, err := tx.AppendRun(string(canonicalInput), string(canonicalMetadata), intentDigest)
		if err != nil {
			return err
		}
		expiresAt, err := tx.SaveReceipt(keyDigest, intentDigest, receipt)
		if err != nil {
			return err
		}
		if err := tx.AuditCreation(receipt.ID, requestID); err != nil {
			return err
		}
		result = MetadataResult{Run: receipt, IdempotencyExpiresAt: expiresAt}
		return nil
	})
	if err != nil {
		return MetadataResult{}, err
	}
	return result, nil
}
