package dto

// AgentLifecycleState describes the committed metadata state. It deliberately
// contains neither the mutable draft nor any immutable configuration content.
type AgentLifecycleState struct {
	ID               string  `json:"id"`
	Status           string  `json:"status"`
	Revision         int64   `json:"revision"`
	CurrentVersionID *string `json:"current_version_id"`
	ArchivedAt       *int64  `json:"archived_at"`
}
