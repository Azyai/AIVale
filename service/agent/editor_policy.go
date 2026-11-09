package agent

import (
	"context"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
)

// AgentEditorModelGroups derives catalog scope from locked current user facts;
// the editor never supplies a routing group or a funding credential.
func AgentEditorModelGroups(facts *model.AgentWorkspaceWriteFacts) ([]string, error) {
	if err := AuthorizeLockedAgentDraft(facts); err != nil {
		return nil, err
	}
	group := facts.AgentModelGroup
	groups := make([]string, 0)
	if group == "" || group == "auto" || strings.TrimSpace(group) != group || !ratio_setting.ContainsGroupRatio(group) {
		return groups, nil
	}
	for usable := range service.GetUserUsableGroups(group) {
		if usable != "" && usable != "auto" && ratio_setting.ContainsGroupRatio(usable) {
			groups = append(groups, usable)
		}
	}
	slices.Sort(groups)
	return groups, nil
}

// AgentEditorModelsAvailable reuses the gateway's existing text compatibility
// and billing configuration rules without quoting, reserving or charging.
func AgentEditorModelsAvailable(ctx context.Context, tx *gorm.DB, facts *model.AgentWorkspaceWriteFacts, names, groups []string) (map[string]bool, error) {
	if ctx == nil || tx == nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if err := AuthorizeLockedAgentDraft(facts); err != nil {
		return nil, err
	}
	available, err := model.AgentConfigTextModelsAvailable(tx.WithContext(ctx), names, groups)
	if err != nil {
		return nil, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	for _, name := range names {
		available[name] = available[name] && hasAgentConfigBilling(name)
	}
	return available, nil
}
