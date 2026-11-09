package model

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"slices"
	"strconv"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	ErrAgentRunNotificationInvalid  = errors.New("invalid agent run notification")
	ErrAgentRunNotificationConflict = errors.New("agent run notification delivery conflict")
)

const agentRunNotificationMaxAttempts = 5

// AgentRunNotification contains durable references only. Receiving it is a wakeup,
// never authorization to execute a Run or an external operation.
type AgentRunNotification struct {
	SchemaVersion int     `json:"schema_version"`
	RunID         string  `json:"run_id"`
	EventID       string  `json:"event_id"`
	EventSeq      int64   `json:"event_seq"`
	StepID        *string `json:"step_id,omitempty"`
}

func agentRunNotificationKindValid(kind string) bool {
	return kind == AgentOutboxKindRunReady || kind == AgentOutboxKindRunEvent
}

func agentRunNotificationEventKey(kind string, event *AgentRunEvent) string {
	digest := sha256.Sum256([]byte("agent-run-notification\x00" + kind + "\x00" + strconv.FormatInt(event.RunID, 10) + "\x00" + event.EventKey))
	return hex.EncodeToString(digest[:])
}

func decodeAgentRunNotification(encoded string) (AgentRunNotification, error) {
	var payload AgentRunNotification
	if len(encoded) == 0 || len(encoded) > 16*1024 || !utf8.ValidString(encoded) {
		return payload, ErrAgentRunNotificationInvalid
	}
	fields, err := common.UnmarshalJSONObjectStrict([]byte(encoded))
	if err != nil || len(fields) < 4 || len(fields) > 5 {
		return payload, ErrAgentRunNotificationInvalid
	}
	for name := range fields {
		if !slices.Contains([]string{"schema_version", "run_id", "event_id", "event_seq", "step_id"}, name) {
			return payload, ErrAgentRunNotificationInvalid
		}
	}
	if err := common.UnmarshalJsonStr(encoded, &payload); err != nil || payload.SchemaVersion != 1 || payload.EventSeq < 1 || payload.EventSeq > agentDefinitionMaxInteger {
		return payload, ErrAgentRunNotificationInvalid
	}
	ids := []string{payload.RunID, payload.EventID}
	if _, present := fields["step_id"]; present {
		if payload.StepID == nil {
			return payload, ErrAgentRunNotificationInvalid
		}
		ids = append(ids, *payload.StepID)
	}
	for _, id := range ids {
		parsed, err := strconv.ParseInt(id, 10, 64)
		if err != nil || parsed <= 0 || strconv.FormatInt(parsed, 10) != id {
			return payload, ErrAgentRunNotificationInvalid
		}
	}
	return payload, nil
}

// validateAgentRunNotification reads persisted references without acquiring a Run
// lease. A delivery lease protects only the notification, not runtime admission.
func validateAgentRunNotification(tx *gorm.DB, notification *AgentOutbox) error {
	if tx == nil || tx.Config == nil || tx.Dialector == nil || tx.Statement == nil || tx.Statement.ConnPool == nil || notification == nil ||
		!agentRunNotificationKindValid(notification.Kind) || notification.TeamID <= 0 || notification.WorkspaceID <= 0 ||
		notification.AggregateType != "run" || notification.AggregateID <= 0 || !agentDigestValid(notification.EventKey) {
		return ErrAgentRunNotificationInvalid
	}
	payload, err := decodeAgentRunNotification(notification.PayloadJSON)
	if err != nil || payload.RunID != strconv.FormatInt(notification.AggregateID, 10) {
		return ErrAgentRunNotificationInvalid
	}
	eventID, _ := strconv.ParseInt(payload.EventID, 10, 64)
	readDB := tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard})
	var event AgentRunEvent
	if err := readDB.Where("id = ? AND team_id = ? AND workspace_id = ? AND run_id = ?", eventID, notification.TeamID, notification.WorkspaceID, notification.AggregateID).Take(&event).Error; err != nil {
		return err
	}
	if event.Seq != payload.EventSeq || !agentDigestValid(event.EventKey) || notification.EventKey != agentRunNotificationEventKey(notification.Kind, &event) ||
		(event.StepID == nil) != (payload.StepID == nil) || event.StepID != nil && *payload.StepID != strconv.FormatInt(*event.StepID, 10) {
		return ErrAgentRunNotificationInvalid
	}
	if notification.Kind == AgentOutboxKindRunReady && (event.EventType != "run.queued" || event.Seq != 1 || event.StepID != nil) {
		return ErrAgentRunNotificationInvalid
	}
	var run AgentRun
	if err := readDB.Where("id = ? AND team_id = ? AND workspace_id = ?", event.RunID, notification.TeamID, notification.WorkspaceID).Take(&run).Error; err != nil {
		return err
	}
	if !AgentRunExecutionSnapshotValid(&run) || event.Seq > run.LastEventSeq {
		return ErrAgentRunNotificationInvalid
	}
	if event.StepID != nil {
		var step AgentRunStep
		if err := readDB.Where("id = ? AND team_id = ? AND workspace_id = ? AND run_id = ?", *event.StepID, notification.TeamID, notification.WorkspaceID, event.RunID).Take(&step).Error; err != nil {
			return err
		}
	}
	return nil
}

func prepareAgentRunNotification(tx *gorm.DB, notification *AgentOutbox) error {
	if notification == nil || notification.ID != 0 || notification.Status != "pending" || notification.Attempts != 0 ||
		notification.LeaseOwner != nil || notification.LeaseExpiresAt != nil || notification.DeliveredAt != nil || notification.LastErrorCode != nil ||
		tx == nil || tx.Config == nil || tx.Dialector == nil || tx.Statement == nil {
		return ErrAgentRunNotificationInvalid
	}
	if _, transactional := tx.Statement.ConnPool.(gorm.TxCommitter); !transactional {
		return ErrAgentRunNotificationInvalid
	}
	if _, upsert := tx.Statement.Clauses["ON CONFLICT"]; upsert {
		return ErrAgentRunNotificationInvalid
	}
	if err := validateAgentRunNotification(tx, notification); err != nil {
		return err
	}
	now := time.Now().UnixMilli()
	if now < 1 || now > agentDefinitionMaxInteger {
		return ErrAgentRunNotificationInvalid
	}
	notification.CreatedAt, notification.UpdatedAt, notification.Revision, notification.AvailableAt = now, now, 1, now
	return nil
}

// EnqueueAgentRunNotification participates in the caller's business transaction.
// The stable kind/event key returns the original notification on repeated calls.
func EnqueueAgentRunNotification(tx *gorm.DB, event *AgentRunEvent, kind string) (*AgentOutbox, error) {
	if tx == nil || tx.Config == nil || tx.Dialector == nil || tx.Statement == nil || tx.Statement.ConnPool == nil || event == nil || event.ID <= 0 ||
		event.TeamID <= 0 || event.WorkspaceID <= 0 || event.RunID <= 0 || !agentRunNotificationKindValid(kind) {
		return nil, ErrAgentRunNotificationInvalid
	}
	if _, transactional := tx.Statement.ConnPool.(gorm.TxCommitter); !transactional {
		return nil, ErrAgentRunNotificationInvalid
	}
	writeDB := tx.Session(&gorm.Session{NewDB: true, Logger: logger.Discard})
	var run AgentRun
	if err := lockForUpdate(writeDB).Where("id = ? AND team_id = ? AND workspace_id = ?", event.RunID, event.TeamID, event.WorkspaceID).Take(&run).Error; err != nil {
		return nil, err
	}
	var stored AgentRunEvent
	if err := writeDB.Where("id = ? AND team_id = ? AND workspace_id = ? AND run_id = ?", event.ID, event.TeamID, event.WorkspaceID, event.RunID).Take(&stored).Error; err != nil {
		return nil, err
	}
	if stored.Seq != event.Seq || stored.EventKey != event.EventKey || stored.EventType != event.EventType ||
		(stored.StepID == nil) != (event.StepID == nil) || stored.StepID != nil && *stored.StepID != *event.StepID || !AgentRunExecutionSnapshotValid(&run) {
		return nil, ErrAgentRunNotificationInvalid
	}
	payload := AgentRunNotification{SchemaVersion: 1, RunID: strconv.FormatInt(stored.RunID, 10), EventID: strconv.FormatInt(stored.ID, 10), EventSeq: stored.Seq}
	if stored.StepID != nil {
		stepID := strconv.FormatInt(*stored.StepID, 10)
		payload.StepID = &stepID
	}
	encoded, err := common.Marshal(payload)
	if err != nil {
		return nil, err
	}
	notification := AgentOutbox{TeamID: stored.TeamID, WorkspaceID: stored.WorkspaceID, EventKey: agentRunNotificationEventKey(kind, &stored),
		Kind: kind, AggregateType: "run", AggregateID: stored.RunID, PayloadJSON: string(encoded), Status: "pending"}
	var existing AgentOutbox
	err = writeDB.Where(agentWorkspaceExactColumn(writeDB, "event_key")+" = ?", notification.EventKey).Take(&existing).Error
	if err == nil {
		if existing.TeamID != notification.TeamID || existing.WorkspaceID != notification.WorkspaceID || existing.Kind != notification.Kind ||
			existing.AggregateType != notification.AggregateType || existing.AggregateID != notification.AggregateID || existing.PayloadJSON != notification.PayloadJSON {
			return nil, ErrAgentRunNotificationConflict
		}
		if err := validateAgentRunNotification(writeDB, &existing); err != nil {
			return nil, err
		}
		return &existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if err := writeDB.Create(&notification).Error; err != nil {
		return nil, err
	}
	return &notification, nil
}

func agentRunNotificationOwnerValid(owner string) bool {
	if len(owner) < 1 || len(owner) > 96 {
		return false
	}
	for _, char := range owner {
		if char < '!' || char > '~' {
			return false
		}
	}
	return true
}

func agentRunNotificationDeliveryStateValid(notification *AgentOutbox) bool {
	if notification == nil || notification.ID <= 0 || notification.Revision < 1 || notification.Revision >= agentDefinitionMaxInteger ||
		notification.Attempts < 0 || notification.Attempts > agentRunNotificationMaxAttempts || notification.AvailableAt < 1 ||
		notification.AvailableAt > agentDefinitionMaxInteger || notification.LastErrorCode != nil && *notification.LastErrorCode != "delivery_failed" {
		return false
	}
	switch notification.Status {
	case "pending", "dead":
		return notification.LeaseOwner == nil && notification.LeaseExpiresAt == nil && notification.DeliveredAt == nil
	case "delivering":
		return notification.Attempts > 0 && notification.LeaseOwner != nil && agentRunNotificationOwnerValid(*notification.LeaseOwner) &&
			notification.LeaseExpiresAt != nil && *notification.LeaseExpiresAt > 0 && *notification.LeaseExpiresAt <= agentDefinitionMaxInteger && notification.DeliveredAt == nil
	case "delivered":
		return notification.LeaseOwner == nil && notification.LeaseExpiresAt == nil && notification.DeliveredAt != nil && *notification.DeliveredAt > 0
	default:
		return false
	}
}

// ClaimAgentRunNotification acquires only a delivery lease. Expired claims can be
// taken over; every takeover increments revision and attempts before returning.
func ClaimAgentRunNotification(ctx context.Context, db *gorm.DB, owner string, leaseMS int64) (*AgentOutbox, error) {
	if ctx == nil || db == nil || db.Config == nil || db.Dialector == nil || db.Statement == nil || db.Statement.ConnPool == nil ||
		!agentRunNotificationOwnerValid(owner) || leaseMS < 1 || leaseMS > 60000 {
		return nil, ErrAgentRunNotificationInvalid
	}
	var claimed *AgentOutbox
	err := WithAgentRunJournal(db.WithContext(ctx), func(tx *gorm.DB) error {
		claimed = nil
		for range 100 {
			now := time.Now().UnixMilli()
			if now < 1 || now > agentDefinitionMaxInteger-60000 {
				return ErrAgentRunNotificationInvalid
			}
			var candidate AgentOutbox
			err := lockForUpdate(tx).Where(agentWorkspaceExactColumn(tx, "kind")+" IN ? AND (("+agentWorkspaceExactColumn(tx, "status")+" = ? AND available_at <= ?) OR ("+agentWorkspaceExactColumn(tx, "status")+" = ? AND lease_expires_at <= ?))",
				[]string{AgentOutboxKindRunReady, AgentOutboxKindRunEvent}, "pending", now, "delivering", now).Order("id ASC").Take(&candidate).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			if err != nil {
				return err
			}
			// Reserve one revision for this claim and one for its acknowledgement
			// or failure record; never return a claim that cannot be finished.
			if !agentRunNotificationDeliveryStateValid(&candidate) || candidate.Revision >= agentDefinitionMaxInteger-1 {
				return ErrAgentRunNotificationInvalid
			}
			if err := validateAgentRunNotification(tx, &candidate); err != nil {
				return err
			}
			// SELECT or reference reads can wait for another transaction. Start the
			// lease from the current time after those waits, not the query cutoff.
			now = time.Now().UnixMilli()
			if now < 1 || now > agentDefinitionMaxInteger-60000 {
				return ErrAgentRunNotificationInvalid
			}
			updates := map[string]any{"updated_at": now, "revision": candidate.Revision + 1}
			if candidate.Attempts >= agentRunNotificationMaxAttempts {
				updates["status"], updates["lease_owner"], updates["lease_expires_at"], updates["last_error_code"] = "dead", nil, nil, "delivery_failed"
			} else {
				updates["status"], updates["lease_owner"], updates["lease_expires_at"], updates["attempts"] = "delivering", owner, now+leaseMS, candidate.Attempts+1
			}
			query := tx.Session(&gorm.Session{SkipHooks: true}).Model(&AgentOutbox{}).
				Where("id = ? AND team_id = ? AND workspace_id = ? AND revision = ? AND "+agentWorkspaceExactColumn(tx, "kind")+" = ? AND "+agentWorkspaceExactColumn(tx, "status")+" = ?",
					candidate.ID, candidate.TeamID, candidate.WorkspaceID, candidate.Revision, candidate.Kind, candidate.Status)
			if candidate.Status == "pending" {
				query = query.Where("available_at <= ? AND lease_owner IS NULL AND lease_expires_at IS NULL", now)
			} else {
				query = query.Where(agentWorkspaceExactColumn(tx, "lease_owner")+" = ? AND lease_expires_at = ? AND lease_expires_at <= ?", *candidate.LeaseOwner, *candidate.LeaseExpiresAt, now)
			}
			changed := query.Updates(updates)
			if changed.Error != nil {
				return changed.Error
			}
			if changed.RowsAffected != 1 {
				return ErrAgentRunNotificationConflict
			}
			if candidate.Attempts >= agentRunNotificationMaxAttempts {
				continue
			}
			candidate.Status, candidate.Attempts, candidate.Revision, candidate.UpdatedAt = "delivering", candidate.Attempts+1, candidate.Revision+1, now
			expiresAt := now + leaseMS
			candidate.LeaseOwner, candidate.LeaseExpiresAt = &owner, &expiresAt
			claimed = &candidate
			return nil
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if claimed == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return claimed, nil
}

// AckAgentRunNotification confirms a still-current claim after delivery. A crash
// before this commit intentionally leaves the same durable notification eligible
// for redelivery, so the recipient must deduplicate its business operation.
func AckAgentRunNotification(ctx context.Context, db *gorm.DB, claimed *AgentOutbox) error {
	return finishAgentRunNotification(ctx, db, claimed, false)
}

// RetryAgentRunNotification records only a fixed failure code and bounded delay;
// it does not store error text, invoke a model, or create another logical event.
func RetryAgentRunNotification(ctx context.Context, db *gorm.DB, claimed *AgentOutbox) error {
	return finishAgentRunNotification(ctx, db, claimed, true)
}

func finishAgentRunNotification(ctx context.Context, db *gorm.DB, claimed *AgentOutbox, retry bool) error {
	if ctx == nil || db == nil || db.Config == nil || db.Dialector == nil || db.Statement == nil || db.Statement.ConnPool == nil ||
		!agentRunNotificationDeliveryStateValid(claimed) || claimed.Status != "delivering" || !agentRunNotificationKindValid(claimed.Kind) {
		return ErrAgentRunNotificationInvalid
	}
	return WithAgentRunJournal(db.WithContext(ctx), func(tx *gorm.DB) error {
		now := time.Now().UnixMilli()
		if now < 1 || now > agentDefinitionMaxInteger-60000 {
			return ErrAgentRunNotificationInvalid
		}
		predicate := "id = ? AND team_id = ? AND workspace_id = ? AND revision = ? AND attempts = ? AND " + agentWorkspaceExactColumn(tx, "kind") + " = ? AND " +
			agentWorkspaceExactColumn(tx, "status") + " = ? AND " + agentWorkspaceExactColumn(tx, "lease_owner") + " = ? AND lease_expires_at = ? AND lease_expires_at > ?"
		args := []any{claimed.ID, claimed.TeamID, claimed.WorkspaceID, claimed.Revision, claimed.Attempts, claimed.Kind, "delivering", *claimed.LeaseOwner, *claimed.LeaseExpiresAt, now}
		var stored AgentOutbox
		if err := lockForUpdate(tx).Where(predicate, args...).Take(&stored).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAgentRunNotificationConflict
			}
			return err
		}
		if !agentRunNotificationDeliveryStateValid(&stored) {
			return ErrAgentRunNotificationInvalid
		}
		if err := validateAgentRunNotification(tx, &stored); err != nil {
			return err
		}
		now = time.Now().UnixMilli()
		if now < 1 || now > agentDefinitionMaxInteger-60000 {
			return ErrAgentRunNotificationInvalid
		}
		if *stored.LeaseExpiresAt <= now {
			return ErrAgentRunNotificationConflict
		}
		args[len(args)-1] = now
		updates := map[string]any{"status": "delivered", "delivered_at": now, "last_error_code": nil, "lease_owner": nil, "lease_expires_at": nil,
			"revision": stored.Revision + 1, "updated_at": now}
		if retry {
			updates["status"], updates["delivered_at"], updates["last_error_code"] = "pending", nil, "delivery_failed"
			if stored.Attempts >= agentRunNotificationMaxAttempts {
				updates["status"] = "dead"
			} else {
				delay := min(int64(1000)<<(stored.Attempts-1), int64(60000))
				updates["available_at"] = now + delay
			}
		}
		changed := tx.Session(&gorm.Session{SkipHooks: true}).Model(&AgentOutbox{}).Where(predicate, args...).Updates(updates)
		if changed.Error != nil {
			return changed.Error
		}
		if changed.RowsAffected != 1 {
			return ErrAgentRunNotificationConflict
		}
		return nil
	})
}

// ReplayAgentRunNotification explicitly opens a new bounded delivery cycle for a
// dead notification, preserving the original business key and reference payload.
func ReplayAgentRunNotification(ctx context.Context, db *gorm.DB, id, revision int64) error {
	if ctx == nil || db == nil || db.Config == nil || db.Dialector == nil || db.Statement == nil || db.Statement.ConnPool == nil ||
		id <= 0 || revision < 1 || revision > agentDefinitionMaxInteger-3 {
		return ErrAgentRunNotificationInvalid
	}
	return WithAgentRunJournal(db.WithContext(ctx), func(tx *gorm.DB) error {
		var stored AgentOutbox
		if err := lockForUpdate(tx).Where("id = ? AND revision = ? AND "+agentWorkspaceExactColumn(tx, "kind")+" IN ? AND "+agentWorkspaceExactColumn(tx, "status")+" = ?",
			id, revision, []string{AgentOutboxKindRunReady, AgentOutboxKindRunEvent}, "dead").Take(&stored).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAgentRunNotificationConflict
			}
			return err
		}
		if !agentRunNotificationDeliveryStateValid(&stored) {
			return ErrAgentRunNotificationInvalid
		}
		if err := validateAgentRunNotification(tx, &stored); err != nil {
			return err
		}
		now := time.Now().UnixMilli()
		if now < 1 || now > agentDefinitionMaxInteger {
			return ErrAgentRunNotificationInvalid
		}
		changed := tx.Session(&gorm.Session{SkipHooks: true}).Model(&AgentOutbox{}).
			Where("id = ? AND team_id = ? AND workspace_id = ? AND revision = ? AND "+agentWorkspaceExactColumn(tx, "kind")+" = ? AND "+agentWorkspaceExactColumn(tx, "status")+" = ?",
				stored.ID, stored.TeamID, stored.WorkspaceID, stored.Revision, stored.Kind, "dead").
			Updates(map[string]any{"status": "pending", "attempts": 0, "available_at": now, "last_error_code": nil, "lease_owner": nil, "lease_expires_at": nil,
				"delivered_at": nil, "updated_at": now, "revision": stored.Revision + 1})
		if changed.Error != nil {
			return changed.Error
		}
		if changed.RowsAffected != 1 {
			return ErrAgentRunNotificationConflict
		}
		return nil
	})
}
