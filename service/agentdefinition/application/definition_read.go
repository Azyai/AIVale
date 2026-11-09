package application

import (
	"context"
	"strings"
	"unicode/utf8"

	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

// DefinitionMetadata deliberately excludes draft content, hashes and storage
// identities. The HTTP adapter maps it to an explicit public response.
type DefinitionMetadata struct {
	ID                   int64    `json:"-"`
	CreatedAt            int64    `json:"-"`
	UpdatedAt            int64    `json:"-"`
	Revision             int64    `json:"-"`
	DraftRevision        int64    `json:"-"`
	CurrentVersionID     *int64   `json:"-"`
	Slug                 string   `json:"-"`
	Name                 string   `json:"-"`
	Description          string   `json:"-"`
	Kind                 string   `json:"-"`
	Status               string   `json:"-"`
	Tags                 []string `json:"-"`
	EffectivePermissions []string `json:"-"`
}

type DefinitionFilter struct {
	Query  string
	Status string
	Tag    string
}

type DefinitionQuery struct {
	DefinitionFilter
	Offset int64
	Limit  int
	Sort   []agenttypes.SortTerm
}

type DefinitionReadAccess struct {
	TeamID int64
}

// DefinitionReadAuthorizer binds a trusted editor or viewer session and checks
// live agent:read for every call. TeamID must come from current server facts.
type DefinitionReadAuthorizer func(context.Context, int64) (DefinitionReadAccess, error)

// DefinitionReader returns metadata only. Its implementation must also scope
// every data query to the requested workspace, team and current reader.
type DefinitionReader interface {
	List(context.Context, int64, int64, DefinitionQuery) ([]DefinitionMetadata, int64, error)
	Get(context.Context, int64, int64, int64) (DefinitionMetadata, error)
}

func ListDefinitions(ctx context.Context, workspaceID int64, page agenttypes.PageQuery, filter DefinitionFilter, authorize DefinitionReadAuthorizer, reader DefinitionReader) (agenttypes.Page[DefinitionMetadata], error) {
	var empty agenttypes.Page[DefinitionMetadata]
	offset, err := page.Offset()
	if err != nil {
		return empty, err
	}
	if !validDefinitionFilterText(filter.Query, 128, 512) {
		return empty, agenttypes.NewInvalidArgument("q", "Name filter must contain at most 128 valid characters")
	}
	switch filter.Status {
	case "", "active", "disabled", "archived":
	default:
		return empty, agenttypes.NewInvalidArgument("status", "Unsupported Agent status")
	}
	if filter.Tag != "" {
		tag := strings.TrimSpace(filter.Tag)
		if tag == "" || !validDefinitionFilterText(filter.Tag, 64, 256) {
			return empty, agenttypes.NewInvalidArgument("tag", "Tag filter must contain 1 to 64 valid characters")
		}
		filter.Tag = tag
	}
	filter.Query = strings.TrimSpace(filter.Query)
	access, err := authorizeDefinitionRead(ctx, workspaceID, authorize, reader)
	if err != nil {
		return empty, err
	}
	items, total, readErr := reader.List(ctx, access.TeamID, workspaceID, DefinitionQuery{
		DefinitionFilter: filter, Offset: offset, Limit: page.PageSize(), Sort: page.Sort(),
	})
	if err := confirmDefinitionReadScope(ctx, workspaceID, access, authorize); err != nil {
		return empty, err
	}
	if readErr != nil {
		return empty, readErr
	}
	for index := range items {
		items[index].EffectivePermissions = []string{"agent:read"}
	}
	return agenttypes.NewPage(items, total, page)
}

func GetDefinition(ctx context.Context, workspaceID, agentID int64, authorize DefinitionReadAuthorizer, reader DefinitionReader) (DefinitionMetadata, error) {
	if agentID <= 0 {
		return DefinitionMetadata{}, agenttypes.NewInvalidArgument("agent_id", "Agent ID must be positive")
	}
	access, err := authorizeDefinitionRead(ctx, workspaceID, authorize, reader)
	if err != nil {
		return DefinitionMetadata{}, err
	}
	item, readErr := reader.Get(ctx, access.TeamID, workspaceID, agentID)
	if err := confirmDefinitionReadScope(ctx, workspaceID, access, authorize); err != nil {
		return DefinitionMetadata{}, err
	}
	if readErr != nil {
		return DefinitionMetadata{}, readErr
	}
	item.EffectivePermissions = []string{"agent:read"}
	return item, nil
}

func validDefinitionFilterText(value string, maxCharacters, maxBytes int) bool {
	return len(value) <= maxBytes && utf8.ValidString(value) &&
		!strings.ContainsRune(value, 0) && utf8.RuneCountInString(value) <= maxCharacters
}

func authorizeDefinitionRead(ctx context.Context, workspaceID int64, authorize DefinitionReadAuthorizer, reader DefinitionReader) (DefinitionReadAccess, error) {
	if ctx == nil || authorize == nil || reader == nil {
		return DefinitionReadAccess{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if workspaceID <= 0 {
		return DefinitionReadAccess{}, agenttypes.NewInvalidArgument("workspace_id", "Workspace ID must be positive")
	}
	if err := ctx.Err(); err != nil {
		return DefinitionReadAccess{}, agenttypes.NewError(agenttypes.InternalError, err)
	}
	access, err := authorize(ctx, workspaceID)
	if err != nil {
		return DefinitionReadAccess{}, err
	}
	if access.TeamID <= 0 {
		return DefinitionReadAccess{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return access, nil
}

// A membership or session may change during a read. Never return rows or a
// COUNT from a scope that is no longer available to the current reader.
func confirmDefinitionReadScope(ctx context.Context, workspaceID int64, initial DefinitionReadAccess, authorize DefinitionReadAuthorizer) error {
	if err := ctx.Err(); err != nil {
		return agenttypes.NewError(agenttypes.InternalError, err)
	}
	current, err := authorize(ctx, workspaceID)
	if err != nil {
		return err
	}
	if current.TeamID != initial.TeamID {
		return agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if err := ctx.Err(); err != nil {
		return agenttypes.NewError(agenttypes.InternalError, err)
	}
	return nil
}
