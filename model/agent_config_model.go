package model

import (
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"gorm.io/gorm"
)

// AgentConfigTextModelAvailable inspects live routing facts without calling a
// model or selecting channel credentials. groups must come from authorized
// current user policy, never directly from request parameters.
func AgentConfigTextModelAvailable(db *gorm.DB, modelName string, groups []string) (bool, error) {
	available, err := AgentConfigTextModelsAvailable(db, []string{modelName}, groups)
	return available[modelName], err
}

// AgentConfigTextModelsAvailable shares the same eligibility rules with the
// editor catalog, using two bounded queries for the selected page rather than
// querying routing and metadata again for each model.
func AgentConfigTextModelsAvailable(db *gorm.DB, modelNames, groups []string) (map[string]bool, error) {
	available := make(map[string]bool, len(modelNames))
	if db == nil {
		return nil, ErrAgentWorkspaceInvalid
	}
	if len(modelNames) == 0 || len(groups) == 0 {
		return available, nil
	}
	generation := jsplugin.DefaultRegistry.Generation()
	var candidates []struct {
		Model         string
		AbilityGroup  string
		Type          int
		Models        string
		Group         string
		ModelMapping  *string
		OtherSettings string
	}
	abilityGroup := db.Statement.Quote("abilities.group")
	channelGroup := db.Statement.Quote("channels.group")
	if err := db.Table("abilities").
		Select("abilities.model, "+abilityGroup+" AS ability_group, channels.type, channels.models, "+channelGroup+" AS "+db.Statement.Quote("group")+", channels.model_mapping, channels.settings AS other_settings").
		Joins("JOIN channels ON channels.id = abilities.channel_id").
		Where("abilities.model IN ? AND "+abilityGroup+" IN ? AND abilities.enabled = ? AND channels.status = ?", modelNames, groups, true, common.ChannelStatusEnabled).
		Scan(&candidates).Error; err != nil {
		return nil, err
	}
	var metadata []Model
	if len(candidates) == 0 {
		return available, nil
	}
	if err := db.Select("id", "model_name", "status", "name_rule", "endpoints").
		Where("(name_rule = ? AND model_name IN ?) OR name_rule IN ?", NameRuleExact, modelNames, []int{NameRulePrefix, NameRuleSuffix, NameRuleContains}).
		Order("id ASC").Find(&metadata).Error; err != nil {
		return nil, err
	}
	catalogs := resolveModelMetadata(metadata, modelNames)
	for _, row := range candidates {
		modelName := row.Model
		// SQL equality may fold case or trailing spaces, depending on the
		// engine. Verify the exact bound model and group before using any row.
		if modelName == "" || !slices.Contains(modelNames, modelName) || !slices.Contains(groups, row.AbilityGroup) || agentConfigKnownNonText(modelName) {
			continue
		}
		if _, task := generation.GetByModel(modelName); task {
			continue
		}
		var declared []constant.EndpointType
		if catalog := catalogs[modelName]; catalog != nil {
			if catalog.Status != 1 {
				continue
			}
			if strings.TrimSpace(catalog.Endpoints) != "" {
				declared = agentConfigCatalogEndpoints(catalog.Endpoints)
				if len(declared) == 0 {
					continue
				}
			}
		}
		channel := Channel{Type: row.Type, Models: row.Models, Group: row.Group}
		if !slices.Contains(channel.GetModels(), modelName) || !slices.Contains(channel.GetGroups(), row.AbilityGroup) {
			continue
		}
		if row.ModelMapping != nil && *row.ModelMapping != "" {
			var mapping map[string]string
			if err := common.UnmarshalJsonStr(*row.ModelMapping, &mapping); err != nil {
				continue
			}
			tail, cyclic := followChannelModelMapping(mapping, modelName)
			if _, task := generation.GetByModel(tail); cyclic || task || agentConfigKnownNonText(tail) {
				continue
			}
		}
		if slices.ContainsFunc(agentConfigChannelEndpoints(row.Type, modelName, row.OtherSettings), func(endpoint constant.EndpointType) bool {
			return agentConfigTextEndpoint(endpoint) && (declared == nil || slices.Contains(declared, endpoint))
		}) {
			available[modelName] = true
		}
	}
	return available, nil
}

func agentConfigCatalogEndpoints(raw string) []constant.EndpointType {
	if ValidateModelEndpoints(raw) != nil {
		return nil
	}
	var value any
	if common.UnmarshalJsonStr(raw, &value) != nil {
		return nil
	}
	var endpoints []constant.EndpointType
	switch metadata := value.(type) {
	case []any:
		for _, item := range metadata {
			endpoint := constant.EndpointType(item.(string)) // ValidateModelEndpoints checked the item type.
			if agentConfigTextEndpoint(endpoint) {
				endpoints = append(endpoints, endpoint)
			}
		}
	case map[string]any:
		for name, definition := range metadata {
			if details, ok := definition.(map[string]any); ok {
				if method, hasMethod := details["method"]; hasMethod && method != "POST" {
					continue
				}
			}
			endpoint := constant.EndpointType(name)
			if agentConfigTextEndpoint(endpoint) {
				endpoints = append(endpoints, endpoint)
			}
		}
	}
	return endpoints
}

func agentConfigTextEndpoint(endpoint constant.EndpointType) bool {
	switch endpoint {
	case constant.EndpointTypeOpenAI, constant.EndpointTypeOpenAIResponse, constant.EndpointTypeAnthropic, constant.EndpointTypeGemini:
		return true
	default:
		return false
	}
}

func agentConfigChannelEndpoints(channelType int, modelName, settings string) []constant.EndpointType {
	if _, known := constant.ChannelTypeNames[channelType]; !known || channelType == constant.ChannelTypeUnknown {
		return nil
	}
	switch channelType {
	case constant.ChannelTypeTaskPlugin, constant.ChannelTypeMidjourney, constant.ChannelTypeMidjourneyPlus,
		constant.ChannelTypeSunoAPI, constant.ChannelTypeKling, constant.ChannelTypeJimeng, constant.ChannelTypeVidu,
		constant.ChannelTypeDoubaoVideo, constant.ChannelTypeSora, constant.ChannelTypeReplicate, constant.ChannelTypeMokaAI:
		return nil
	case constant.ChannelTypeAdvancedCustom:
		// Channel.GetOtherSettings repairs malformed storage by writing it. An
		// eligibility read must instead reject the malformed candidate silently.
		var options dto.ChannelOtherSettings
		if common.UnmarshalJsonStr(settings, &options) != nil || options.AdvancedCustom == nil {
			return nil
		}
		return options.AdvancedCustom.SupportedEndpointTypesForModel(modelName)
	default:
		return common.GetEndpointTypesByChannelType(channelType, modelName)
	}
}

// The gateway's default channel type fallback alone also labels native audio
// and embedding model IDs as OpenAI. Exclude known specialised families when
// the catalog has no explicit protocol declaration, including mapped names.
func agentConfigKnownNonText(name string) bool {
	name = strings.ToLower(name)
	if slash := strings.LastIndexByte(name, '/'); slash >= 0 {
		name = name[slash+1:]
	}
	if common.IsImageGenerationModel(name) || name == "swap_face" {
		return true
	}
	for _, prefix := range [...]string{
		"whisper-", "tts-", "sora-", "veo-", "suno_", "mj_", "sensevoice",
		"bge-", "m3e-", "tao-8k", "embed-", "nomic-embed-", "jina-clip-",
	} {
		if strings.HasPrefix(name, prefix) {
			return true
		}
	}
	for _, marker := range [...]string{"embedding", "rerank", "-tts", "-transcribe", "-video", "-realtime", "native-audio", "-audio-preview"} {
		if strings.Contains(name, marker) {
			return true
		}
	}
	return false
}
