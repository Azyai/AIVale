package dto

import agenttypes "github.com/QuantumNous/new-api/types/agent"

type AgentVersionSummary struct {
	ID                  string `json:"id"`
	AgentID             string `json:"agent_id"`
	VersionNo           int64  `json:"version_no"`
	VersionKind         string `json:"version_kind"`
	SourceDraftRevision int64  `json:"source_draft_revision"`
	ConfigHash          string `json:"config_hash"`
	PublishedAt         int64  `json:"published_at"`
	RevokedAt           *int64 `json:"revoked_at"`
	PublishedBy         string `json:"published_by"`
}

// This summary describes verification performed while reading this snapshot,
// not current model eligibility, execution readiness or a past validation run.
type AgentVersionValidationSummary struct {
	SchemaVersion      int  `json:"schema_version"`
	ConfigHashVerified bool `json:"config_hash_verified"`
}

type AgentVersionDetail struct {
	AgentVersionSummary
	Config            *agenttypes.AgentConfig       `json:"config"`
	ReleaseNote       string                        `json:"release_note"`
	ValidationSummary AgentVersionValidationSummary `json:"validation_summary"`
}
