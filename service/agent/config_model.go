package agent

import (
	"context"
	"errors"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type agentConfigPolicy struct {
	modelAvailable   bool
	defaultCostQuota int64
	maxCostQuota     int64
	maxRunSeconds    int32
}

// loadAgentConfigPolicy checks the current editor and workspace. The Team
// controls funding, while the existing gateway makes channel groups available
// to each user. At draft time there is no funding Key; Run admission must
// recheck that exact Key, its owner, model allowlist and funding separately.
func loadAgentConfigPolicy(ctx context.Context, db *gorm.DB, identity model.AuthSessionIdentity, workspaceID int64, modelName string) (agentConfigPolicy, error) {
	if err := validateWorkspaceSessionInput(ctx, db, identity); err != nil {
		return agentConfigPolicy{}, err
	}
	db = db.Session(&gorm.Session{Logger: logger.Discard})
	access, err := AuthorizeWorkspace(ctx, db, identity, workspaceID, AgentWrite)
	if err != nil {
		var public *agenttypes.Error
		if errors.As(err, &public) && public.Code() == agenttypes.InternalError {
			return agentConfigPolicy{}, agenttypes.NewError(agenttypes.InternalError, nil)
		}
		return agentConfigPolicy{}, err
	}
	policy := agentConfigPolicy{
		defaultCostQuota: access.defaultCostQuota,
		maxCostQuota:     access.maxCostQuota,
		maxRunSeconds:    access.maxRunSeconds,
	}
	if policy.defaultCostQuota < 0 || policy.maxCostQuota < policy.defaultCostQuota || policy.maxRunSeconds < 0 {
		return agentConfigPolicy{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	if access.modelGroup == "" || access.modelGroup == "auto" || strings.TrimSpace(access.modelGroup) != access.modelGroup || !ratio_setting.ContainsGroupRatio(access.modelGroup) ||
		modelName == "" || strings.TrimSpace(modelName) != modelName || !hasAgentConfigBilling(modelName) {
		return policy, nil
	}
	groups := []string{}
	for group := range service.GetUserUsableGroups(access.modelGroup) {
		if group != "" && group != "auto" && ratio_setting.ContainsGroupRatio(group) {
			groups = append(groups, group)
		}
	}
	policy.modelAvailable, err = model.AgentConfigTextModelAvailable(db.WithContext(ctx), modelName, groups)
	if err != nil {
		return agentConfigPolicy{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return policy, nil
}

// Match the gateway's pricing precedence without computing a quote or
// accepting its self-use fallback for models with no configured price.
func hasAgentConfigBilling(modelName string) bool {
	billingModel := ratio_setting.FormatMatchingModelName(modelName)
	if billing_setting.GetBillingMode(billingModel) == billing_setting.BillingModeTieredExpr {
		expression, configured := billing_setting.GetBillingExpr(billingModel)
		return configured && strings.TrimSpace(expression) != ""
	}
	valid := func(amount float64) bool {
		return amount >= 0 && !math.IsNaN(amount) && !math.IsInf(amount, 0)
	}
	if price, configured := ratio_setting.GetModelPrice(billingModel, false); configured {
		return valid(price)
	}
	if !ratio_setting.HasConfiguredModelRatio(billingModel) {
		return false
	}
	ratio, configured, _ := ratio_setting.GetModelRatio(billingModel)
	return configured && valid(ratio)
}
