package agentdefinition

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/agent"
	"github.com/QuantumNous/new-api/service/agentdefinition/application"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type VersionReadRepository struct {
	db       *gorm.DB
	identity model.AuthSessionIdentity
}

func NewVersionRepository(db *gorm.DB, identity model.AuthSessionIdentity) *VersionReadRepository {
	return &VersionReadRepository{db: db, identity: identity}
}

var _ application.VersionReader = (*VersionReadRepository)(nil)

func (repo *VersionReadRepository) GatewayLimits() application.GatewayLimits {
	return agent.AgentDraftGatewayLimits()
}

func (repo *VersionReadRepository) List(ctx context.Context, teamID, workspaceID, agentID int64, query application.VersionQuery) ([]application.VersionMetadata, int64, error) {
	if repo == nil || repo.db == nil || ctx == nil {
		return nil, 0, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	orders := make([]string, 0, len(query.Sort))
	for _, term := range query.Sort {
		orders = append(orders, "ag_agent_versions."+string(term.Field)+" "+strings.ToUpper(string(term.Direction)))
	}
	records, total, err := model.ReadAgentVersionPage(repo.db.WithContext(ctx), repo.identity, teamID, workspaceID, agentID, query.Offset, query.Limit, orders)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, 0, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if err != nil {
		return nil, 0, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	items := make([]application.VersionMetadata, 0, len(records))
	for _, record := range records {
		item, err := versionMetadata(record)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	return items, total, nil
}

func (repo *VersionReadRepository) Get(ctx context.Context, teamID, workspaceID, agentID, versionID int64) (application.VersionContent, error) {
	if repo == nil || repo.db == nil || ctx == nil {
		return application.VersionContent{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	record, err := model.ReadAgentVersionContent(repo.db.WithContext(ctx).Session(&gorm.Session{Logger: logger.Discard}), repo.identity, teamID, workspaceID, agentID, versionID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return application.VersionContent{}, agenttypes.NewError(agenttypes.ResourceNotFound, nil)
	}
	if err != nil {
		return application.VersionContent{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	metadata, err := versionMetadata(*record)
	if err != nil {
		return application.VersionContent{}, err
	}
	if record.SchemaVersion != 1 || !utf8.ValidString(record.ReleaseNote) || len(record.ReleaseNote) > 4096 || strings.ContainsRune(record.ReleaseNote, 0) ||
		model.VerifyAgentVersionSnapshot(record.ConfigJSON, record.InputSchemaJSON, record.OutputSchemaJSON, record.ConfigHash) != nil {
		return application.VersionContent{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return application.VersionContent{
		VersionMetadata: metadata,
		Configuration: application.StoredVersionConfiguration{
			ConfigJSON: record.ConfigJSON, ConfigHash: record.ConfigHash, InputSchemaJSON: record.InputSchemaJSON, OutputSchemaJSON: record.OutputSchemaJSON,
		},
		ReleaseNote: record.ReleaseNote,
	}, nil
}

func versionMetadata(record model.AgentVersionReadRecord) (application.VersionMetadata, error) {
	if record.ID <= 0 || record.AgentID <= 0 || record.CreatedBy <= 0 || record.VersionKind != model.AgentVersionKindRelease ||
		record.VersionNo <= 0 || record.VersionNo > agenttypes.MaxSafeInteger || record.SourceDraftRevision <= 0 || record.SourceDraftRevision > agenttypes.MaxSafeInteger ||
		record.PublishedAt == nil || *record.PublishedAt <= 0 || *record.PublishedAt > agenttypes.MaxSafeInteger ||
		record.RevokedAt != nil && (*record.RevokedAt <= 0 || *record.RevokedAt > agenttypes.MaxSafeInteger) ||
		len(record.ConfigHash) != 64 || strings.Trim(record.ConfigHash, "0123456789abcdef") != "" {
		return application.VersionMetadata{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return application.VersionMetadata{
		ID: record.ID, AgentID: record.AgentID, VersionNo: record.VersionNo, VersionKind: record.VersionKind,
		SourceDraftRevision: record.SourceDraftRevision, ConfigHash: record.ConfigHash,
		PublishedAt: *record.PublishedAt, RevokedAt: record.RevokedAt, PublishedBy: record.CreatedBy,
	}, nil
}
