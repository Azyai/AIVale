package application

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"reflect"

	"github.com/QuantumNous/new-api/common"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

type VersionMetadata struct {
	ID                  int64
	AgentID             int64
	VersionNo           int64
	VersionKind         string
	SourceDraftRevision int64
	ConfigHash          string
	PublishedAt         int64
	RevokedAt           *int64
	PublishedBy         int64
}

type StoredVersionConfiguration struct {
	ConfigJSON       string
	ConfigHash       string
	InputSchemaJSON  string
	OutputSchemaJSON string
}

type VersionContent struct {
	VersionMetadata
	Configuration StoredVersionConfiguration
	ReleaseNote   string
}

type VersionDetail struct {
	VersionMetadata
	Config      *agenttypes.AgentConfig
	ReleaseNote string
}

type VersionQuery struct {
	Offset int64
	Limit  int
	Sort   []agenttypes.SortTerm
}

// Content=true requires explicit editor content rights, not metadata access.
type VersionReadAuthorizer func(context.Context, int64, bool) (DefinitionReadAccess, error)

type VersionReader interface {
	List(context.Context, int64, int64, int64, VersionQuery) ([]VersionMetadata, int64, error)
	Get(context.Context, int64, int64, int64, int64) (VersionContent, error)
	GatewayLimits() GatewayLimits
}

func ListVersions(ctx context.Context, workspaceID, agentID int64, page agenttypes.PageQuery, authorize VersionReadAuthorizer, reader VersionReader) (agenttypes.Page[VersionMetadata], error) {
	var empty agenttypes.Page[VersionMetadata]
	offset, err := page.Offset()
	if err != nil {
		return empty, err
	}
	access, err := authorizeVersionRead(ctx, workspaceID, agentID, false, authorize, reader)
	if err != nil {
		return empty, err
	}
	items, total, readErr := reader.List(ctx, access.TeamID, workspaceID, agentID, VersionQuery{Offset: offset, Limit: page.PageSize(), Sort: page.Sort()})
	if err := confirmVersionReadScope(ctx, workspaceID, false, access, authorize); err != nil {
		return empty, err
	}
	if readErr != nil {
		return empty, readErr
	}
	return agenttypes.NewPage(items, total, page)
}

func GetVersion(ctx context.Context, workspaceID, agentID, versionID int64, authorize VersionReadAuthorizer, reader VersionReader) (VersionDetail, error) {
	if versionID <= 0 {
		return VersionDetail{}, agenttypes.NewInvalidArgument("version_id", "Version ID must be positive")
	}
	access, err := authorizeVersionRead(ctx, workspaceID, agentID, true, authorize, reader)
	if err != nil {
		return VersionDetail{}, err
	}
	stored, readErr := reader.Get(ctx, access.TeamID, workspaceID, agentID, versionID)
	if err := confirmVersionReadScope(ctx, workspaceID, true, access, authorize); err != nil {
		return VersionDetail{}, err
	}
	if readErr != nil {
		return VersionDetail{}, readErr
	}
	config, err := DecodeVersionConfiguration(stored.Configuration, reader.GatewayLimits())
	if err != nil {
		return VersionDetail{}, err
	}
	return VersionDetail{VersionMetadata: stored.VersionMetadata, Config: config, ReleaseNote: stored.ReleaseNote}, nil
}

func authorizeVersionRead(ctx context.Context, workspaceID, agentID int64, content bool, authorize VersionReadAuthorizer, reader VersionReader) (DefinitionReadAccess, error) {
	if ctx == nil || authorize == nil || reader == nil {
		return DefinitionReadAccess{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if workspaceID <= 0 || agentID <= 0 {
		return DefinitionReadAccess{}, agenttypes.NewInvalidArgument("resource_id", "Workspace and Agent IDs must be positive")
	}
	if err := ctx.Err(); err != nil {
		return DefinitionReadAccess{}, agenttypes.NewError(agenttypes.InternalError, err)
	}
	access, err := authorize(ctx, workspaceID, content)
	if err != nil {
		return DefinitionReadAccess{}, err
	}
	if access.TeamID <= 0 {
		return DefinitionReadAccess{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return access, nil
}

func confirmVersionReadScope(ctx context.Context, workspaceID int64, content bool, initial DefinitionReadAccess, authorize VersionReadAuthorizer) error {
	if err := ctx.Err(); err != nil {
		return agenttypes.NewError(agenttypes.InternalError, err)
	}
	current, err := authorize(ctx, workspaceID, content)
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

// DecodeVersionConfiguration validates a saved snapshot independently of the
// current Agent name or model catalog. Restore and activation share this check.
func DecodeVersionConfiguration(stored StoredVersionConfiguration, gateway GatewayLimits) (*agenttypes.AgentConfig, error) {
	if gateway.ExceedsMaxOutputTokens == nil || len(stored.ConfigJSON) > agentConfigMaxBytes ||
		len(stored.InputSchemaJSON) > agentConfigMaxBytes || len(stored.OutputSchemaJSON) > agentConfigMaxBytes {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	digest := sha256.Sum256([]byte(stored.ConfigJSON))
	if hex.EncodeToString(digest[:]) != stored.ConfigHash {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	config, err := parseAgentConfig([]byte(stored.ConfigJSON), gateway.ExceedsMaxOutputTokens)
	if err != nil || config.Limits.MaxCostQuota == "" {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	for _, schema := range []struct {
		stored   string
		expected []byte
	}{{stored.InputSchemaJSON, config.InputSchema}, {stored.OutputSchemaJSON, config.OutputSchema}} {
		normalized, err := normalizeAgentConfigSchema([]byte(schema.stored))
		if err != nil || !bytes.Equal(normalized, schema.expected) {
			return nil, agenttypes.NewError(agenttypes.InternalError, nil)
		}
	}
	wire, err := common.Marshal(config)
	if err != nil || len(wire) > agentConfigMaxBytes {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	var raw, normalized map[string]any
	if common.UnmarshalJsonStr(stored.ConfigJSON, &raw) != nil || common.Unmarshal(wire, &normalized) != nil || !reflect.DeepEqual(raw, normalized) {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return config, nil
}
