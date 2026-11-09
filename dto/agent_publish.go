package dto

// AgentPublishedVersion is the immutable publication receipt. Configuration
// content and internal actor/tenant facts are not part of this response.
type AgentPublishedVersion struct {
	ID                  string `json:"id"`
	AgentID             string `json:"agent_id"`
	VersionNo           int64  `json:"version_no"`
	VersionKind         string `json:"version_kind"`
	SourceDraftRevision int64  `json:"source_draft_revision"`
	ConfigHash          string `json:"config_hash"`
	PublishedAt         int64  `json:"published_at"`
}
