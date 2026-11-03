package model

import (
	"errors"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	sqlitedriver "github.com/glebarez/go-sqlite"
	"github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

// AgentWorkspaceWriteFacts 仅在本次短事务及其行锁有效期间使用，不是可缓存授权。
type AgentWorkspaceWriteFacts struct {
	UserID          int64                 `json:"-"`
	ActorRole       int                   `json:"-"`
	TeamID          int64                 `json:"-"`
	TeamOwnerUserID int64                 `json:"-"`
	TeamMemberRole  string                `json:"-"`
	Workspace       *AgentWorkspace       `json:"-"`
	Member          *AgentWorkspaceMember `json:"-"`
}

// WithAgentWorkspaceWriteFacts 按User、Session、TeamMember、Team、Workspace、成员
// 的固定顺序锁定当前事实。只对已确认回滚的忙/死锁冲突重试整个事务，提交错误不重试。
func WithAgentWorkspaceWriteFacts(db *gorm.DB, identity AuthSessionIdentity, workspaceID int64, apply func(*gorm.DB, *AgentWorkspaceWriteFacts) error) error {
	if db == nil || db.Config == nil || db.Statement == nil || db.Statement.ConnPool == nil || apply == nil || workspaceID < 0 {
		return ErrAgentWorkspaceInvalid
	}
	if _, transactional := db.Statement.ConnPool.(gorm.TxCommitter); transactional {
		return ErrAgentWorkspaceInvalid
	}
	if identity.UserID <= 0 || identity.SessionID == "" || len(identity.SessionID) > 64 || strings.HasPrefix(identity.SessionID, "pat:") || identity.UserAuthVersion <= 0 || identity.SessionVersion <= 0 {
		return ErrUserSessionInactive
	}
	ctx := db.Statement.Context
	for attempt := range 3 {
		rolledBack, err := agentWorkspaceWriteAttempt(db, identity, workspaceID, apply)
		if err == nil || !rolledBack || !agentWorkspaceWriteRetryable(err) || attempt == 2 {
			return err
		}
		timer := time.NewTimer(time.Duration(attempt+1) * 10 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
	return ErrAgentWorkspaceInvalid
}

func agentWorkspaceWriteAttempt(db *gorm.DB, identity AuthSessionIdentity, workspaceID int64, apply func(*gorm.DB, *AgentWorkspaceWriteFacts) error) (bool, error) {
	tx := db.Begin()
	if tx.Error != nil {
		return false, tx.Error
	}
	finished := false
	defer func() {
		if !finished {
			_ = tx.Rollback().Error // panic/cancellation cleanup never authorizes retry.
		}
	}()
	facts, err := lockAgentWorkspaceWriteFacts(tx, identity, workspaceID)
	if err == nil {
		err = apply(tx, facts)
	}
	if err != nil {
		rollbackErr := tx.Rollback().Error
		finished = true
		if rollbackErr != nil {
			return false, errors.Join(err, rollbackErr)
		}
		return true, err
	}
	// A transport/driver error from COMMIT may conceal a committed transaction.
	// The caller may retry with its persisted key, but this loop must not replay it.
	err = tx.Commit().Error
	finished = true
	return false, err
}

func lockAgentWorkspaceWriteFacts(tx *gorm.DB, identity AuthSessionIdentity, workspaceID int64) (*AgentWorkspaceWriteFacts, error) {
	var user User
	err := lockForUpdate(tx).Select("id", "role", "status", "auth_version").First(&user, identity.UserID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrUserSessionInactive
	}
	if err != nil {
		return nil, err
	}
	if user.Status != common.UserStatusEnabled || user.AuthVersion != identity.UserAuthVersion || !common.IsValidateRole(user.Role) {
		return nil, ErrUserSessionInactive
	}
	var session UserSession
	err = lockForUpdate(tx).Select("sid", "user_id", "version", "user_auth_version", "status", "revoked_at", "expires_at").
		Where(agentWorkspaceExactColumn(tx, "sid")+" = ? AND user_id = ?", identity.SessionID, identity.UserID).Take(&session).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrUserSessionInactive
	}
	if err != nil {
		return nil, err
	}
	if session.SID != identity.SessionID || session.Status != UserSessionStatusActive || session.RevokedAt != 0 || session.ExpiresAt <= time.Now().Unix() || session.Version != identity.SessionVersion || session.UserAuthVersion != identity.UserAuthVersion {
		return nil, ErrUserSessionInactive
	}
	facts := &AgentWorkspaceWriteFacts{UserID: int64(user.Id), ActorRole: user.Role}
	var membership TeamMember
	err = lockForUpdate(tx).Where("user_id = ?", identity.UserID).Take(&membership).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return facts, nil
	}
	if err != nil {
		return nil, err
	}
	var team Team
	err = lockForUpdate(tx).Select("id", "owner_user_id").Where("id = ?", membership.TeamId).Take(&team).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return facts, nil
	}
	if err != nil {
		return nil, err
	}
	facts.TeamID, facts.TeamOwnerUserID, facts.TeamMemberRole = int64(team.Id), int64(team.OwnerUserId), membership.Role
	if workspaceID > 0 {
		if err := LockAgentWorkspaceWriteTarget(tx, facts, workspaceID); err != nil {
			return nil, err
		}
	}
	return facts, nil
}

// LockAgentWorkspaceWriteTarget 用于创建幂等重放时锁定结果对象；此前必须已锁主体/Team。
func LockAgentWorkspaceWriteTarget(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, workspaceID int64) error {
	if tx == nil || facts == nil || facts.TeamID <= 0 || facts.UserID <= 0 || workspaceID <= 0 {
		return gorm.ErrRecordNotFound
	}
	var workspace AgentWorkspace
	err := lockForUpdate(tx).Select("id", "team_id", "slug", "name", "description", "status", "created_at", "updated_at", "revision", "archived_at", "active_run_count").
		Where("team_id = ? AND id = ?", facts.TeamID, workspaceID).Take(&workspace).Error
	if err != nil {
		return err
	}
	facts.Workspace = &workspace
	var member AgentWorkspaceMember
	err = lockForUpdate(tx).Where("team_id = ? AND workspace_id = ? AND user_id = ?", facts.TeamID, workspaceID, facts.UserID).Take(&member).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	facts.Member = &member
	return nil
}

func agentWorkspaceWriteRetryable(err error) bool {
	var mysqlError *mysql.MySQLError
	if errors.As(err, &mysqlError) {
		return mysqlError.Number == 1205 || mysqlError.Number == 1213
	}
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) {
		return postgresError.Code == "40001" || postgresError.Code == "40P01"
	}
	var sqliteError *sqlitedriver.Error
	return errors.As(err, &sqliteError) && (sqliteError.Code()&255 == 5 || sqliteError.Code()&255 == 6)
}

// AgentUniqueConstraint 仅识别实际数据库唯一冲突，不向客户公开驱动文本。
func AgentUniqueConstraint(err error) bool {
	var mysqlError *mysql.MySQLError
	if errors.As(err, &mysqlError) {
		return mysqlError.Number == 1062
	}
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) {
		return postgresError.Code == "23505"
	}
	var sqliteError *sqlitedriver.Error
	return errors.As(err, &sqliteError) && (sqliteError.Code() == 2067 || sqliteError.Code() == 1555)
}

// AgentWorkspaceArchiveDependenciesAvailable 只承诺当前无运行域表的阶段。
// 未来运行/触发表出现前必须接入真实排空协议；目录读取失败绝不视作表不存在。
func AgentWorkspaceArchiveDependenciesAvailable(db *gorm.DB) (bool, error) {
	tables, err := db.Migrator().GetTables()
	if err != nil {
		return false, err
	}
	for _, table := range tables {
		if strings.EqualFold(table, "ag_runs") || strings.EqualFold(table, "ag_schedules") || strings.EqualFold(table, "ag_schedule_fires") {
			return false, nil
		}
	}
	return true, nil
}
