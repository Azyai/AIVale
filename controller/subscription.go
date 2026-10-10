package controller

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ---- Shared types ----

type SubscriptionPlanDTO struct {
	Plan model.SubscriptionPlan `json:"plan"`
}

type BillingPreferenceRequest struct {
	BillingPreference string `json:"billing_preference"`
}

type SubscriptionBalancePayRequest struct {
	PlanId int `json:"plan_id"`
	// Seats applies to team plans only; personal plans ignore it.
	Seats int `json:"seats"`
}

// resolveSubscriptionPurchase normalizes the seat count for a plan purchase
// and computes the charged money (price × seats for team plans). It also
// rejects buyers who are only a member of someone else's team (they should
// ask their team owner to purchase). Returns an error message on failure.
func resolveSubscriptionPurchase(userId int, plan *model.SubscriptionPlan, seats int) (int, float64, string) {
	if model.NormalizePlanType(plan.PlanType) != model.SubscriptionPlanTypeTeam {
		return 1, plan.PriceAmount, ""
	}
	if seats < 1 {
		seats = plan.TeamMinSeats
	}
	if seats < 1 {
		seats = 1
	}
	if plan.TeamMinSeats > 1 && seats < plan.TeamMinSeats {
		return 0, 0, fmt.Sprintf("团队套餐至少需要 %d 个席位", plan.TeamMinSeats)
	}
	if plan.TeamMaxSeats > 0 && seats > plan.TeamMaxSeats {
		return 0, 0, fmt.Sprintf("团队套餐最多支持 %d 个席位", plan.TeamMaxSeats)
	}
	if team, _, err := model.GetUserTeam(userId); err == nil && team != nil && team.OwnerUserId != userId {
		return 0, 0, "您已是其他团队的成员，请让团队所有者购买或先退出当前团队"
	}
	return seats, plan.PriceAmount * float64(seats), ""
}

// ---- User APIs ----

func GetSubscriptionPlans(c *gin.Context) {
	if !operation_setting.IsPaymentComplianceConfirmed() {
		common.ApiSuccess(c, []SubscriptionPlanDTO{})
		return
	}

	var plans []model.SubscriptionPlan
	if err := model.DB.Where("enabled = ?", true).Order("sort_order desc, id desc").Find(&plans).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	result := make([]SubscriptionPlanDTO, 0, len(plans))
	for _, p := range plans {
		p.NormalizeDefaults()
		result = append(result, SubscriptionPlanDTO{
			Plan: p,
		})
	}
	common.ApiSuccess(c, result)
}

// PublicPlanDTO exposes sanitized plan fields for the marketing homepage.
// Payment gateway product IDs and admin-only knobs are intentionally omitted.
type PublicPlanDTO struct {
	Id               int     `json:"id"`
	Title            string  `json:"title"`
	Subtitle         string  `json:"subtitle"`
	Tier             string  `json:"tier"`
	PlanType         string  `json:"plan_type"`
	IsHot            bool    `json:"is_hot"`
	PriceAmount      float64 `json:"price_amount"`
	Currency         string  `json:"currency"`
	DurationUnit     string  `json:"duration_unit"`
	DurationValue    int     `json:"duration_value"`
	TotalAmount      int64   `json:"total_amount"`
	QuotaResetPeriod string  `json:"quota_reset_period"`
	TeamMinSeats     int     `json:"team_min_seats"`
	TeamMaxSeats     int     `json:"team_max_seats"`
	SortOrder        int     `json:"sort_order"`
	UpgradeGroup     string  `json:"upgrade_group"`
}

// GetPublicSubscriptionPlans serves the pricing cards on the public homepage.
func GetPublicSubscriptionPlans(c *gin.Context) {
	if !operation_setting.IsPaymentComplianceConfirmed() {
		common.ApiSuccess(c, []PublicPlanDTO{})
		return
	}

	var plans []model.SubscriptionPlan
	if err := model.DB.Where("enabled = ?", true).Order("sort_order desc, id desc").Find(&plans).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	result := make([]PublicPlanDTO, 0, len(plans))
	for _, p := range plans {
		result = append(result, PublicPlanDTO{
			Id:               p.Id,
			Title:            p.Title,
			Subtitle:         p.Subtitle,
			Tier:             p.Tier,
			PlanType:         model.NormalizePlanType(p.PlanType),
			IsHot:            p.IsHot,
			PriceAmount:      p.PriceAmount,
			Currency:         p.Currency,
			DurationUnit:     p.DurationUnit,
			DurationValue:    p.DurationValue,
			TotalAmount:      p.TotalAmount,
			QuotaResetPeriod: model.NormalizeResetPeriod(p.QuotaResetPeriod),
			TeamMinSeats:     p.TeamMinSeats,
			TeamMaxSeats:     p.TeamMaxSeats,
			SortOrder:        p.SortOrder,
			UpgradeGroup:     p.UpgradeGroup,
		})
	}
	common.ApiSuccess(c, result)
}

func GetSubscriptionSelf(c *gin.Context) {
	userId := c.GetInt("id")
	settingMap, _ := model.GetUserSetting(userId, false)
	pref := common.NormalizeBillingPreference(settingMap.BillingPreference)

	// Get all subscriptions (including expired)
	allSubscriptions, err := model.GetAllUserSubscriptions(userId)
	if err != nil {
		allSubscriptions = []model.SubscriptionSummary{}
	}

	// Get active subscriptions for backward compatibility
	activeSubscriptions, err := model.GetAllActiveUserSubscriptions(userId)
	if err != nil {
		activeSubscriptions = []model.SubscriptionSummary{}
	}

	common.ApiSuccess(c, gin.H{
		"billing_preference": pref,
		"subscriptions":      activeSubscriptions, // all active subscriptions
		"all_subscriptions":  allSubscriptions,    // all subscriptions including expired
	})
}

func UpdateSubscriptionPreference(c *gin.Context) {
	userId := c.GetInt("id")
	var req BillingPreferenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	pref := common.NormalizeBillingPreference(req.BillingPreference)

	user, err := model.GetUserById(userId, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	current := user.GetSetting()
	current.BillingPreference = pref
	if err := model.UpdateUserSetting(user.Id, current); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"billing_preference": pref})
}

func SubscriptionRequestBalancePay(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	userId := c.GetInt("id")
	var req SubscriptionBalancePayRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PlanId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	if err := model.PurchaseSubscriptionWithBalance(userId, req.PlanId, req.Seats); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// ---- Admin APIs ----

func AdminListSubscriptionPlans(c *gin.Context) {
	var plans []model.SubscriptionPlan
	if err := model.DB.Order("sort_order desc, id desc").Find(&plans).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	result := make([]SubscriptionPlanDTO, 0, len(plans))
	for _, p := range plans {
		p.NormalizeDefaults()
		result = append(result, SubscriptionPlanDTO{
			Plan: p,
		})
	}
	common.ApiSuccess(c, result)
}

type AdminUpsertSubscriptionPlanRequest struct {
	Plan model.SubscriptionPlan `json:"plan"`
}

// normalizePlanDisplayFields fills display/billing-mode fields with sane
// defaults and validates team seat settings shared by create and update.
func normalizePlanDisplayFields(plan *model.SubscriptionPlan) string {
	plan.Tier = strings.TrimSpace(plan.Tier)
	plan.PlanType = model.NormalizePlanType(plan.PlanType)
	if plan.PlanType == model.SubscriptionPlanTypeTeam {
		if plan.TeamMinSeats < 1 {
			plan.TeamMinSeats = 1
		}
		if plan.TeamMaxSeats < 0 {
			plan.TeamMaxSeats = 0
		}
		if plan.TeamMaxSeats > 0 && plan.TeamMaxSeats < plan.TeamMinSeats {
			return "团队最大席位数不能小于最小席位数"
		}
	}
	return ""
}

func AdminCreateSubscriptionPlan(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	var req AdminUpsertSubscriptionPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	req.Plan.Id = 0
	if strings.TrimSpace(req.Plan.Title) == "" {
		common.ApiErrorMsg(c, "套餐标题不能为空")
		return
	}
	if req.Plan.PriceAmount < 0 {
		common.ApiErrorMsg(c, "价格不能为负数")
		return
	}
	if req.Plan.PriceAmount > 9999 {
		common.ApiErrorMsg(c, "价格不能超过9999")
		return
	}
	if msg := normalizePlanDisplayFields(&req.Plan); msg != "" {
		common.ApiErrorMsg(c, msg)
		return
	}
	if req.Plan.Currency == "" {
		req.Plan.Currency = "USD"
	}
	req.Plan.Currency = "USD"
	if req.Plan.AllowBalancePay == nil {
		req.Plan.AllowBalancePay = common.GetPointer(true)
	}
	if req.Plan.AllowWalletOverflow == nil {
		req.Plan.AllowWalletOverflow = common.GetPointer(true)
	}
	if req.Plan.DurationUnit == "" {
		req.Plan.DurationUnit = model.SubscriptionDurationMonth
	}
	if req.Plan.DurationValue <= 0 && req.Plan.DurationUnit != model.SubscriptionDurationCustom {
		req.Plan.DurationValue = 1
	}
	if req.Plan.MaxPurchasePerUser < 0 {
		common.ApiErrorMsg(c, "购买上限不能为负数")
		return
	}
	if req.Plan.TotalAmount < 0 {
		common.ApiErrorMsg(c, "总额度不能为负数")
		return
	}
	req.Plan.UpgradeGroup = strings.TrimSpace(req.Plan.UpgradeGroup)
	if req.Plan.UpgradeGroup != "" {
		if _, ok := ratio_setting.GetGroupRatioCopy()[req.Plan.UpgradeGroup]; !ok {
			common.ApiErrorMsg(c, "升级分组不存在")
			return
		}
	}
	req.Plan.DowngradeGroup = strings.TrimSpace(req.Plan.DowngradeGroup)
	if req.Plan.DowngradeGroup != "" {
		if _, ok := ratio_setting.GetGroupRatioCopy()[req.Plan.DowngradeGroup]; !ok {
			common.ApiErrorMsg(c, "降级分组不存在")
			return
		}
	}
	req.Plan.QuotaResetPeriod = model.NormalizeResetPeriod(req.Plan.QuotaResetPeriod)
	if req.Plan.QuotaResetPeriod == model.SubscriptionResetCustom && req.Plan.QuotaResetCustomSeconds <= 0 {
		common.ApiErrorMsg(c, "自定义重置周期需大于0秒")
		return
	}
	err := model.DB.Create(&req.Plan).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.InvalidateSubscriptionPlanCache(req.Plan.Id)
	common.ApiSuccess(c, req.Plan)
}

func AdminUpdateSubscriptionPlan(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		common.ApiErrorMsg(c, "无效的ID")
		return
	}
	var req AdminUpsertSubscriptionPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if strings.TrimSpace(req.Plan.Title) == "" {
		common.ApiErrorMsg(c, "套餐标题不能为空")
		return
	}
	if req.Plan.PriceAmount < 0 {
		common.ApiErrorMsg(c, "价格不能为负数")
		return
	}
	if req.Plan.PriceAmount > 9999 {
		common.ApiErrorMsg(c, "价格不能超过9999")
		return
	}
	if msg := normalizePlanDisplayFields(&req.Plan); msg != "" {
		common.ApiErrorMsg(c, msg)
		return
	}
	req.Plan.Id = id
	if req.Plan.Currency == "" {
		req.Plan.Currency = "USD"
	}
	req.Plan.Currency = "USD"
	if req.Plan.DurationUnit == "" {
		req.Plan.DurationUnit = model.SubscriptionDurationMonth
	}
	if req.Plan.DurationValue <= 0 && req.Plan.DurationUnit != model.SubscriptionDurationCustom {
		req.Plan.DurationValue = 1
	}
	if req.Plan.MaxPurchasePerUser < 0 {
		common.ApiErrorMsg(c, "购买上限不能为负数")
		return
	}
	if req.Plan.TotalAmount < 0 {
		common.ApiErrorMsg(c, "总额度不能为负数")
		return
	}
	req.Plan.UpgradeGroup = strings.TrimSpace(req.Plan.UpgradeGroup)
	if req.Plan.UpgradeGroup != "" {
		if _, ok := ratio_setting.GetGroupRatioCopy()[req.Plan.UpgradeGroup]; !ok {
			common.ApiErrorMsg(c, "升级分组不存在")
			return
		}
	}
	req.Plan.DowngradeGroup = strings.TrimSpace(req.Plan.DowngradeGroup)
	if req.Plan.DowngradeGroup != "" {
		if _, ok := ratio_setting.GetGroupRatioCopy()[req.Plan.DowngradeGroup]; !ok {
			common.ApiErrorMsg(c, "降级分组不存在")
			return
		}
	}
	req.Plan.QuotaResetPeriod = model.NormalizeResetPeriod(req.Plan.QuotaResetPeriod)
	if req.Plan.QuotaResetPeriod == model.SubscriptionResetCustom && req.Plan.QuotaResetCustomSeconds <= 0 {
		common.ApiErrorMsg(c, "自定义重置周期需大于0秒")
		return
	}

	err := model.DB.Transaction(func(tx *gorm.DB) error {
		// update plan (allow zero values updates with map)
		updateMap := map[string]any{
			"title":                      req.Plan.Title,
			"subtitle":                   req.Plan.Subtitle,
			"tier":                       req.Plan.Tier,
			"plan_type":                  req.Plan.PlanType,
			"team_min_seats":             req.Plan.TeamMinSeats,
			"team_max_seats":             req.Plan.TeamMaxSeats,
			"is_hot":                     req.Plan.IsHot,
			"price_amount":               req.Plan.PriceAmount,
			"currency":                   req.Plan.Currency,
			"duration_unit":              req.Plan.DurationUnit,
			"duration_value":             req.Plan.DurationValue,
			"custom_seconds":             req.Plan.CustomSeconds,
			"enabled":                    req.Plan.Enabled,
			"sort_order":                 req.Plan.SortOrder,
			"stripe_price_id":            req.Plan.StripePriceId,
			"creem_product_id":           req.Plan.CreemProductId,
			"waffo_pancake_product_id":   req.Plan.WaffoPancakeProductId,
			"max_purchase_per_user":      req.Plan.MaxPurchasePerUser,
			"total_amount":               req.Plan.TotalAmount,
			"upgrade_group":              req.Plan.UpgradeGroup,
			"downgrade_group":            req.Plan.DowngradeGroup,
			"quota_reset_period":         req.Plan.QuotaResetPeriod,
			"quota_reset_custom_seconds": req.Plan.QuotaResetCustomSeconds,
			"updated_at":                 common.GetTimestamp(),
		}
		if req.Plan.AllowBalancePay != nil {
			updateMap["allow_balance_pay"] = *req.Plan.AllowBalancePay
		}
		if req.Plan.AllowWalletOverflow != nil {
			updateMap["allow_wallet_overflow"] = *req.Plan.AllowWalletOverflow
		}
		if err := tx.Model(&model.SubscriptionPlan{}).Where("id = ?", id).Updates(updateMap).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.InvalidateSubscriptionPlanCache(id)
	common.ApiSuccess(c, nil)
}

type AdminUpdateSubscriptionPlanStatusRequest struct {
	Enabled *bool `json:"enabled"`
}

func AdminUpdateSubscriptionPlanStatus(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		common.ApiErrorMsg(c, "无效的ID")
		return
	}
	var req AdminUpdateSubscriptionPlanStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Enabled == nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", id).Update("enabled", *req.Enabled).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	model.InvalidateSubscriptionPlanCache(id)
	common.ApiSuccess(c, nil)
}

type AdminBindSubscriptionRequest struct {
	UserId int `json:"user_id"`
	PlanId int `json:"plan_id"`
}

func AdminBindSubscription(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	var req AdminBindSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.UserId <= 0 || req.PlanId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	msg, err := model.AdminBindSubscription(req.UserId, req.PlanId, "")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if msg != "" {
		common.ApiSuccess(c, gin.H{"message": msg})
		return
	}
	common.ApiSuccess(c, nil)
}

// ---- Admin: user subscription management ----

func AdminListUserSubscriptions(c *gin.Context) {
	userId, _ := strconv.Atoi(c.Param("id"))
	if userId <= 0 {
		common.ApiErrorMsg(c, "无效的用户ID")
		return
	}
	subs, err := model.GetAllUserSubscriptions(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, subs)
}

type AdminCreateUserSubscriptionRequest struct {
	PlanId int `json:"plan_id"`
}

type AdminResetSubscriptionRequest struct {
	PlanId           int   `json:"plan_id"`
	AdvanceResetTime *bool `json:"advance_reset_time"`
}

func resolveAdvanceResetTime(value *bool) bool {
	if value == nil {
		return true
	}
	return *value
}

func recordSubscriptionResetUserLogs(c *gin.Context, result *model.SubscriptionResetResult, adminInfo *model.AuditAdminInfo) {
	if result == nil || result.ResetCount == 0 {
		return
	}
	content := fmt.Sprintf("管理员重置订阅套餐 %s（ID: %d）额度", result.PlanTitle, result.PlanId)
	for _, userId := range result.AffectedUserIds {
		model.RecordLogWithAdminInfo(userId, model.LogTypeManage, content, adminInfo, nil, c)
	}
}

// AdminCreateUserSubscription creates a new user subscription from a plan (no payment).
func AdminCreateUserSubscription(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	userId, _ := strconv.Atoi(c.Param("id"))
	if userId <= 0 {
		common.ApiErrorMsg(c, "无效的用户ID")
		return
	}
	var req AdminCreateUserSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PlanId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	msg, err := model.AdminBindSubscription(userId, req.PlanId, "")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if msg != "" {
		common.ApiSuccess(c, gin.H{"message": msg})
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminResetUserSubscriptionsByPlan(c *gin.Context) {
	userId, _ := strconv.Atoi(c.Param("id"))
	if userId <= 0 {
		common.ApiErrorMsg(c, "无效的用户ID")
		return
	}
	var req AdminResetSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if req.PlanId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	advanceResetTime := resolveAdvanceResetTime(req.AdvanceResetTime)
	result, err := model.AdminResetUserSubscriptionsByPlan(userId, req.PlanId, advanceResetTime)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordSubscriptionResetUserLogs(c, result, auditOperatorInfo(c))
	recordManageAuditFor(c, userId, "subscription.user_plan_reset", map[string]any{
		"target_user_id":     userId,
		"plan_id":            result.PlanId,
		"plan_title":         result.PlanTitle,
		"reset_count":        result.ResetCount,
		"user_count":         result.UserCount,
		"advance_reset_time": result.AdvanceResetTime,
	})
	common.ApiSuccess(c, result)
}

func AdminResetPlanSubscriptions(c *gin.Context) {
	planId, _ := strconv.Atoi(c.Param("id"))
	if planId <= 0 {
		common.ApiErrorMsg(c, "无效的ID")
		return
	}
	var req AdminResetSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	advanceResetTime := resolveAdvanceResetTime(req.AdvanceResetTime)
	result, err := model.AdminResetPlanSubscriptions(planId, advanceResetTime)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordSubscriptionResetUserLogs(c, result, auditOperatorInfo(c))
	common.SysLog(fmt.Sprintf("admin reset subscription plan %d quota: reset_count=%d user_count=%d advance_reset_time=%t",
		result.PlanId, result.ResetCount, result.UserCount, result.AdvanceResetTime))
	recordManageAudit(c, "subscription.plan_reset", map[string]any{
		"plan_id":            result.PlanId,
		"plan_title":         result.PlanTitle,
		"reset_count":        result.ResetCount,
		"user_count":         result.UserCount,
		"advance_reset_time": result.AdvanceResetTime,
	})
	common.ApiSuccess(c, result)
}

// AdminInvalidateUserSubscription cancels a user subscription immediately.
func AdminInvalidateUserSubscription(c *gin.Context) {
	subId, _ := strconv.Atoi(c.Param("id"))
	if subId <= 0 {
		common.ApiErrorMsg(c, "无效的订阅ID")
		return
	}
	msg, err := model.AdminInvalidateUserSubscription(subId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if msg != "" {
		common.ApiSuccess(c, gin.H{"message": msg})
		return
	}
	common.ApiSuccess(c, nil)
}

// AdminDeleteUserSubscription hard-deletes a user subscription.
func AdminDeleteUserSubscription(c *gin.Context) {
	subId, _ := strconv.Atoi(c.Param("id"))
	if subId <= 0 {
		common.ApiErrorMsg(c, "无效的订阅ID")
		return
	}
	msg, err := model.AdminDeleteUserSubscription(subId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if msg != "" {
		common.ApiSuccess(c, gin.H{"message": msg})
		return
	}
	common.ApiSuccess(c, nil)
}
