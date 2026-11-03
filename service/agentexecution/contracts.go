// Package agentexecution defines the internal boundary for Agent step execution.
// It does not implement Run admission, persistence, authorization, or billing.
package agentexecution

import "context"

// StepInput is opaque platform-owned input, not an SDK message or public DTO.
type StepInput struct {
	Payload []byte
}

// StepOutput is opaque platform-owned output, not a persisted Run result.
type StepOutput struct {
	Payload []byte
}

// Step performs one injected operation. It must observe Context cancellation
// and must finish before RunStep returns; it cannot be forcibly terminated.
// The runtime does not copy or interpret the payload buffers.
type Step func(context.Context, StepInput) (StepOutput, error)

// Runtime executes one step cooperatively. Run lifecycle, checkpoints, and
// worker leases are separate future services, not implicit in this interface.
type Runtime interface {
	RunStep(context.Context, StepInput) (StepOutput, error)
}

// ToolCall identifies a fixed tool snapshot. These references are not proof of
// authorization; a real invoker must verify resource access before any action.
type ToolCall struct {
	WorkspaceID    int64
	ConnectionID   int64
	ToolSnapshotID int64
	Name           string
	Arguments      []byte
}

// ToolResult carries opaque tool data; it does not grant further capabilities.
type ToolResult struct {
	Payload []byte
}

// ToolInvoker is consumed by steps. Remote transport, authorization, argument
// validation, and result limits belong to the later real implementation.
type ToolInvoker interface {
	Invoke(context.Context, ToolCall) (ToolResult, error)
}

// SkillFileReference identifies a file in an immutable skill version. IDs,
// digests, and paths are metadata, not authorization or trusted filesystem paths.
type SkillFileReference struct {
	WorkspaceID    int64
	SkillVersionID int64
	Digest         string
	Path           string
}

// SkillSource provides fixed-version bytes. A real source must enforce access,
// path safety, integrity, and read limits; this package supplies no file reader.
type SkillSource interface {
	Read(context.Context, SkillFileReference) ([]byte, error)
}
