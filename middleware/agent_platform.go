package middleware

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/pkg/agentapi"
	"github.com/QuantumNous/new-api/setting/agent_setting"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

// RequireAgentFeature checks admission once. It does not revoke an admitted
// request or cancel existing work when an operator later disables the feature.
// This is a feature gate, not a replacement for authentication or authorization.
func RequireAgentFeature(feature agent_setting.Feature) gin.HandlerFunc {
	return func(c *gin.Context) {
		if agent_setting.Snapshot().Allows(feature) {
			c.Next()
			return
		}
		agentapi.WriteError(c, agenttypes.NewError(agenttypes.RuntimeUnavailable, nil))
	}
}

// AgentPlatformGate protects the reserved Agent API namespaces, including
// requests with no registered handler yet. Existing Run inspection/cancellation
// can still reach their ordinary auth/handlers while new admission is paused.
func AgentPlatformGate() gin.HandlerFunc {
	admission := RequireAgentFeature(agent_setting.FeaturePlatform)
	return func(c *gin.Context) {
		route := c.FullPath()
		if route == "" {
			route = c.Request.URL.Path
		}
		reserved := false
		for _, prefix := range []string{"/api/agent-platform", "/v1/agents", "/v1/agent-runs"} {
			if route == prefix || strings.HasPrefix(route, prefix+"/") {
				reserved = true
				break
			}
		}
		if reserved {
			defer agentapi.Recover(c)
		}
		probe := c.Request.Method == http.MethodGet && route == "/api/agent-platform/capabilities"
		if !reserved || probe || isAgentRunControl(c.Request.Method, route) {
			c.Next()
			return
		}
		admission(c)
	}
}

func isAgentRunControl(method, route string) bool {
	runPath, ok := strings.CutPrefix(route, "/v1/agent-runs/")
	if !ok {
		return false
	}
	parts := strings.Split(strings.TrimSuffix(runPath, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		return false
	}
	read := method == http.MethodGet || method == http.MethodHead
	if len(parts) == 1 {
		return read
	}
	if len(parts) == 2 {
		return (read && parts[1] == "events") || (method == http.MethodPost && parts[1] == "cancel")
	}
	return false
}
