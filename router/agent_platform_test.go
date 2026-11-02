package router

import (
	"bytes"
	"context"
	"maps"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	agentservice "github.com/QuantumNous/new-api/service/agent"
	"github.com/QuantumNous/new-api/setting/agent_setting"
	"github.com/gin-gonic/gin"
	mysqldriver "github.com/go-sql-driver/mysql"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func withAgentPlatformOptions(t *testing.T, options map[string]string) {
	t.Helper()
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = maps.Clone(options)
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previous
		common.OptionMapRWMutex.Unlock()
	})
}

func TestAgentPlatformCapabilities(t *testing.T) {
	tests := []struct {
		name    string
		options map[string]string
		want    agent_setting.Capabilities
	}{
		{name: "missing configuration"},
		{name: "registered defaults", options: agent_setting.DefaultOptions()},
		{name: "subswitches cannot override platform", options: map[string]string{
			"agent_setting.worker_enabled": "true", "agent_setting.mcp_enabled": "true",
			"agent_setting.skills_enabled": "true", "agent_setting.scripts_enabled": "true",
		}},
		{name: "platform alone", options: map[string]string{"agent_setting.enabled": "true"}, want: agent_setting.Capabilities{Enabled: true}},
		{name: "worker", options: map[string]string{"agent_setting.enabled": "true", "agent_setting.worker_enabled": "true"}, want: agent_setting.Capabilities{Enabled: true, WorkerEnabled: true}},
		{name: "mcp", options: map[string]string{"agent_setting.enabled": "true", "agent_setting.mcp_enabled": "true"}, want: agent_setting.Capabilities{Enabled: true, MCPEnabled: true}},
		{name: "skills", options: map[string]string{"agent_setting.enabled": "true", "agent_setting.skills_enabled": "true"}, want: agent_setting.Capabilities{Enabled: true, SkillsEnabled: true}},
		{name: "scripts require skills", options: map[string]string{"agent_setting.enabled": "true", "agent_setting.scripts_enabled": "true"}, want: agent_setting.Capabilities{Enabled: true}},
		{name: "all enabled", options: map[string]string{
			"agent_setting.enabled": "true", "agent_setting.worker_enabled": "true", "agent_setting.mcp_enabled": "true",
			"agent_setting.skills_enabled": "true", "agent_setting.scripts_enabled": "true",
		}, want: agent_setting.Capabilities{Enabled: true, WorkerEnabled: true, MCPEnabled: true, SkillsEnabled: true, ScriptsEnabled: true}},
		{name: "invalid total switch fails closed", options: map[string]string{"agent_setting.enabled": "TRUE", "agent_setting.worker_enabled": "true"}},
		{name: "invalid child switches fail closed", options: map[string]string{
			"agent_setting.enabled": "true", "agent_setting.worker_enabled": "1", "agent_setting.mcp_enabled": "yes",
			"agent_setting.skills_enabled": " true ", "agent_setting.scripts_enabled": "true",
		}, want: agent_setting.Capabilities{Enabled: true}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			withAgentPlatformOptions(t, test.options)
			assert.Equal(t, test.want, agent_setting.Snapshot())
			assert.Equal(t, test.want.WorkerEnabled, agent_setting.CanClaimNewWork())
			assert.False(t, agent_setting.Snapshot().Allows(agent_setting.Feature("unknown")))
		})
	}
}

func TestAgentPlatformStatusPreservesLegacyFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withAgentPlatformOptions(t, map[string]string{
		"agent_setting.enabled": "true", "agent_setting.mcp_enabled": "true", "agent_setting.scripts_enabled": "true",
	})
	engine := gin.New()
	engine.GET("/api/status", controller.GetStatus)
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	require.Equal(t, http.StatusOK, response.Code)
	var payload struct {
		Success bool           `json:"success"`
		Message string         `json:"message"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
	assert.True(t, payload.Success)
	assert.Empty(t, payload.Message)
	assert.Equal(t, common.Version, payload.Data["version"])
	assert.Equal(t, common.SystemName, payload.Data["system_name"])
	assert.Equal(t, common.TaskEnabled, payload.Data["enable_task"])
	assert.Equal(t, common.DrawingEnabled, payload.Data["enable_drawing"])
	assert.Equal(t, map[string]any{
		"enabled": true, "worker_enabled": false, "mcp_enabled": true, "skills_enabled": false, "scripts_enabled": false,
	}, payload.Data["agent_platform"])
}

func TestAgentPlatformGateScopesAndDrainControls(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withAgentPlatformOptions(t, nil)
	engine := gin.New()
	engine.Use(middleware.RequestId(), middleware.AgentPlatformGate())
	tests := []struct {
		method, path string
		want         int
	}{
		{http.MethodGet, "/api/agent-platform", http.StatusServiceUnavailable},
		{http.MethodPost, "/api/agent-platform/workspaces", http.StatusServiceUnavailable},
		{http.MethodPost, "/v1/agents/101/runs", http.StatusServiceUnavailable},
		{http.MethodPost, "/v1/agent-runs/501/resume", http.StatusServiceUnavailable},
		{http.MethodPatch, "/v1/agent-runs/501", http.StatusServiceUnavailable},
		{http.MethodDelete, "/v1/agent-runs/501", http.StatusServiceUnavailable},
		{http.MethodGet, "/v1/agent-runs/501", http.StatusNoContent},
		{http.MethodHead, "/v1/agent-runs/501", http.StatusNoContent},
		{http.MethodGet, "/v1/agent-runs/501/events", http.StatusNoContent},
		{http.MethodHead, "/v1/agent-runs/501/events", http.StatusNoContent},
		{http.MethodPost, "/v1/agent-runs/501/cancel", http.StatusNoContent},
		{http.MethodGet, "/v1/agent-runs/501/cancel", http.StatusServiceUnavailable},
		{http.MethodPost, "/v1/agent-runs/501/events", http.StatusServiceUnavailable},
		{http.MethodGet, "/v1/agent-runs/501/events/extra", http.StatusServiceUnavailable},
		{http.MethodGet, "/v1/agent-runs", http.StatusServiceUnavailable},
		{http.MethodGet, "/api/agent-platform-other", http.StatusNoContent},
		{http.MethodGet, "/v1/agents-other/101", http.StatusNoContent},
		{http.MethodGet, "/v1/agent-runs-other/501", http.StatusNoContent},
		{http.MethodPost, "/v1/chat/completions", http.StatusNoContent},
		{http.MethodPost, "/v1/responses", http.StatusNoContent},
		{http.MethodGet, "/api/team", http.StatusNoContent},
	}
	for _, test := range tests {
		engine.Handle(test.method, test.path, func(c *gin.Context) {
			c.Header("X-Agent-Test-Handler", "reached")
			c.Status(http.StatusNoContent)
		})
	}
	for _, test := range tests {
		t.Run(test.method+" "+test.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, httptest.NewRequest(test.method, test.path, nil))
			require.Equal(t, test.want, response.Code)
			if test.want == http.StatusNoContent {
				assert.Equal(t, "reached", response.Header().Get("X-Agent-Test-Handler"))
				return
			}
			assert.Empty(t, response.Header().Get("X-Agent-Test-Handler"))
			assert.Contains(t, response.Header().Get("Cache-Control"), "no-store")
			var payload struct {
				Success   bool           `json:"success"`
				Code      string         `json:"code"`
				RequestID string         `json:"request_id"`
				Data      map[string]any `json:"data"`
			}
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
			assert.False(t, payload.Success)
			assert.Equal(t, "AG_RUNTIME_UNAVAILABLE", payload.Code)
			assert.NotEmpty(t, payload.RequestID)
			assert.Equal(t, response.Header().Get(common.RequestIdKey), payload.RequestID)
			assert.Equal(t, map[string]any{"field_errors": []any{}, "retryable": false}, payload.Data)
		})
	}
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{"agent_setting.enabled": "true"}
	common.OptionMapRWMutex.Unlock()
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/agents/101/runs", nil))
	assert.Equal(t, http.StatusNoContent, response.Code, "opening the switch permits the next handler, without implementing an Agent API")
}

func TestAgentPlatformFeatureAdmissionAndInFlightDrain(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withAgentPlatformOptions(t, map[string]string{"agent_setting.enabled": "true", "agent_setting.worker_enabled": "true"})
	engine := gin.New()
	entered, release, finished := make(chan struct{}), make(chan struct{}), make(chan struct{})
	engine.POST("/claim", middleware.RequireAgentFeature(agent_setting.FeatureWorker), func(c *gin.Context) {
		close(entered)
		<-release
		c.Status(http.StatusNoContent)
	})
	first := httptest.NewRecorder()
	released := false
	t.Cleanup(func() {
		if !released {
			close(release)
		}
	})
	go func() {
		defer close(finished)
		engine.ServeHTTP(first, httptest.NewRequest(http.MethodPost, "/claim", nil))
	}()
	select {
	case <-entered:
	case <-finished:
		t.Fatalf("enabled admission did not reach the handler: HTTP %d", first.Code)
	case <-time.After(5 * time.Second):
		t.Fatal("enabled admission did not reach the handler before the test deadline")
	}
	common.OptionMapRWMutex.Lock()
	common.OptionMap["agent_setting.enabled"] = "false"
	common.OptionMapRWMutex.Unlock()
	second := httptest.NewRecorder()
	engine.ServeHTTP(second, httptest.NewRequest(http.MethodPost, "/claim", nil))
	assert.Equal(t, http.StatusServiceUnavailable, second.Code)
	assert.False(t, agent_setting.CanClaimNewWork())
	close(release)
	released = true
	select {
	case <-finished:
	case <-time.After(5 * time.Second):
		t.Fatal("an admitted request did not drain before the test deadline")
	}
	assert.Equal(t, http.StatusNoContent, first.Code, "an already admitted operation drains without forced cancellation")

	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{"agent_setting.enabled": "true", "agent_setting.skills_enabled": "true"}
	common.OptionMapRWMutex.Unlock()
	for _, test := range []struct {
		feature agent_setting.Feature
		want    int
	}{
		{agent_setting.FeaturePlatform, http.StatusNoContent},
		{agent_setting.FeatureWorker, http.StatusServiceUnavailable},
		{agent_setting.FeatureMCP, http.StatusServiceUnavailable},
		{agent_setting.FeatureSkills, http.StatusNoContent},
		{agent_setting.FeatureScripts, http.StatusServiceUnavailable},
		{agent_setting.Feature("unknown"), http.StatusServiceUnavailable},
	} {
		t.Run(string(test.feature), func(t *testing.T) {
			childEngine := gin.New()
			childEngine.POST("/feature", middleware.RequireAgentFeature(test.feature), func(c *gin.Context) { c.Status(http.StatusNoContent) })
			response := httptest.NewRecorder()
			childEngine.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/feature", nil))
			assert.Equal(t, test.want, response.Code)
		})
	}
}

func TestAgentPlatformGateIsWiredIntoProductionRouter(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withAgentPlatformOptions(t, nil)
	t.Chdir(t.TempDir())
	t.Setenv("FRONTEND_BASE_URL", "https://frontend.example.invalid")
	previousMaster, previousRegistry := common.IsMasterNode, jsplugin.DefaultRegistry
	common.IsMasterNode = false
	jsplugin.DefaultRegistry = jsplugin.NewRegistry()
	t.Cleanup(func() { common.IsMasterNode, jsplugin.DefaultRegistry = previousMaster, previousRegistry })
	engine := gin.New()
	engine.Use(middleware.RequestId())
	require.NotPanics(t, func() { SetRouter(engine, WebAssets{}) })
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/agents/101/runs", nil))
	assert.Equal(t, http.StatusServiceUnavailable, response.Code)
	assert.Empty(t, response.Header().Get("Location"), "the gate must run before frontend fallback")
	response = httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	assert.Equal(t, http.StatusOK, response.Code)
	response = httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/agent-platform/capabilities", nil))
	assert.Equal(t, http.StatusOK, response.Code, "the public probe remains available when admission is closed")
}

func TestAgentPlatformModuleProbe(t *testing.T) {
	gin.SetMode(gin.TestMode)
	// The probe must work before persistence is available.
	previousDB, previousLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = nil, nil
	t.Cleanup(func() { model.DB, model.LOG_DB = previousDB, previousLogDB })
	engine := gin.New()
	engine.Use(middleware.RequestId(), middleware.AgentPlatformGate())
	SetApiRouter(engine)
	tests := []struct {
		name    string
		options map[string]string
		want    map[string]any
	}{
		{name: "disabled", want: map[string]any{
			"schema_version": float64(1), "enabled": false, "worker_enabled": false, "mcp_enabled": false,
			"skills_enabled": false, "scripts_enabled": false, "runtime_ready": false,
		}},
		{name: "configured without runtime", options: map[string]string{
			"agent_setting.enabled": "true", "agent_setting.worker_enabled": "true", "agent_setting.mcp_enabled": "true",
			"agent_setting.skills_enabled": "true", "agent_setting.scripts_enabled": "true",
		}, want: map[string]any{
			"schema_version": float64(1), "enabled": true, "worker_enabled": true, "mcp_enabled": true,
			"skills_enabled": true, "scripts_enabled": true, "runtime_ready": false,
		}},
		{name: "scripts depend on skills", options: map[string]string{
			"agent_setting.enabled": "true", "agent_setting.scripts_enabled": "true",
		}, want: map[string]any{
			"schema_version": float64(1), "enabled": true, "worker_enabled": false, "mcp_enabled": false,
			"skills_enabled": false, "scripts_enabled": false, "runtime_ready": false,
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			withAgentPlatformOptions(t, test.options)
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/api/agent-platform/capabilities?team_id=999&workspace_id=999", nil)
			request.Header.Set("X-Workspace-ID", "999")
			engine.ServeHTTP(response, request)
			require.Equal(t, http.StatusOK, response.Code)
			assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
			var payload map[string]any
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
			assert.Len(t, payload, 5)
			assert.Equal(t, true, payload["success"])
			assert.Equal(t, "OK", payload["code"])
			assert.Equal(t, "", payload["message"])
			assert.NotEmpty(t, payload["request_id"])
			assert.Equal(t, response.Header().Get(common.RequestIdKey), payload["request_id"])
			assert.Equal(t, test.want, payload["data"], "global probe must not expose a tenant scope or claim runtime readiness")
		})
	}
}

func TestAgentPlatformModuleProbeExceptionIsNarrow(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withAgentPlatformOptions(t, nil)
	engine := gin.New()
	engine.Use(middleware.RequestId(), middleware.AgentPlatformGate())
	SetApiRouter(engine)
	for _, request := range []struct{ method, path string }{
		{http.MethodPost, "/api/agent-platform/capabilities"},
		{http.MethodPut, "/api/agent-platform/capabilities"},
		{http.MethodDelete, "/api/agent-platform/capabilities"},
		{http.MethodHead, "/api/agent-platform/capabilities"},
		{http.MethodGet, "/api/agent-platform/capabilities/details"},
		{http.MethodGet, "/api/agent-platform/capabilities-other"},
		{http.MethodPost, "/api/agent-platform/workspaces"},
		{http.MethodPost, "/v1/agents/101/runs"},
	} {
		t.Run(request.method+" "+request.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, httptest.NewRequest(request.method, request.path, nil))
			assert.Equal(t, http.StatusServiceUnavailable, response.Code)
		})
	}
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{"agent_setting.enabled": "true"}
	common.OptionMapRWMutex.Unlock()
	for _, path := range []string{"/api/agent-platform/workspaces", "/v1/agents/101/runs"} {
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, httptest.NewRequest(http.MethodPost, path, nil))
		assert.Equal(t, http.StatusNotFound, response.Code, "opening configuration must not fabricate unimplemented business handlers")
	}
}

func TestAgentPlatformModuleContextIsInternal(t *testing.T) {
	withAgentPlatformOptions(t, nil)
	request := agentservice.RequestContext{
		Context: context.Background(), RequestID: "p00-t05-fixture",
		Scope: &model.AgentScope{TeamID: 1, WorkspaceID: 10},
	}
	encoded, err := common.Marshal(request)
	require.NoError(t, err)
	assert.JSONEq(t, `{}`, string(encoded), "internal context must not become a client-provided DTO")
	result := agentservice.Probe(request)
	assert.Equal(t, request.RequestID, result.RequestID)
	assert.False(t, result.Capabilities.Enabled)
	assert.False(t, result.Capabilities.RuntimeReady)
}

func TestAgentPlatformOptionMySQL(t *testing.T) {
	rawDSN := os.Getenv("TEST_AGENT_PLATFORM_OPTION_MYSQL_DSN")
	if rawDSN == "" {
		t.Skip("isolated MySQL option validation not configured")
	}
	parsed, err := mysqldriver.ParseDSN(rawDSN)
	require.NoError(t, err)
	require.Equal(t, "tcp", parsed.Net)
	host, _, err := net.SplitHostPort(parsed.Addr)
	require.NoError(t, err, "an explicit loopback TCP port is required")
	require.Contains(t, []string{"127.0.0.1", "localhost"}, host)
	require.False(t, parsed.MultiStatements)
	match := regexp.MustCompile(`^aivale_p00_t03_([a-z0-9]{8,24})_fresh$`).FindStringSubmatch(parsed.DBName)
	require.Len(t, match, 2, "refusing an unscoped MySQL database")
	parsed.ParseTime = true
	parsed.Timeout, parsed.ReadTimeout, parsed.WriteTimeout = 10*time.Second, 30*time.Second, 30*time.Second
	db, err := gorm.Open(mysql.Open(parsed.FormatDSN()), &gorm.Config{Logger: logger.Discard})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { assert.NoError(t, sqlDB.Close()) })
	var actualName, version string
	require.NoError(t, db.Raw("SELECT DATABASE()").Scan(&actualName).Error)
	require.Equal(t, parsed.DBName, actualName)
	require.NoError(t, db.Raw("SELECT VERSION()").Scan(&version).Error)
	require.NotContains(t, strings.ToLower(version), "mariadb")
	var marker []struct {
		RunID   string `gorm:"column:run_id"`
		Purpose string
	}
	require.NoError(t, db.Table("__aivale_test_environment").Find(&marker).Error)
	require.Len(t, marker, 1)
	require.Equal(t, match[1], marker[0].RunID)
	require.Equal(t, "p00-t03-mysql", marker[0].Purpose)
	var tables []string
	require.NoError(t, db.Raw("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '__aivale_test_environment'").Scan(&tables).Error)
	require.Empty(t, tables, "use a newly created isolated MySQL run")
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.AuditLog{}))
	previousDB, previousLogDB, previousRedis := model.DB, model.LOG_DB, common.RedisEnabled
	previousRegistry := jsplugin.DefaultRegistry
	jsplugin.DefaultRegistry = jsplugin.NewRegistry()
	previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB, common.RedisEnabled = db, db, false
	common.SetDatabaseTypes(common.DatabaseTypeMySQL, common.DatabaseTypeMySQL)
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled = previousDB, previousLogDB, previousRedis
		jsplugin.DefaultRegistry = previousRegistry
		common.SetDatabaseTypes(previousMainType, previousLogType)
	})
	withAgentPlatformOptions(t, nil)
	model.InitOptionMap()
	require.Equal(t, agent_setting.Capabilities{}, agent_setting.Snapshot(), "a fresh installation must keep every platform capability disabled")
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(middleware.RequestId(), middleware.AgentPlatformGate())
	engine.POST("/v1/agents/101/runs", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	engine.PUT("/api/option/", func(c *gin.Context) {
		// The controller persistence boundary is under test; existing RootAuth
		// remains responsible for authenticating real administrator requests.
		c.Set("id", 1)
		c.Set("role", common.RoleRootUser)
		c.Set("username", "p00-option-fixture")
		controller.UpdateOption(c)
	})
	for _, key := range []string{"agent_setting.enabled", "agent_setting.worker_enabled", "agent_setting.mcp_enabled", "agent_setting.skills_enabled", "agent_setting.scripts_enabled"} {
		payload, err := common.Marshal(map[string]any{"key": key, "value": true})
		require.NoError(t, err)
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, httptest.NewRequest(http.MethodPut, "/api/option/", bytes.NewReader(payload)))
		var result struct {
			Success bool `json:"success"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
		require.True(t, result.Success, "canonical option %s was rejected", key)
		var persisted model.Option
		require.NoError(t, db.First(&persisted, "`key` = ?", key).Error)
		assert.Equal(t, "true", persisted.Value)
	}
	assert.Equal(t, agent_setting.Capabilities{Enabled: true, WorkerEnabled: true, MCPEnabled: true, SkillsEnabled: true, ScriptsEnabled: true}, agent_setting.Snapshot())
	admitted := httptest.NewRecorder()
	engine.ServeHTTP(admitted, httptest.NewRequest(http.MethodPost, "/v1/agents/101/runs", nil))
	require.Equal(t, http.StatusNoContent, admitted.Code)
	before := agent_setting.Snapshot()
	for _, invalid := range []struct {
		key   string
		value any
	}{
		{"agent_setting.enabled", "TRUE"}, {"agent_setting.enabled", 1},
		{"agent_setting.enabled", nil}, {"agent_setting.unknown_enabled", true},
	} {
		payload, err := common.Marshal(map[string]any{"key": invalid.key, "value": invalid.value})
		require.NoError(t, err)
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, httptest.NewRequest(http.MethodPut, "/api/option/", bytes.NewReader(payload)))
		var result struct {
			Success bool `json:"success"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
		assert.False(t, result.Success, "noncanonical option should be rejected")
		assert.Equal(t, before, agent_setting.Snapshot())
	}
	var persisted model.Option
	require.NoError(t, db.First(&persisted, "`key` = ?", "agent_setting.enabled").Error)
	assert.Equal(t, "true", persisted.Value)
	var unknownCount int64
	require.NoError(t, db.Model(&model.Option{}).Where("`key` = ?", "agent_setting.unknown_enabled").Count(&unknownCount).Error)
	assert.Zero(t, unknownCount)
	// The successful administrator update must immediately stop new admission.
	payload, err := common.Marshal(map[string]any{"key": "agent_setting.enabled", "value": false})
	require.NoError(t, err)
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodPut, "/api/option/", bytes.NewReader(payload)))
	var disabled struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &disabled))
	require.True(t, disabled.Success)
	require.NoError(t, db.First(&persisted, "`key` = ?", "agent_setting.enabled").Error)
	require.Equal(t, "false", persisted.Value)
	require.Equal(t, agent_setting.Capabilities{}, agent_setting.Snapshot())
	response = httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/agents/101/runs", nil))
	require.Equal(t, http.StatusServiceUnavailable, response.Code)
	// Exercise the real startup reload path, replacing deliberately stale memory.
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{"agent_setting.enabled": "true"}
	common.OptionMapRWMutex.Unlock()
	model.InitOptionMap()
	require.Equal(t, agent_setting.Capabilities{}, agent_setting.Snapshot())
	common.OptionMapRWMutex.RLock()
	reloadedMaster, reloadedWorker := common.OptionMap["agent_setting.enabled"], common.OptionMap["agent_setting.worker_enabled"]
	common.OptionMapRWMutex.RUnlock()
	require.Equal(t, "false", reloadedMaster)
	require.Equal(t, "true", reloadedWorker, "reload must retain the configured child value while the total switch masks it")
	var auditCount int64
	require.NoError(t, db.Model(&model.AuditLog{}).Where("action = ?", "option.update").Count(&auditCount).Error)
	require.EqualValues(t, 6, auditCount)
	// A failed transaction must not publish a switch change in memory.
	before = agent_setting.Snapshot()
	require.NoError(t, sqlDB.Close())
	require.Error(t, model.UpdateOption("agent_setting.enabled", "true"))
	require.Equal(t, before, agent_setting.Snapshot())
	require.False(t, t.Failed(), "earlier persistence assertions failed")
	summary, err := common.Marshal(map[string]any{
		"mysql_version": version, "canonical_options": 5, "invalid_options": 4, "audit_rows": auditCount,
		"defaults_disabled": true, "hot_disable": true, "persisted_reload_disabled": true, "write_failure_preserves_memory": true,
	})
	require.NoError(t, err)
	t.Logf("P00_T04_RESULT %s", summary)
}
