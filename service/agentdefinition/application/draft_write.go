package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"reflect"
	"strings"

	"github.com/QuantumNous/new-api/common"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

type CreateDraftInput struct {
	Name           string
	Description    string
	Kind           string
	IdempotencyKey string
}

type UpdateDraftInput struct {
	ExpectedRevision int64
	Config           []byte
}

type DraftResult struct {
	AgentID              int64
	Revision             int64
	Config               *agenttypes.AgentConfig
	IdempotencyExpiresAt int64
}

type StoredDraft struct {
	Name     string
	Revision int64
	Config   string
	Pending  bool
}

type DraftCreateReceipt struct {
	AgentID        int64
	ExpiresAt      int64
	RequestMatches bool
}

type DraftAuditOperation string

const (
	DraftCreated DraftAuditOperation = "agent.create"
	DraftUpdated DraftAuditOperation = "agent.draft.update"
)

// DraftRepository must authorize the live management session and agent:write
// under the same workspace locks used by the callback, including on retry.
type DraftRepository interface {
	WithDraftWorkspace(context.Context, int64, func(DraftWorkspaceTransaction) error) error
	GatewayLimits() GatewayLimits
}

// DraftWorkspaceTransaction operates only on the authorized workspace. The
// adapter must commit all changes together or leave none of them behind.
type DraftWorkspaceTransaction interface {
	LockDraft(agentID int64) (StoredDraft, error)
	CreatePendingDraft(name, description string) (int64, error)
	FindCreateReceipt(keyDigest, inputDigest string) (*DraftCreateReceipt, error)
	SaveCreateReceipt(keyDigest, inputDigest string, agentID int64) (int64, error)
	ReplaceDraft(agentID, expectedRevision int64, config string) (int64, error)
	ReadDraftPolicy(context.Context, string) (DraftPolicy, error)
	AuditDraft(DraftAuditOperation, int64, int64, int64, string) error
}

func CreateDraft(ctx context.Context, workspaceID int64, input CreateDraftInput, requestID string, repository DraftRepository) (DraftResult, error) {
	if err := validateDraftWorkspace(ctx, workspaceID, repository); err != nil {
		return DraftResult{}, err
	}
	if !validDefinitionFilterText(input.Name, 128, 512) || strings.TrimSpace(input.Name) == "" {
		return DraftResult{}, agenttypes.NewInvalidArgument("name", "Name must contain 1 to 128 valid characters")
	}
	if !validDefinitionFilterText(input.Description, 4096, 4096) {
		return DraftResult{}, agenttypes.NewInvalidArgument("description", "Description must contain at most 4096 UTF-8 bytes")
	}
	if input.Kind != "single" {
		return DraftResult{}, agenttypes.NewInvalidArgument("kind", "Only the single Agent kind is supported")
	}
	if len(input.IdempotencyKey) < 16 || len(input.IdempotencyKey) > 128 {
		return DraftResult{}, agenttypes.NewInvalidArgument("Idempotency-Key", "Idempotency key must contain 16 to 128 visible ASCII characters")
	}
	for _, value := range []byte(input.IdempotencyKey) {
		if value < 0x21 || value > 0x7e {
			return DraftResult{}, agenttypes.NewInvalidArgument("Idempotency-Key", "Idempotency key must contain 16 to 128 visible ASCII characters")
		}
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	encoded, err := common.Marshal(map[string]string{"name": input.Name, "description": input.Description, "kind": input.Kind})
	if err != nil {
		return DraftResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	keySum, inputSum := sha256.Sum256([]byte(input.IdempotencyKey)), sha256.Sum256(encoded)
	keyDigest, inputDigest := hex.EncodeToString(keySum[:]), hex.EncodeToString(inputSum[:])
	var result DraftResult
	err = repository.WithDraftWorkspace(ctx, workspaceID, func(tx DraftWorkspaceTransaction) error {
		result = DraftResult{}
		receipt, err := tx.FindCreateReceipt(keyDigest, inputDigest)
		if err != nil {
			return err
		}
		if receipt != nil {
			if _, err := tx.LockDraft(receipt.AgentID); err != nil {
				return err
			}
			if !receipt.RequestMatches {
				return agenttypes.NewError(agenttypes.IdempotencyConflict, nil)
			}
			result = DraftResult{AgentID: receipt.AgentID, Revision: 1, IdempotencyExpiresAt: receipt.ExpiresAt}
			return nil
		}
		id, err := tx.CreatePendingDraft(input.Name, input.Description)
		if err != nil {
			return err
		}
		expiresAt, err := tx.SaveCreateReceipt(keyDigest, inputDigest, id)
		if err != nil {
			return err
		}
		if err := tx.AuditDraft(DraftCreated, id, 0, 1, requestID); err != nil {
			return err
		}
		result = DraftResult{AgentID: id, Revision: 1, IdempotencyExpiresAt: expiresAt}
		return nil
	})
	if err != nil {
		return DraftResult{}, err
	}
	return result, nil
}

func GetDraft(ctx context.Context, workspaceID, agentID int64, repository DraftRepository) (DraftResult, error) {
	if err := validateDraftWorkspace(ctx, workspaceID, repository); err != nil {
		return DraftResult{}, err
	}
	if agentID <= 0 {
		return DraftResult{}, agenttypes.NewInvalidArgument("agent_id", "Agent ID must be positive")
	}
	var result DraftResult
	err := repository.WithDraftWorkspace(ctx, workspaceID, func(tx DraftWorkspaceTransaction) error {
		result = DraftResult{}
		draft, err := tx.LockDraft(agentID)
		if err != nil {
			return err
		}
		if draft.Revision <= 0 || draft.Revision > agenttypes.MaxSafeInteger {
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
		config, err := decodeStoredDraft(draft, repository.GatewayLimits())
		if err != nil {
			return err
		}
		result = DraftResult{AgentID: agentID, Revision: draft.Revision, Config: config}
		return nil
	})
	if err != nil {
		return DraftResult{}, err
	}
	return result, nil
}

func UpdateDraft(ctx context.Context, workspaceID, agentID int64, input UpdateDraftInput, requestID string, repository DraftRepository) (DraftResult, error) {
	if err := validateDraftWorkspace(ctx, workspaceID, repository); err != nil {
		return DraftResult{}, err
	}
	if agentID <= 0 {
		return DraftResult{}, agenttypes.NewInvalidArgument("agent_id", "Agent ID must be positive")
	}
	if input.ExpectedRevision <= 0 || input.ExpectedRevision > agenttypes.MaxSafeInteger {
		return DraftResult{}, agenttypes.NewInvalidArgument("expected_revision", "Expected revision must be a positive safe JSON integer")
	}
	gateway := repository.GatewayLimits()
	var result DraftResult
	err := repository.WithDraftWorkspace(ctx, workspaceID, func(tx DraftWorkspaceTransaction) error {
		result = DraftResult{}
		draft, err := tx.LockDraft(agentID)
		if err != nil {
			return err
		}
		if draft.Revision <= 0 || draft.Revision > agenttypes.MaxSafeInteger {
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
		if draft.Revision != input.ExpectedRevision {
			return agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
		}
		if draft.Revision == agenttypes.MaxSafeInteger {
			return agenttypes.NewError(agenttypes.InvalidState, nil)
		}
		readPolicy := func(ctx context.Context, _ int64, modelName string) (DraftPolicy, error) {
			return tx.ReadDraftPolicy(ctx, modelName)
		}
		config, err := ValidateDraft(ctx, workspaceID, input.Config, readPolicy, gateway)
		if err != nil {
			return err
		}
		if config.Name != draft.Name {
			return agenttypes.NewInvalidArgument("config.name", "Config name must match the Agent name")
		}
		wire, err := common.Marshal(config)
		if err != nil {
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
		revision, err := tx.ReplaceDraft(agentID, input.ExpectedRevision, string(wire))
		if err != nil {
			return err
		}
		if revision != input.ExpectedRevision+1 {
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
		if err := tx.AuditDraft(DraftUpdated, agentID, input.ExpectedRevision, revision, requestID); err != nil {
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

func validateDraftWorkspace(ctx context.Context, workspaceID int64, repository DraftRepository) error {
	if ctx == nil || repository == nil {
		return agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if err := ctx.Err(); err != nil {
		return agenttypes.NewError(agenttypes.InternalError, err)
	}
	if workspaceID <= 0 {
		return agenttypes.NewInvalidArgument("workspace_id", "Workspace ID must be positive")
	}
	return nil
}

// decodeStoredDraft validates the normalized public form, independent of live
// model eligibility, so a retired model does not make the draft unreadable.
func decodeStoredDraft(draft StoredDraft, gateway GatewayLimits) (*agenttypes.AgentConfig, error) {
	if draft.Pending {
		if draft.Revision == 1 {
			return nil, nil
		}
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if gateway.ExceedsMaxOutputTokens == nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	config, err := parseAgentConfig([]byte(draft.Config), gateway.ExceedsMaxOutputTokens)
	if err != nil || config.Name != draft.Name || config.Limits.MaxCostQuota == "" {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	wire, err := common.Marshal(config)
	if err != nil || len(wire) > agentConfigMaxBytes {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	// Compare normalized JSON values rather than bytes: the storage codec
	// orders map keys, while the response codec uses typed struct field order.
	var stored, normalized map[string]any
	if common.UnmarshalJsonStr(draft.Config, &stored) != nil || common.Unmarshal(wire, &normalized) != nil || !reflect.DeepEqual(stored, normalized) {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return config, nil
}
