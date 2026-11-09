package application

import (
	"context"
	"errors"
	"reflect"
	"strings"

	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

type ValidationIssue struct {
	Path    string `json:"path"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ValidationReport struct {
	AgentID       int64
	DraftRevision int64
	Valid         bool
	Errors        []ValidationIssue
	Warnings      []ValidationIssue
}

type ModelOption struct {
	Model             string  `json:"model"`
	Available         bool    `json:"available"`
	UnavailableReason *string `json:"unavailable_reason"`
}

// EditorRepository binds the current management session and checks agent:write
// against locked workspace facts before serving either editor-only operation.
type EditorRepository interface {
	WithEditorWorkspace(context.Context, int64, func(EditorTransaction) error) error
	GatewayLimits() GatewayLimits
}

type EditorTransaction interface {
	LockDraft(int64) (StoredDraft, error)
	ReadDraftPolicy(context.Context, string) (DraftPolicy, error)
	ModelOptions(context.Context, string, int64, int) ([]ModelOption, int64, error)
}

func ValidateStoredDraft(ctx context.Context, workspaceID, agentID, draftRevision int64, repository EditorRepository) (ValidationReport, error) {
	if err := validateEditorInput(ctx, workspaceID, repository); err != nil {
		return ValidationReport{}, err
	}
	if agentID <= 0 {
		return ValidationReport{}, agenttypes.NewInvalidArgument("agent_id", "Agent ID must be positive")
	}
	if draftRevision <= 0 || draftRevision > agenttypes.MaxSafeInteger {
		return ValidationReport{}, agenttypes.NewInvalidArgument("draft_revision", "Draft revision must be a positive safe JSON integer")
	}
	var report ValidationReport
	err := repository.WithEditorWorkspace(ctx, workspaceID, func(tx EditorTransaction) error {
		report = ValidationReport{AgentID: agentID, DraftRevision: draftRevision, Errors: []ValidationIssue{}, Warnings: []ValidationIssue{}}
		draft, err := tx.LockDraft(agentID)
		if err != nil {
			return err
		}
		if draft.Revision <= 0 || draft.Revision > agenttypes.MaxSafeInteger {
			return agenttypes.NewError(agenttypes.InternalError, nil)
		}
		if draft.Revision != draftRevision {
			return agenttypes.NewError(agenttypes.DraftRevisionConflict, nil)
		}
		config, err := decodeStoredDraft(draft, repository.GatewayLimits())
		if err != nil {
			return err
		}
		if config == nil {
			report.Errors = append(report.Errors, ValidationIssue{Path: "config", Code: string(agenttypes.InvalidArgument), Message: "Save a complete configuration before validation"})
			return nil
		}
		readPolicy := func(ctx context.Context, _ int64, modelName string) (DraftPolicy, error) {
			return tx.ReadDraftPolicy(ctx, modelName)
		}
		validated, err := ValidateDraft(ctx, workspaceID, []byte(draft.Config), readPolicy, repository.GatewayLimits())
		if err != nil {
			var controlled *agenttypes.Error
			if !errors.As(err, &controlled) {
				return err
			}
			switch controlled.Code() {
			case agenttypes.InvalidArgument:
				for _, field := range controlled.PublicResponse("editor-validation").Data.FieldErrors {
					report.Errors = append(report.Errors, ValidationIssue{Path: field.Path, Code: string(agenttypes.InvalidArgument), Message: field.Message})
				}
				if len(report.Errors) == 0 {
					report.Errors = append(report.Errors, ValidationIssue{Path: "config", Code: string(agenttypes.InvalidArgument), Message: "The saved configuration is not permitted by current policy"})
				}
			case agenttypes.DependencyUnavailable:
				report.Errors = append(report.Errors, ValidationIssue{Path: "model_policy.model", Code: string(agenttypes.DependencyUnavailable), Message: "A required dependency is not available"})
			default:
				return err
			}
			return nil
		}
		if !reflect.DeepEqual(config, validated) {
			report.Errors = append(report.Errors, ValidationIssue{Path: "limits", Code: string(agenttypes.DependencyUnavailable), Message: "Saved limits no longer satisfy current workspace policy"})
			return nil
		}
		report.Valid = true
		return nil
	})
	if err != nil {
		return ValidationReport{}, err
	}
	return report, nil
}

func ListModelOptions(ctx context.Context, workspaceID int64, page agenttypes.PageQuery, query string, repository EditorRepository) (agenttypes.Page[ModelOption], error) {
	var empty agenttypes.Page[ModelOption]
	if err := validateEditorInput(ctx, workspaceID, repository); err != nil {
		return empty, err
	}
	if !validDefinitionFilterText(query, 128, 512) {
		return empty, agenttypes.NewInvalidArgument("q", "Model filter must contain at most 128 valid characters")
	}
	offset, err := page.Offset()
	if err != nil {
		return empty, err
	}
	var items []ModelOption
	var total int64
	err = repository.WithEditorWorkspace(ctx, workspaceID, func(tx EditorTransaction) error {
		var err error
		items, total, err = tx.ModelOptions(ctx, strings.TrimSpace(query), offset, page.PageSize())
		return err
	})
	if err != nil {
		return empty, err
	}
	return agenttypes.NewPage(items, total, page)
}

func validateEditorInput(ctx context.Context, workspaceID int64, repository EditorRepository) error {
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
