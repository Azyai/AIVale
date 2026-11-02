package model

// AgentScope carries server-resolved resource ownership. These identifiers are
// not proof of authorization; callers must verify membership and resource
// access before binding a scope. This value object is not an ORM model.
type AgentScope struct {
	TeamID      int64 `json:"-"`
	WorkspaceID int64 `json:"-"`
}
