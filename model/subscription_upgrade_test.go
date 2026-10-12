package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
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

func TestTeamSubscriptionPerMemberQuota(t *testing.T) {
	truncateTables(t)

	now := common.GetTimestamp()

	// 用户 + 团队 + 两名成员（owner 301 + member 302）
	for _, uid := range []int{301, 302, 303} {
		require.NoError(t, DB.Create(&User{Id: uid, Username: fmt.Sprintf("u%d", uid), AffCode: fmt.Sprintf("a%d", uid)}).Error)
	}
	team := &Team{Name: "T", OwnerUserId: 301, InviteCode: "T1"}
	require.NoError(t, DB.Create(team).Error)
	require.NoError(t, DB.Create(&TeamMember{TeamId: team.Id, UserId: 301, Role: TeamRoleOwner, JoinedAt: now}).Error)
	require.NoError(t, DB.Create(&TeamMember{TeamId: team.Id, UserId: 302, Role: TeamRoleMember, JoinedAt: now}).Error)

	plan := &SubscriptionPlan{
		Id: 9341, Title: "Team", Tier: "T1", TierLevel: 1,
		PlanType: SubscriptionPlanTypeTeam, TeamMinSeats: 2, TeamMaxSeats: 3,
		PriceAmount: 20, DurationUnit: SubscriptionDurationMonth, DurationValue: 1,
		TotalAmount: 5000, Enabled: true,
	}
	seedUpgradePlan(t, plan)

	// 购买（2 席位，2 名成员）→ 每人一行，额度 = 套餐额度（不乘席位数）
	first, err := CreateTeamSubscriptionFromPlanTx(DB, 301, plan, 2, "order")
	require.NoError(t, err)
	require.NotNil(t, first)

	var rows []UserSubscription
	require.NoError(t, DB.Where("team_id = ?", team.Id).Find(&rows).Error)
	assert.Len(t, rows, 2)
	for _, r := range rows {
		assert.Equal(t, int64(5000), r.AmountTotal)
		assert.Equal(t, 2, r.Seats)
		assert.Contains(t, []int{301, 302}, r.UserId)
	}

	// 新成员加入（席位 3 内）→ 自动分配相同额度
	require.NoError(t, DB.Create(&TeamMember{TeamId: team.Id, UserId: 303, Role: TeamRoleMember, JoinedAt: now}).Error)
	require.NoError(t, allocateTeamQuotaOnJoinTx(DB, team.Id, 303, now))
	var rows303 []UserSubscription
	require.NoError(t, DB.Where("team_id = ? AND user_id = ?", team.Id, 303).Find(&rows303).Error)
	assert.Len(t, rows303, 1)
	assert.Equal(t, int64(5000), rows303[0].AmountTotal)

	// 席位已满 → 加入被拒
	ok, err := teamSeatsAvailableTx(DB, team.Id, now)
	require.NoError(t, err)
	assert.False(t, ok)

	// 成员退出 → 其额度行被终止
	require.NoError(t, terminateTeamQuotaOnLeaveTx(DB, team.Id, 302, now))
	var rows302 []UserSubscription
	require.NoError(t, DB.Where("team_id = ? AND user_id = ?", team.Id, 302).Find(&rows302).Error)
	assert.Equal(t, "cancelled", rows302[0].Status)

	// 成员维度的预扣：只扣本人行
	_, err = PreConsumeTeamSubscription("team-per-member-1", team.Id, 301, 100)
	require.NoError(t, err)
	var row301 UserSubscription
	require.NoError(t, DB.Where("team_id = ? AND user_id = ?", team.Id, 301).First(&row301).Error)
	assert.Equal(t, int64(100), row301.AmountUsed)
	var row303b UserSubscription
	require.NoError(t, DB.Where("team_id = ? AND user_id = ?", team.Id, 303).First(&row303b).Error)
	assert.Equal(t, int64(0), row303b.AmountUsed)
}
