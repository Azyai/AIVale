package application

import (
	"context"

	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

// JournalRepository is an internal durable-facts port, separate from management
// metadata admission, worker authentication and Run lease acquisition.
type JournalRepository interface {
	InitializeQueued(context.Context, agenttypes.AgentRunJournalScope, int64, string) (agenttypes.AgentRunJournalResult, error)
	EnsurePendingStep(context.Context, agenttypes.AgentRunJournalFence, agenttypes.AgentRunPendingStepIntent, string) (agenttypes.AgentRunJournalResult, error)
	AppendReferenceEvent(context.Context, agenttypes.AgentRunJournalFence, string, string, *int64) (agenttypes.AgentRunJournalResult, error)
}

func InitializeQueued(ctx context.Context, repo JournalRepository, scope agenttypes.AgentRunJournalScope, revision int64, eventKey string) (agenttypes.AgentRunJournalResult, error) {
	if ctx == nil || repo == nil {
		return agenttypes.AgentRunJournalResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return repo.InitializeQueued(ctx, scope, revision, eventKey)
}

func EnsurePendingStep(ctx context.Context, repo JournalRepository, fence agenttypes.AgentRunJournalFence, intent agenttypes.AgentRunPendingStepIntent, eventKey string) (agenttypes.AgentRunJournalResult, error) {
	if ctx == nil || repo == nil {
		return agenttypes.AgentRunJournalResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return repo.EnsurePendingStep(ctx, fence, intent, eventKey)
}

func AppendReferenceEvent(ctx context.Context, repo JournalRepository, fence agenttypes.AgentRunJournalFence, eventKey, eventType string, stepID *int64) (agenttypes.AgentRunJournalResult, error) {
	if ctx == nil || repo == nil {
		return agenttypes.AgentRunJournalResult{}, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	return repo.AppendReferenceEvent(ctx, fence, eventKey, eventType, stepID)
}

// ClaimedWakeup carries a delivery fence, not a Run lease. Its opaque receipt
// is interpreted only by the repository that created it.
type ClaimedWakeup struct {
	Wakeup  agenttypes.AgentRunWakeup `json:"-"`
	Receipt any                       `json:"-"`
}

type RunNotificationRepository interface {
	ClaimNotification(context.Context, string, int64) (*ClaimedWakeup, error)
	AckNotification(context.Context, *ClaimedWakeup) error
	RetryNotification(context.Context, *ClaimedWakeup) error
}

type RunWakeupPublisher interface {
	PublishRunWakeup(context.Context, agenttypes.AgentRunWakeup) error
}

// DeliverNextNotification is explicit and is not registered as a background
// worker. SQL is the source of truth; Redis or another publisher only wakes a
// consumer. Delivery is at least once: publishing and acknowledgement cannot be
// one distributed transaction, so consumers must dedupe durable logical keys.
func DeliverNextNotification(ctx context.Context, repo RunNotificationRepository, publisher RunWakeupPublisher, owner string) (bool, error) {
	if ctx == nil || repo == nil || publisher == nil {
		return false, agenttypes.NewError(agenttypes.InternalError, nil)
	}
	claimed, err := repo.ClaimNotification(ctx, owner, 30000)
	if err != nil || claimed == nil {
		return false, err
	}
	if err := publisher.PublishRunWakeup(ctx, claimed.Wakeup); err != nil {
		if retryErr := repo.RetryNotification(ctx, claimed); retryErr != nil {
			return true, retryErr
		}
		return true, agenttypes.NewError(agenttypes.DependencyUnavailable, nil)
	}
	return true, repo.AckNotification(ctx, claimed)
}
