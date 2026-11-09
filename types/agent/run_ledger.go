package agent

// ModelCallReservationIntent is an internal command from a trusted admission
// adapter. It is neither client JSON nor a payment or model-dispatch permit.
// The storage transaction rechecks durable Run/Step/version and lease facts.
type ModelCallReservationIntent struct {
	Identity            ModelCallIdentity     `json:"-"`
	LeaseOwner          string                `json:"-"`
	ExpectedRunRevision int64                 `json:"-"`
	ModelName           string                `json:"-"`
	ConfigHash          string                `json:"-"`
	PricingSnapshotHash string                `json:"-"`
	Limits              ModelCallLedgerLimits `json:"-"`
	UpperBoundQuota     int64                 `json:"-"`
	MaxOutputTokens     uint64                `json:"-"`
	ExecutionBudgetMS   int64                 `json:"-"`
	QuoteExpiresAt      int64                 `json:"-"`
	ValidUntil          int64                 `json:"-"`
	EventKey            string                `json:"-"`
}

type ModelCallLedgerLimits struct {
	MaxCostQuota      int64  `json:"-"`
	MaxModelCalls     int64  `json:"-"`
	MaxToolCalls      int64  `json:"-"`
	MaxSteps          int64  `json:"-"`
	MaxOutputTokens   uint64 `json:"-"`
	ExecutionBudgetMS int64  `json:"-"`
}

type ModelCallLedgerCommand struct {
	Identity   ModelCallIdentity `json:"-"`
	LeaseOwner string            `json:"-"`
	EventKey   string            `json:"-"`
}

type ModelCallLedgerResult struct {
	ReservationID    int64  `json:"-"`
	GatewayCallID    int64  `json:"-"`
	StepID           int64  `json:"-"`
	RunRevision      int64  `json:"-"`
	EventID          int64  `json:"-"`
	EventSeq         int64  `json:"-"`
	OutboxID         int64  `json:"-"`
	State            string `json:"-"`
	ReservationState string `json:"-"`
	ReservedQuota    int64  `json:"-"`
	Replayed         bool   `json:"-"`
}
