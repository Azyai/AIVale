package agent

// These references belong to trusted internal adapters. They are not an HTTP
// request, worker credential, execution permit or model-call authorization.
type AgentRunJournalScope struct {
	TeamID      int64 `json:"-"`
	WorkspaceID int64 `json:"-"`
	RunID       int64 `json:"-"`
}

type AgentRunJournalFence struct {
	Scope      AgentRunJournalScope `json:"-"`
	LeaseOwner string               `json:"-"`
	LeaseEpoch int64                `json:"-"`
}

// Pending intent is immutable. T01 records the first attempt only, without
// logical-call allocation, an external request or a model dispatch.
type AgentRunPendingStepIntent struct {
	StepKey          string  `json:"-"`
	Kind             string  `json:"-"`
	ParentStepID     *int64  `json:"-"`
	InputJSON        *string `json:"-"`
	InputHash        *string `json:"-"`
	TargetRefJSON    string  `json:"-"`
	SideEffectPolicy string  `json:"-"`
	RetryPolicyJSON  string  `json:"-"`
}

type AgentRunJournalResult struct {
	RunID       int64 `json:"-"`
	RunRevision int64 `json:"-"`
	EventID     int64 `json:"-"`
	EventSeq    int64 `json:"-"`
	StepID      int64 `json:"-"`
	OutboxID    int64 `json:"-"`
	Replayed    bool  `json:"-"`
}

type AgentRunWakeup struct {
	Scope    AgentRunJournalScope `json:"-"`
	EventID  int64                `json:"-"`
	EventSeq int64                `json:"-"`
	StepID   int64                `json:"-"`
	Kind     string               `json:"-"`
}
