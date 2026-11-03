package dto

// AgentWorkspaceCreateReceipt is an immutable creation acknowledgement, not a
// snapshot of the current mutable workspace name, description or permissions.
type AgentWorkspaceCreateReceipt struct {
	ID        string `json:"id"`
	Slug      string `json:"slug"`
	Status    string `json:"status"`
	Revision  int64  `json:"revision"`
	CreatedAt int64  `json:"created_at"`
}

type AgentWorkspaceArchiveReceipt struct {
	ID               string `json:"id"`
	Status           string `json:"status"`
	Revision         int64  `json:"revision"`
	ArchivedAt       int64  `json:"archived_at"`
	BlockingRunCount int    `json:"blocking_run_count"`
}
