package agentdefinition

import (
	"context"
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
)

// Repository is a request-scoped adapter. The caller binds only the trusted
// management identity from the existing auth middleware.
type Repository struct {
	db       *gorm.DB
	identity model.AuthSessionIdentity
}

func New(db *gorm.DB, identity model.AuthSessionIdentity) *Repository {
	return &Repository{db: db, identity: identity}
}

var _ application.DefinitionReader = (*Repository)(nil)

func (repo *Repository) List(ctx context.Context, teamID, workspaceID int64, query application.DefinitionQuery) ([]application.DefinitionMetadata, int64, error) {
	if repo == nil || repo.db == nil || ctx == nil {
		return nil, 0, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	orders := make([]string, 0, len(query.Sort))
	for _, term := range query.Sort {
		// The model validates the final ordering against exact static clauses.
		orders = append(orders, "ag_agents."+string(term.Field)+" "+strings.ToUpper(string(term.Direction)))
	}
	records, total, err := model.ReadAgentDefinitionPage(repo.db.WithContext(ctx), repo.identity, teamID, workspaceID, model.AgentDefinitionReadFilters{
		Query: query.Query, Status: query.Status, Tag: query.Tag,
	}, query.Offset, query.Limit, orders)
	if err != nil {
		return nil, 0, agenttypes.NewError(agenttypes.InternalError, err)
	}
	items := make([]application.DefinitionMetadata, 0, len(records))
	for _, record := range records {
		item, err := metadata(record)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	return items, total, nil
}

func (repo *Repository) Get(ctx context.Context, teamID, workspaceID, agentID int64) (application.DefinitionMetadata, error) {
	if repo == nil || repo.db == nil || ctx == nil {
		return application.DefinitionMetadata{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	record, err := model.ReadAgentDefinitionMetadata(repo.db.WithContext(ctx), repo.identity, teamID, workspaceID, agentID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return application.DefinitionMetadata{}, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if err != nil {
		return application.DefinitionMetadata{}, agenttypes.NewError(agenttypes.InternalError, err)
	}
	return metadata(*record)
}

func metadata(record model.AgentDefinitionReadRecord) (application.DefinitionMetadata, error) {
	if record.ID <= 0 || record.CurrentVersionID != nil && *record.CurrentVersionID <= 0 ||
		record.CreatedAt < 0 || record.CreatedAt > agenttypes.MaxSafeInteger ||
		record.UpdatedAt < 0 || record.UpdatedAt > agenttypes.MaxSafeInteger ||
		record.Revision < 1 || record.Revision > agenttypes.MaxSafeInteger ||
		record.DraftRevision < 1 || record.DraftRevision > agenttypes.MaxSafeInteger {
		return application.DefinitionMetadata{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	var tags []string
	if err := common.UnmarshalJsonStr(record.TagsJSON, &tags); err != nil || tags == nil {
		return application.DefinitionMetadata{}, agenttypes.NewError(agenttypes.InternalError, err)
	}
	return application.DefinitionMetadata{
		ID: record.ID, Slug: record.Slug, Name: record.Name, Description: record.Description,
		Kind: record.Kind, Status: record.Status, Tags: tags, CreatedAt: record.CreatedAt, UpdatedAt: record.UpdatedAt,
		Revision: record.Revision, DraftRevision: record.DraftRevision, CurrentVersionID: record.CurrentVersionID,
	}, nil
}
