package dto

// AgentDefinitionSummary contains only metadata authorized by agent:read.
type AgentDefinitionSummary struct {
	ID                   string   `json:"id"`
	Slug                 string   `json:"slug"`
	Name                 string   `json:"name"`
	Kind                 string   `json:"kind"`
	Status               string   `json:"status"`
	Tags                 []string `json:"tags"`
	CurrentVersionID     *string  `json:"current_version_id"`
	CreatedAt            int64    `json:"created_at"`
	UpdatedAt            int64    `json:"updated_at"`
	EffectivePermissions []string `json:"effective_permissions"`
}

type AgentDefinitionDetail struct {
	AgentDefinitionSummary
	Description   string `json:"description"`
	Revision      int64  `json:"revision"`
	DraftRevision int64  `json:"draft_revision"`
}
