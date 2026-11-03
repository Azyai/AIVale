package dto

// AgentWorkspaceSummary is the explicit public metadata projection. Tenant,
// actor IDs, execution budgets and policy JSON are deliberately not part of it.
type AgentWorkspaceSummary struct {
	ID                   string   `json:"id"`
	Slug                 string   `json:"slug"`
	Name                 string   `json:"name"`
	Status               string   `json:"status"`
	CurrentRole          string   `json:"current_role"`
	CreatedAt            int64    `json:"created_at"`
	UpdatedAt            int64    `json:"updated_at"`
	Revision             int64    `json:"revision"`
	EffectivePermissions []string `json:"effective_permissions"`
}

type AgentWorkspaceDetail struct {
	AgentWorkspaceSummary
	Description string `json:"description"`
}

type AgentWorkspaceList struct {
	Items       []AgentWorkspaceSummary `json:"items"`
	Total       int64                   `json:"total"`
	Page        int64                   `json:"page"`
	PageSize    int                     `json:"page_size"`
	EmptyReason *string                 `json:"empty_reason"`
}
