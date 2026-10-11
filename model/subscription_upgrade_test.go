package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func seedUpgradePlan(t *testing.T, plan *SubscriptionPlan) {
	t.Helper()
	require.NoError(t, DB.Create(plan).Error)
}

func seedUpgradeSub(t *testing.T, sub *UserSubscription) {
	t.Helper()
	require.NoError(t, DB.Create(sub).Error)
}

func TestCreateUserSubscriptionFromPlanTxUpgradeOnly(t *testing.T) {
	truncateTables(t)

	now := GetDBTimestamp()

	lowPlan := &SubscriptionPlan{
		Id: 9301, Title: "Lite", Tier: "Lite", TierLevel: 1,
		PriceAmount: 5, DurationUnit: SubscriptionDurationMonth, DurationValue: 1,
		TotalAmount: 1000, Enabled: true,
	}
	highPlan := &SubscriptionPlan{
		Id: 9302, Title: "Pro", Tier: "Pro", TierLevel: 2,
		PriceAmount: 15, DurationUnit: SubscriptionDurationMonth, DurationValue: 1,
		TotalAmount: 3000, Enabled: true,
	}
	seedUpgradePlan(t, lowPlan)
	seedUpgradePlan(t, highPlan)

	// 1) 首购放行
	sub, err := CreateUserSubscriptionFromPlanTx(DB, 201, lowPlan, "order")
	require.NoError(t, err)
	require.NotNil(t, sub)
	assert.Equal(t, "active", sub.Status)

	// 2) 同档位重复购买 → 拒绝
	_, err = CreateUserSubscriptionFromPlanTx(DB, 201, lowPlan, "order")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "仅支持升级到更高档位")

	// 3) 低买高（升档）→ 放行且旧订阅立即 superseded
	sub2, err := CreateUserSubscriptionFromPlanTx(DB, 201, highPlan, "order")
	require.NoError(t, err)
	assert.Equal(t, "active", sub2.Status)

	var old UserSubscription
	require.NoError(t, DB.Where("id = ?", sub.Id).First(&old).Error)
	assert.Equal(t, "superseded", old.Status)
	assert.LessOrEqual(t, old.EndTime, now+5)

	// 4) 升级后再买相同高档 → 拒绝（单订阅）
	_, err = CreateUserSubscriptionFromPlanTx(DB, 201, highPlan, "order")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "仅支持升级到更高档位")

	// 5) 高买低（降级）→ 拒绝
	_, err = CreateUserSubscriptionFromPlanTx(DB, 201, lowPlan, "order")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "仅支持升级到更高档位")

	// 6) 管理员绑定不受限：可以再绑低档位
	adminSub, err := CreateUserSubscriptionFromPlanTx(DB, 201, lowPlan, "admin")
	require.NoError(t, err)
	assert.Equal(t, "active", adminSub.Status)
}

func TestGetPersonalUpgradeState(t *testing.T) {
	truncateTables(t)

	now := GetDBTimestamp()
	// 无订阅 → HasActive=false
	state, err := GetPersonalUpgradeState(202)
	require.NoError(t, err)
	assert.False(t, state.HasActive)
	assert.Equal(t, 0, state.MaxTierLevel)

	// 一份等级 2 的生效订阅
	plan := &SubscriptionPlan{
		Id: 9311, Title: "Pro", TierLevel: 2,
		DurationUnit: SubscriptionDurationMonth, DurationValue: 1, Enabled: true,
	}
	seedUpgradePlan(t, plan)
	seedUpgradeSub(t, &UserSubscription{
		Id: 9321, UserId: 202, PlanId: 9311, TeamId: 0,
		AmountTotal: 100, StartTime: now - 3600, EndTime: now + 86400,
		Status: "active",
	})

	state, err = GetPersonalUpgradeState(202)
	require.NoError(t, err)
	assert.True(t, state.HasActive)
	assert.Equal(t, 2, state.MaxTierLevel)

	// 团队订阅不计入个人范围
	teamPlan := &SubscriptionPlan{
		Id: 9312, Title: "Team", PlanType: SubscriptionPlanTypeTeam, TierLevel: 9,
		DurationUnit: SubscriptionDurationMonth, DurationValue: 1, Enabled: true,
	}
	seedUpgradePlan(t, teamPlan)
	seedUpgradeSub(t, &UserSubscription{
		Id: 9322, UserId: 202, PlanId: 9312, TeamId: 55,
		AmountTotal: 100, StartTime: now - 3600, EndTime: now + 86400,
		Status: "active",
	})
	state, err = GetPersonalUpgradeState(202)
	require.NoError(t, err)
	assert.Equal(t, 2, state.MaxTierLevel)
}
