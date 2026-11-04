package dto

// AgentWorkspaceMember contains only the public, explicit grant projection.
type AgentWorkspaceMember struct {
	UserID    string `json:"user_id"`
	Role      string `json:"role"`
	Status    string `json:"status"`
	Revision  int64  `json:"revision"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

type AgentWorkspaceMemberRemoval struct {
	UserID  string `json:"user_id"`
	Revoked bool   `json:"revoked"`
}
