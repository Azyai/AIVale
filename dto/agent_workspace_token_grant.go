package dto

// AgentWorkspaceTokenGrant exposes grant metadata, never the underlying Key.
type AgentWorkspaceTokenGrant struct {
	ID           string `json:"id"`
	TokenID      string `json:"token_id"`
	Scope        string `json:"scope"`
	ResourceType string `json:"resource_type"`
	ResourceID   string `json:"resource_id"`
	Status       string `json:"status"`
	ExpiresAt    *int64 `json:"expires_at"`
	Revision     int64  `json:"revision"`
	CreatedAt    int64  `json:"created_at"`
	UpdatedAt    int64  `json:"updated_at"`
	RevokedAt    *int64 `json:"revoked_at"`
}

type AgentWorkspaceTokenGrantRevocation struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	Revision  int64  `json:"revision"`
	RevokedAt int64  `json:"revoked_at"`
}
