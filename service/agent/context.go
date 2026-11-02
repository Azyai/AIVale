package agent

import (
	"context"

	"github.com/QuantumNous/new-api/model"
)

// RequestContext carries internal request metadata. A future authentication and
// authorization adapter may bind Scope only after verifying access. Public
// capability probes leave Scope nil and do not grant tenant or resource access.
// Context is propagated metadata; this type does not implement an Agent runtime.
type RequestContext struct {
	Context   context.Context   `json:"-"`
	RequestID string            `json:"-"`
	Scope     *model.AgentScope `json:"-"`
}
