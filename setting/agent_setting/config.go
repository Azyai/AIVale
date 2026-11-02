package agent_setting

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type Feature string

const (
	FeaturePlatform Feature = "platform"
	FeatureWorker   Feature = "worker"
	FeatureMCP      Feature = "mcp"
	FeatureSkills   Feature = "skills"
	FeatureScripts  Feature = "scripts"
)

const (
	optionPrefix = "agent_setting."
	enabledKey   = optionPrefix + "enabled"
	workerKey    = optionPrefix + "worker_enabled"
	mcpKey       = optionPrefix + "mcp_enabled"
	skillsKey    = optionPrefix + "skills_enabled"
	scriptsKey   = optionPrefix + "scripts_enabled"
)

// Capabilities contains effective switch values after applying dependencies.
type Capabilities struct {
	Enabled        bool `json:"enabled"`
	WorkerEnabled  bool `json:"worker_enabled"`
	MCPEnabled     bool `json:"mcp_enabled"`
	SkillsEnabled  bool `json:"skills_enabled"`
	ScriptsEnabled bool `json:"scripts_enabled"`
}

func DefaultOptions() map[string]string {
	return map[string]string{
		enabledKey: "false",
		workerKey:  "false",
		mcpKey:     "false",
		skillsKey:  "false",
		scriptsKey: "false",
	}
}

func IsOption(key string) bool {
	return strings.HasPrefix(key, optionPrefix)
}

func ValidateOption(key, value string) error {
	switch key {
	case enabledKey, workerKey, mcpKey, skillsKey, scriptsKey:
		if value != "true" && value != "false" {
			return errors.New("agent platform options must be true or false")
		}
		return nil
	default:
		return errors.New("unknown agent platform option")
	}
}

func Snapshot() Capabilities {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()

	enabled := common.OptionMap[enabledKey] == "true"
	skills := enabled && common.OptionMap[skillsKey] == "true"
	return Capabilities{
		Enabled:        enabled,
		WorkerEnabled:  enabled && common.OptionMap[workerKey] == "true",
		MCPEnabled:     enabled && common.OptionMap[mcpKey] == "true",
		SkillsEnabled:  skills,
		ScriptsEnabled: skills && common.OptionMap[scriptsKey] == "true",
	}
}

func (capabilities Capabilities) Allows(feature Feature) bool {
	switch feature {
	case FeaturePlatform:
		return capabilities.Enabled
	case FeatureWorker:
		return capabilities.WorkerEnabled
	case FeatureMCP:
		return capabilities.MCPEnabled
	case FeatureSkills:
		return capabilities.SkillsEnabled
	case FeatureScripts:
		return capabilities.ScriptsEnabled
	default:
		return false
	}
}

// CanClaimNewWork only gates new claims; disabling a switch does not cancel
// work that has already been admitted. A worker must check before each claim.
func CanClaimNewWork() bool {
	return Snapshot().WorkerEnabled
}
