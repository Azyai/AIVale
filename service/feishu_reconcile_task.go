package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
)

const (
	feishuReconcileProviderSlug       = "feishu"
	feishuReconcileBatchSize          = 100
	feishuReconcileRequestTimeout     = 15 * time.Second
	feishuReconcileDefaultIntervalMin = 1440 // 24 小时,可通过 FEISHU_RECONCILE_INTERVAL_MINUTES 调整
	feishuTenantTokenURL              = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
	feishuContactUserURLPrefix        = "https://open.feishu.cn/open-apis/contact/v3/users/"
)

var (
	feishuReconcileOnce    sync.Once
	feishuReconcileRunning atomic.Bool

	feishuTenantTokenMu  sync.Mutex
	feishuTenantTokenVal string
	feishuTenantTokenExp time.Time
)

// feishuUserStatusFlags 对应飞书通讯录用户对象的 status 字段;
// 指针类型用于区分"字段缺失"与"明确为 false"。
type feishuUserStatusFlags struct {
	IsFrozen   *bool `json:"is_frozen"`
	IsResigned *bool `json:"is_resigned"`
	IsExited   *bool `json:"is_exited"`
	IsDeparted *bool `json:"is_departed"`
	IsUnjoin   *bool `json:"is_unjoin"`
}

func (f *feishuUserStatusFlags) flagTrue(v *bool) bool { return v != nil && *v }

func feishuReconcileEnabled() bool {
	return common.GetEnvOrDefaultBool("FEISHU_RECONCILE_ENABLED", true)
}

func feishuReconcileInterval() time.Duration {
	minutes := common.GetEnvOrDefault("FEISHU_RECONCILE_INTERVAL_MINUTES", feishuReconcileDefaultIntervalMin)
	if minutes < 1 {
		minutes = 1
	}
	return time.Duration(minutes) * time.Minute
}

// StartFeishuUserReconcileTask 启动飞书离职对账任务:
// 周期性用应用身份(tenant_access_token)查询通讯录,发现用户已离职/冻结/被移出
// 通讯录时禁用对应 new-api 账号,使其所有令牌立即失效。
// 仅主节点运行;凭证复用 custom_oauth_providers 中 slug=feishu 的自建应用。
func StartFeishuUserReconcileTask() {
	feishuReconcileOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		if !feishuReconcileEnabled() {
			logger.LogInfo(context.Background(), "feishu user reconcile task disabled (FEISHU_RECONCILE_ENABLED=false)")
			return
		}
		gopool.Go(func() {
			interval := feishuReconcileInterval()
			logger.LogInfo(context.Background(), fmt.Sprintf("feishu user reconcile task started: interval=%s", interval))

			ticker := time.NewTicker(interval)
			defer ticker.Stop()

			runFeishuUserReconcileOnce()
			for range ticker.C {
				runFeishuUserReconcileOnce()
			}
		})
	})
}

func runFeishuUserReconcileOnce() {
	if !feishuReconcileRunning.CompareAndSwap(false, true) {
		return
	}
	defer feishuReconcileRunning.Store(false)

	ctx := context.Background()

	provider, err := model.GetCustomOAuthProviderBySlug(feishuReconcileProviderSlug)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			logger.LogInfo(ctx, "feishu user reconcile: provider 'feishu' not configured, skip")
		} else {
			logger.LogError(ctx, fmt.Sprintf("feishu user reconcile: load provider failed: %v", err))
		}
		return
	}
	if !provider.Enabled || provider.ClientId == "" || provider.ClientSecret == "" {
		logger.LogInfo(ctx, "feishu user reconcile: provider disabled or credentials incomplete, skip")
		return
	}

	// 拿不到 tenant_access_token 时本轮整体跳过(fail-open),任何用户都不动
	tenantToken, err := getFeishuTenantToken(ctx, provider.ClientId, provider.ClientSecret)
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("feishu user reconcile: get tenant_access_token failed: %v", err))
		return
	}

	var scanned, disabled, skipped int
	offset := 0
	for {
		bindings, err := model.GetOAuthBindingsByProviderId(provider.Id, feishuReconcileBatchSize, offset)
		if err != nil {
			logger.LogError(ctx, fmt.Sprintf("feishu user reconcile: query bindings failed: %v", err))
			return
		}
		if len(bindings) == 0 {
			break
		}
		offset += len(bindings)

		for _, binding := range bindings {
			if binding == nil || strings.TrimSpace(binding.ProviderUserId) == "" {
				continue
			}
			scanned++

			gone, reason, err := checkFeishuUserGone(ctx, tenantToken, binding.ProviderUserId)
			if err != nil {
				// 单个查询失败(网络/IP 白名单/权限等)只跳过该用户,绝不据此禁用
				skipped++
				logger.LogWarn(ctx, fmt.Sprintf("feishu user reconcile: user_id=%d open_id=%s query failed: %v",
					binding.UserId, binding.ProviderUserId, err))
				continue
			}
			if !gone {
				continue
			}

			ok, err := disableUserForFeishuDeparture(ctx, binding.UserId, binding.ProviderUserId, reason)
			if err != nil {
				logger.LogError(ctx, fmt.Sprintf("feishu user reconcile: disable user %d failed: %v", binding.UserId, err))
				continue
			}
			if ok {
				disabled++
			}
		}
	}

	logger.LogInfo(ctx, fmt.Sprintf("feishu user reconcile: scanned=%d disabled=%d skipped=%d", scanned, disabled, skipped))
}

// checkFeishuUserGone 查询飞书用户当前状态。gone=true 仅代表明确信号:
// 通讯录返回离职/冻结/退出/未加入标记,或明确"查无此人"。
// err 非空表示查询本身失败,调用方必须跳过该用户。
func checkFeishuUserGone(ctx context.Context, tenantToken, openId string) (bool, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		feishuContactUserURLPrefix+openId+"?user_id_type=open_id", nil)
	if err != nil {
		return false, "", err
	}
	req.Header.Set("Authorization", "Bearer "+tenantToken)

	client := http.Client{Timeout: feishuReconcileRequestTimeout}
	res, err := client.Do(req)
	if err != nil {
		return false, "", err
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return false, "", err
	}

	// 飞书的业务错误可能伴随 HTTP 200 或 4xx 返回,统一先解析响应体,
	// 保证"查无此人"(离职被移出通讯录)不会被 HTTP 状态码挡住而漏判。
	var payload struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			User struct {
				Status feishuUserStatusFlags `json:"status"`
			} `json:"user"`
		} `json:"data"`
	}
	parseErr := common.Unmarshal(raw, &payload)

	if payload.Code != 0 {
		if parseErr == nil && isFeishuUserNotFound(payload.Msg) {
			return true, "feishu_user_not_found", nil
		}
		return false, "", fmt.Errorf("feishu contact api code=%d msg=%s http_status=%d", payload.Code, payload.Msg, res.StatusCode)
	}
	if parseErr != nil {
		return false, "", fmt.Errorf("feishu contact api http_status=%d parse: %v", res.StatusCode, parseErr)
	}
	if res.StatusCode != http.StatusOK {
		return false, "", fmt.Errorf("feishu contact api http_status=%d", res.StatusCode)
	}

	flags := payload.Data.User.Status
	switch {
	case flags.flagTrue(flags.IsResigned):
		return true, "feishu_user_resigned", nil
	case flags.flagTrue(flags.IsFrozen):
		return true, "feishu_user_frozen", nil
	case flags.flagTrue(flags.IsExited):
		return true, "feishu_user_exited", nil
	case flags.flagTrue(flags.IsDeparted):
		return true, "feishu_user_departed", nil
	case flags.flagTrue(flags.IsUnjoin):
		return true, "feishu_user_unjoin", nil
	}
	return false, "", nil
}

// isFeishuUserNotFound 已离职员工常被移出通讯录,按 open_id 查询会返回业务错误;
// 只有这类"明确查无此人"的信号才视为离职,其余错误一律按查询失败处理。
func isFeishuUserNotFound(msg string) bool {
	lower := strings.ToLower(msg)
	return strings.Contains(lower, "not exist") ||
		strings.Contains(lower, "not found") ||
		strings.Contains(msg, "不存在")
}

// disableUserForFeishuDeparture 禁用用户。user.Update 会同步完成:
// auth_version 围栏递增、Redis 用户缓存刷新(令牌链路立即生效)、吊销全部会话。
func disableUserForFeishuDeparture(ctx context.Context, userId int, openId, reason string) (bool, error) {
	user, err := model.GetUserById(userId, false)
	if err != nil {
		return false, fmt.Errorf("load user: %w", err)
	}
	// root 账号豁免;已禁用的用户无需重复处理
	if user.Role == common.RoleRootUser {
		return false, nil
	}
	if user.Status != common.UserStatusEnabled {
		return false, nil
	}

	user.Status = common.UserStatusDisabled
	if err := user.Update(false); err != nil {
		return false, fmt.Errorf("update user: %w", err)
	}

	content, _ := common.Marshal(map[string]string{
		"source": "feishu_reconcile",
		"open_id": openId,
		"reason":  reason,
	})
	model.RecordAuditLog(nil, model.AuditLog{
		Category:  model.AuditCategoryOperation,
		Action:    "user.feishu_reconcile.disable",
		UserId:    user.Id,
		Username:  user.Username,
		ActorRole: common.RoleRootUser,
		AuthMethod: "system_task",
		Success:   true,
		Content:   string(content),
	})

	logger.LogInfo(ctx, fmt.Sprintf("feishu user reconcile: disabled user_id=%d username=%s reason=%s",
		user.Id, user.Username, reason))
	return true, nil
}

// getFeishuTenantToken 以应用身份获取 tenant_access_token,缓存到过期前 5 分钟。
func getFeishuTenantToken(ctx context.Context, clientId, clientSecret string) (string, error) {
	feishuTenantTokenMu.Lock()
	defer feishuTenantTokenMu.Unlock()

	if feishuTenantTokenVal != "" && time.Now().Before(feishuTenantTokenExp.Add(-5*time.Minute)) {
		return feishuTenantTokenVal, nil
	}

	body, err := common.Marshal(map[string]string{
		"app_id":     clientId,
		"app_secret": clientSecret,
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, feishuTenantTokenURL, strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := http.Client{Timeout: feishuReconcileRequestTimeout}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return "", err
	}

	var payload struct {
		Code              int    `json:"code"`
		Msg               string `json:"msg"`
		TenantAccessToken string `json:"tenant_access_token"`
		Expire            int    `json:"expire"`
	}
	if err := common.Unmarshal(raw, &payload); err != nil {
		return "", err
	}
	if payload.Code != 0 || payload.TenantAccessToken == "" {
		return "", fmt.Errorf("tenant_access_token endpoint code=%d msg=%s", payload.Code, payload.Msg)
	}

	expire := payload.Expire
	if expire <= 0 {
		expire = 7000
	}
	feishuTenantTokenVal = payload.TenantAccessToken
	feishuTenantTokenExp = time.Now().Add(time.Duration(expire) * time.Second)
	return feishuTenantTokenVal, nil
}
