package model

import (
	"database/sql"
	"fmt"
	"net"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	mysqldriver "github.com/go-sql-driver/mysql"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const agentMySQLMarkerTable = "__aivale_test_environment"

// These are selected, frozen columns from v1.0.0-rc.42
// (6370b29424168039e94d40d610191e7d2e65dbf4), the closest release-tagged
// ancestor of the P00 baseline. This is a minimal compatibility projection,
// not a release database dump. The four users quota columns are explicitly
// BIGINT to make this projection compatible with the current startup guard.
// The tag's Go int fields can map to BIGINT on 64-bit GORM/MySQL deployments;
// this fixture does not prove the schema of a deployed release database or
// claim that an operator performed a quota-width migration.
// Teams and tokens.team_id did not exist in that release and are not projected.
type agentMySQLLegacyUser struct {
	Id              int
	Username        string  `gorm:"unique;index"`
	Password        string  `gorm:"not null"`
	DisplayName     string  `gorm:"index"`
	Role            int     `gorm:"type:int;default:1"`
	Status          int     `gorm:"type:int;default:1"`
	Email           string  `gorm:"index"`
	AccessToken     *string `gorm:"type:char(32);uniqueIndex"`
	Quota           int     `gorm:"type:bigint;default:0"`
	UsedQuota       int     `gorm:"type:bigint;default:0"`
	Group           string  `gorm:"type:varchar(64);default:'default'"`
	AffCode         string  `gorm:"type:varchar(32);uniqueIndex"`
	AffQuota        int     `gorm:"type:bigint;default:0"`
	AffHistoryQuota int     `gorm:"type:bigint;default:0;column:aff_history"`
	Setting         string  `gorm:"type:text"`
	AuthVersion     int64   `gorm:"type:bigint;not null;default:1"`
}

func (agentMySQLLegacyUser) TableName() string { return "users" }

type agentMySQLLegacyToken struct {
	Id           int
	UserId       int    `gorm:"index"`
	Key          string `gorm:"type:varchar(128);uniqueIndex"`
	Status       int    `gorm:"default:1"`
	Name         string `gorm:"index"`
	CreatedTime  int64  `gorm:"bigint"`
	AccessedTime int64  `gorm:"bigint"`
	ExpiredTime  int64  `gorm:"bigint;default:-1"`
	RemainQuota  int    `gorm:"default:0"`
	UsedQuota    int    `gorm:"default:0"`
	ModelLimits  string `gorm:"type:text"`
	Group        string `gorm:"default:''"`
}

func (agentMySQLLegacyToken) TableName() string { return "tokens" }

type agentMySQLLegacyChannel struct {
	Id          int
	Type        int    `gorm:"default:0"`
	Key         string `gorm:"not null"`
	Status      int    `gorm:"default:1"`
	Name        string `gorm:"index"`
	CreatedTime int64  `gorm:"bigint"`
	Models      string
	Group       string `gorm:"type:varchar(64);default:'default'"`
	UsedQuota   int64  `gorm:"bigint;default:0"`
}

func (agentMySQLLegacyChannel) TableName() string { return "channels" }

type agentMySQLLegacyLog struct {
	Id               int   `gorm:"index:idx_created_at_id,priority:2;index:idx_user_id_id,priority:2"`
	UserId           int   `gorm:"index;index:idx_user_id_id,priority:1"`
	CreatedAt        int64 `gorm:"bigint;index:idx_created_at_id,priority:1;index:idx_created_at_type"`
	Type             int   `gorm:"index:idx_created_at_type"`
	Content          string
	Username         string `gorm:"index;index:index_username_model_name,priority:2;default:''"`
	TokenName        string `gorm:"index;default:''"`
	ModelName        string `gorm:"index;index:index_username_model_name,priority:1;default:''"`
	Quota            int    `gorm:"default:0"`
	PromptTokens     int    `gorm:"default:0"`
	CompletionTokens int    `gorm:"default:0"`
	ChannelId        int    `gorm:"index"`
	TokenId          int    `gorm:"default:0;index"`
	Group            string `gorm:"index"`
	RequestId        string `gorm:"type:varchar(64);index:idx_logs_request_id;default:''"`
}

func (agentMySQLLegacyLog) TableName() string { return "logs" }

type agentMySQLTarget struct {
	dsn   string
	name  string
	runID string
}

type agentMySQLLegacyProjection struct {
	query string
	rows  [][]sql.NullString
}

// TestAgentPlatformMySQLValidation uses the application's actual startup
// migration entry points. It requires four NEW, isolated, loopback-only MySQL
// databases provisioned by the P00-T03 runner. The test never creates or drops
// databases and leaves its rows available for inspection until runner cleanup.
func TestAgentPlatformMySQLValidation(t *testing.T) {
	envNames := []string{
		"TEST_AGENT_MYSQL_FRESH_DSN", "TEST_AGENT_MYSQL_FRESH_LOG_DSN",
		"TEST_AGENT_MYSQL_UPGRADE_DSN", "TEST_AGENT_MYSQL_UPGRADE_LOG_DSN",
	}
	var missing []string
	for _, name := range envNames {
		if os.Getenv(name) == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) != 0 {
		t.Skipf("isolated MySQL validation not configured; missing %s", strings.Join(missing, ", "))
	}

	roles := []string{"fresh", "fresh_log", "upgrade", "upgrade_log"}
	targets := make([]agentMySQLTarget, len(roles))
	for i, role := range roles {
		config, err := mysqldriver.ParseDSN(os.Getenv(envNames[i]))
		require.NoError(t, err, "parse %s", envNames[i])
		require.Equal(t, "tcp", config.Net, "validation requires an explicit loopback TCP address")
		host, _, err := net.SplitHostPort(config.Addr)
		require.NoError(t, err, "validation requires an explicit TCP port")
		require.Contains(t, []string{"127.0.0.1", "localhost"}, host, "refusing a non-loopback MySQL server")
		require.False(t, config.MultiStatements, "validation does not need multiStatements")
		namePattern := regexp.MustCompile(`^aivale_p00_t03_([a-z0-9]{8,32})_` + role + `$`)
		match := namePattern.FindStringSubmatch(config.DBName)
		require.Len(t, match, 2, "refusing an unscoped database for role %s", role)
		config.ParseTime = true
		config.Timeout = 10 * time.Second
		config.ReadTimeout = 30 * time.Second
		config.WriteTimeout = 30 * time.Second
		targets[i] = agentMySQLTarget{dsn: config.FormatDSN(), name: config.DBName, runID: match[1]}
		if i != 0 {
			require.Equal(t, targets[0].runID, targets[i].runID, "all four databases must belong to one isolated run")
		}
	}
	// Validate every target before writing any fixture data.
	for _, target := range targets {
		db := agentMySQLGuardedDB(t, target)
		var tables []string
		require.NoError(t, db.Raw("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> ?", agentMySQLMarkerTable).Scan(&tables).Error)
		require.Empty(t, tables, "use a new run ID; validation databases must initially contain only their guard marker")
		require.NoError(t, closeDB(db))
	}

	previousDB, previousLogDB := DB, LOG_DB
	previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	previousMaster, previousDebug := common.IsMasterNode, common.DebugEnabled
	previousRetireAt := legacyAccessTokenRetireAt.Load()
	t.Cleanup(func() {
		if LOG_DB != nil && LOG_DB != previousLogDB && LOG_DB != DB {
			assert.NoError(t, closeDB(LOG_DB))
		}
		if DB != nil && DB != previousDB {
			assert.NoError(t, closeDB(DB))
		}
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMainType, previousLogType)
		common.IsMasterNode, common.DebugEnabled = previousMaster, previousDebug
		legacyAccessTokenRetireAt.Store(previousRetireAt)
		initCol()
	})
	DB, LOG_DB = nil, nil
	common.IsMasterNode, common.DebugEnabled = true, false
	t.Setenv("SKIP_64BIT_QUOTA_SCHEMA_CHECK", "false")
	t.Setenv("SQL_MAX_IDLE_CONNS", "2")
	t.Setenv("SQL_MAX_OPEN_CONNS", "4")

	for i, scenario := range []string{"fresh", "upgrade"} {
		t.Run(scenario, func(t *testing.T) {
			t.Cleanup(func() {
				if LOG_DB != nil && LOG_DB != DB {
					assert.NoError(t, closeDB(LOG_DB))
				}
				if DB != nil {
					assert.NoError(t, closeDB(DB))
				}
				DB, LOG_DB = nil, nil
			})
			mainTarget, logTarget := targets[2*i], targets[2*i+1]
			t.Setenv("SQL_DSN", mainTarget.dsn)
			t.Setenv("LOG_SQL_DSN", logTarget.dsn)
			var legacyMain, legacyLog map[string]agentMySQLLegacyProjection
			if scenario == "upgrade" {
				mainDB := agentMySQLGuardedDB(t, mainTarget)
				logDB := agentMySQLGuardedDB(t, logTarget)
				require.NoError(t, mainDB.AutoMigrate(&agentMySQLLegacyUser{}, &agentMySQLLegacyToken{}, &agentMySQLLegacyChannel{}, &agentMySQLLegacyLog{}))
				require.NoError(t, logDB.AutoMigrate(&agentMySQLLegacyLog{}))
				require.False(t, mainDB.Migrator().HasTable(&Team{}))
				require.False(t, mainDB.Migrator().HasTable(&TeamMember{}))
				require.False(t, mainDB.Migrator().HasColumn("tokens", "team_id"))
				agentMySQLSeedRepresentativeRows(t, mainDB, logDB, true)
				legacyMain = agentMySQLLegacyProjectionSnapshot(t, mainDB, false)
				legacyLog = agentMySQLLegacyProjectionSnapshot(t, logDB, true)
				require.NoError(t, closeDB(mainDB))
				require.NoError(t, closeDB(logDB))
			}
			require.NoError(t, InitDB(), "first main startup")
			require.NoError(t, InitLogDB(), "first separate-log startup")
			require.Equal(t, common.DatabaseTypeMySQL, common.MainDatabaseType())
			require.Equal(t, common.DatabaseTypeMySQL, common.LogDatabaseType())
			for table, projection := range legacyMain {
				require.Equal(t, projection.rows, agentMySQLQuerySnapshot(t, DB, projection.query), "first upgrade changed legacy main.%s columns or rows", table)
			}
			for table, projection := range legacyLog {
				require.Equal(t, projection.rows, agentMySQLQuerySnapshot(t, LOG_DB, projection.query), "first upgrade changed legacy log.%s columns or rows", table)
			}
			if scenario == "fresh" {
				agentMySQLSeedRepresentativeRows(t, DB, LOG_DB, false)
			}
			agentMySQLAssertRepresentativeRows(t)
			require.True(t, DB.Migrator().HasTable(&Team{}))
			require.True(t, DB.Migrator().HasTable(&TeamMember{}))
			team := Team{Id: 21, Name: "P00验证团队", OwnerUserId: 11, InviteCode: "p00-t03-fixture-invite", Quota: 9000000123}
			require.NoError(t, DB.Create(&team).Error)
			require.NoError(t, DB.Create(&TeamMember{Id: 22, TeamId: team.Id, UserId: 11, Role: TeamRoleOwner}).Error)
			require.NoError(t, DB.Create(&Token{Id: 32, UserId: 11, TeamId: team.Id, Key: "p00-t03-fixture-team-key", Name: "团队令牌", RemainQuota: 12345}).Error)
			agentMySQLAssertUniqueConstraints(t)

			mainSchema, logSchema := agentMySQLSchemaSnapshot(t, DB), agentMySQLSchemaSnapshot(t, LOG_DB)
			mainRows, logRows := agentMySQLDataSnapshot(t, DB, false), agentMySQLDataSnapshot(t, LOG_DB, true)
			for restart := range 2 {
				require.NoError(t, CloseDB())
				DB, LOG_DB = nil, nil
				require.NoError(t, InitDB(), "main restart %d", restart+1)
				require.NoError(t, InitLogDB(), "separate-log restart %d", restart+1)
				require.Equal(t, mainSchema, agentMySQLSchemaSnapshot(t, DB), "main schema changed on restart %d", restart+1)
				require.Equal(t, logSchema, agentMySQLSchemaSnapshot(t, LOG_DB), "log schema changed on restart %d", restart+1)
				require.Equal(t, mainRows, agentMySQLDataSnapshot(t, DB, false), "main data changed on restart %d", restart+1)
				require.Equal(t, logRows, agentMySQLDataSnapshot(t, LOG_DB, true), "log data changed on restart %d", restart+1)
				agentMySQLAssertRepresentativeRows(t)
				t.Logf("P00_T03_CHECK scenario=%s restart=%d dialect=mysql metadata=stable representative_data=preserved", scenario, restart+1)
			}
			require.False(t, t.Failed(), "representative data assertions failed")
			var version string
			require.NoError(t, DB.Raw("SELECT VERSION()").Scan(&version).Error)
			result := map[string]any{
				"scenario": scenario, "mysql_version": version, "startup_count": 3,
				// Exclude the snapshot header and the environment guard table.
				"main_tables": len(mainSchema["tables"]) - 2, "log_tables": len(logSchema["tables"]) - 2,
				"schema_stable": true, "data_preserved": true, "unique_constraints_verified": true,
			}
			if scenario == "upgrade" {
				result["legacy_tag"] = "v1.0.0-rc.42"
				result["legacy_commit"] = "6370b29424168039e94d40d610191e7d2e65dbf4"
				result["fixture_kind"] = "minimal_projection_quota64_compatible"
				result["legacy_projection_preserved"] = true
			}
			payload, err := common.Marshal(result)
			require.NoError(t, err)
			t.Logf("P00_T03_RESULT %s", payload)
			require.NoError(t, CloseDB())
			DB, LOG_DB = nil, nil
		})
	}
}

func agentMySQLGuardedDB(t *testing.T, target agentMySQLTarget) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(mysqlMigrationDialector{mysql.Dialector{Config: &mysql.Config{DSN: target.dsn}}}, &gorm.Config{Logger: logger.Discard})
	require.NoError(t, err, "open isolated validation database %s", target.name)
	// Close even when a guard assertion fails; normal callers close it earlier.
	t.Cleanup(func() { _ = closeDB(db) })
	var actualName, version, versionComment string
	require.NoError(t, db.Raw("SELECT DATABASE()").Scan(&actualName).Error)
	require.Equal(t, target.name, actualName, "connected database does not match its validated DSN")
	require.NoError(t, db.Raw("SELECT VERSION()").Scan(&version).Error)
	require.NoError(t, db.Raw("SELECT @@version_comment").Scan(&versionComment).Error)
	require.NotContains(t, strings.ToLower(version+" "+versionComment), "mariadb", "this verification environment must run MySQL")
	var markers []struct {
		RunID   string `gorm:"column:run_id"`
		Purpose string
	}
	require.NoError(t, db.Table(agentMySQLMarkerTable).Find(&markers).Error, "missing isolation guard marker")
	require.Len(t, markers, 1, "guard marker must identify exactly one isolated run")
	require.Equal(t, target.runID, markers[0].RunID)
	require.Equal(t, "p00-t03-mysql", markers[0].Purpose)
	t.Logf("P00_T03_MYSQL database=%s version=%s version_comment=%s dialect=%s", actualName, version, versionComment, db.Dialector.Name())
	return db
}

func agentMySQLSeedRepresentativeRows(t *testing.T, mainDB, logDB *gorm.DB, legacy bool) {
	t.Helper()
	// Deliberately exceed signed INT32 for wallet/channel balances. These are
	// fixed test facts; this validation does not calculate or settle charges.
	user := map[string]any{"id": 11, "username": "p00_fixture", "password": "fixture-not-for-login", "display_name": "升级验证用户", "email": "fixture@example.invalid", "quota": 5000000123, "used_quota": 3000000456, "aff_code": "p00-fixture-aff", "aff_quota": 4000000789, "aff_history": 6000000123, "group": "default", "setting": "{}", "auth_version": 7}
	token := map[string]any{"id": 31, "user_id": 11, "key": "p00-t03-fixture-personal-key", "name": "个人令牌", "remain_quota": 7654321, "used_quota": 321, "model_limits": "gpt-4o,fixture-model", "group": "default", "created_time": 1700000001, "expired_time": -1}
	channel := map[string]any{"id": 41, "type": 1, "key": "p00-t03-fixture-upstream-key", "name": "中文验证渠道", "models": "fixture-model", "group": "default", "used_quota": 7000000456, "created_time": 1700000002}
	require.NoError(t, mainDB.Table("users").Create(user).Error)
	require.NoError(t, mainDB.Table("tokens").Create(token).Error)
	require.NoError(t, mainDB.Table("channels").Create(channel).Error)
	for i, db := range []*gorm.DB{mainDB, logDB} {
		row := map[string]any{"id": 51 + i, "user_id": 11, "created_at": 1700000003, "type": LogTypeConsume, "content": "P00旧记录中文内容", "username": "p00_fixture", "token_name": "个人令牌", "model_name": "fixture-model", "quota": 1234, "prompt_tokens": 23, "completion_tokens": 34, "channel_id": 41, "token_id": 31, "group": "default", "request_id": fmt.Sprintf("p00-fixture-request-%d", i)}
		require.NoError(t, db.Table("logs").Create(row).Error)
	}
	if legacy {
		t.Log("P00_T03_FIXTURE source=v1.0.0-rc.42 commit=6370b29424168039e94d40d610191e7d2e65dbf4 scope=minimal_projection quota64_compatible=true")
	}
}

func agentMySQLAssertRepresentativeRows(t *testing.T) {
	t.Helper()
	var user User
	require.NoError(t, DB.First(&user, 11).Error)
	assert.Equal(t, "p00_fixture", user.Username)
	assert.Equal(t, "升级验证用户", user.DisplayName)
	assert.EqualValues(t, 5000000123, user.Quota)
	assert.EqualValues(t, 3000000456, user.UsedQuota)
	assert.EqualValues(t, 4000000789, user.AffQuota)
	assert.EqualValues(t, 6000000123, user.AffHistoryQuota)
	assert.EqualValues(t, 7, user.AuthVersion)
	var token Token
	require.NoError(t, DB.First(&token, 31).Error)
	assert.Equal(t, "p00-t03-fixture-personal-key", token.Key)
	assert.Equal(t, "gpt-4o,fixture-model", token.ModelLimits)
	assert.Equal(t, 0, token.TeamId, "a legacy personal token must not acquire a team scope")
	assert.Equal(t, 7654321, token.RemainQuota)
	var channel Channel
	require.NoError(t, DB.First(&channel, 41).Error)
	assert.Equal(t, "中文验证渠道", channel.Name)
	assert.EqualValues(t, 7000000456, channel.UsedQuota)
	for i, db := range []*gorm.DB{DB, LOG_DB} {
		var log Log
		require.NoError(t, db.First(&log, 51+i).Error)
		assert.Equal(t, "P00旧记录中文内容", log.Content)
		assert.Equal(t, 1234, log.Quota)
		assert.Equal(t, 31, log.TokenId)
		assert.Equal(t, fmt.Sprintf("p00-fixture-request-%d", i), log.RequestId)
	}
}

func agentMySQLAssertUniqueConstraints(t *testing.T) {
	t.Helper()
	before := agentMySQLDataSnapshot(t, DB, false)
	for _, row := range []any{
		&Token{UserId: 11, Key: "p00-t03-fixture-personal-key", Name: "duplicate must fail"},
		&Team{Name: "duplicate must fail", OwnerUserId: 11, InviteCode: "p00-t03-fixture-invite"},
		&TeamMember{TeamId: 21, UserId: 11, Role: TeamRoleMember},
	} {
		err := DB.Session(&gorm.Session{Logger: logger.Discard}).Create(row).Error
		var duplicate *mysqldriver.MySQLError
		require.ErrorAs(t, err, &duplicate, "expected a real MySQL constraint error for %T", row)
		require.EqualValues(t, 1062, duplicate.Number, "expected duplicate-key rejection for %T", row)
	}
	require.Equal(t, before, agentMySQLDataSnapshot(t, DB, false), "rejected unique violations must preserve existing rows")
	t.Log("P00_T03_CHECK unique_constraints=tokens.key,teams.invite_code,team_members.user_id duplicate_error=1062 existing_rows=preserved")
}

func agentMySQLDataSnapshot(t *testing.T, db *gorm.DB, logOnly bool) map[string][][]sql.NullString {
	t.Helper()
	tables := []string{"logs"}
	if !logOnly {
		tables = []string{"users", "tokens", "channels", "teams", "team_members", "logs", "options"}
	}
	result := make(map[string][][]sql.NullString, len(tables))
	for _, table := range tables {
		order := "id"
		if table == "options" {
			order = "`key`"
		}
		result[table] = agentMySQLQuerySnapshot(t, db, "SELECT * FROM `"+table+"` ORDER BY "+order)
	}
	return result
}

func agentMySQLLegacyProjectionSnapshot(t *testing.T, db *gorm.DB, logOnly bool) map[string]agentMySQLLegacyProjection {
	t.Helper()
	tables := []string{"logs"}
	if !logOnly {
		tables = []string{"users", "tokens", "channels", "logs"}
	}
	result := make(map[string]agentMySQLLegacyProjection, len(tables))
	for _, table := range tables {
		// Freeze every column of the already-created legacy fixture before
		// startup. Reuse this exact SELECT after migration, excluding new columns.
		columnTypes, err := db.Migrator().ColumnTypes(table)
		require.NoError(t, err)
		require.NotEmpty(t, columnTypes)
		columns := make([]string, len(columnTypes))
		for i, column := range columnTypes {
			columns[i] = "`" + strings.ReplaceAll(column.Name(), "`", "``") + "`"
		}
		query := "SELECT " + strings.Join(columns, ", ") + " FROM `" + table + "` ORDER BY id"
		result[table] = agentMySQLLegacyProjection{query: query, rows: agentMySQLQuerySnapshot(t, db, query)}
	}
	return result
}

func agentMySQLSchemaSnapshot(t *testing.T, db *gorm.DB) map[string][][]sql.NullString {
	t.Helper()
	// Exclude mutable catalog statistics (cardinality, row count, timestamps,
	// AUTO_INCREMENT), but retain actual type/default/null/index definitions.
	queries := map[string]string{
		"tables":      "SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
		"columns":     "SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, CHARACTER_SET_NAME, COLLATION_NAME, GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION",
		"indexes":     "SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, COLLATION, SUB_PART, NULLABLE, INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX",
		"constraints": "SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() ORDER BY TABLE_NAME, CONSTRAINT_NAME",
	}
	result := make(map[string][][]sql.NullString, len(queries))
	for name, query := range queries {
		result[name] = agentMySQLQuerySnapshot(t, db, query)
	}
	return result
}

func agentMySQLQuerySnapshot(t *testing.T, db *gorm.DB, query string) [][]sql.NullString {
	t.Helper()
	rows, err := db.Raw(query).Rows()
	require.NoError(t, err)
	defer rows.Close()
	columns, err := rows.Columns()
	require.NoError(t, err)
	header := make([]sql.NullString, len(columns))
	for i, column := range columns {
		header[i] = sql.NullString{String: column, Valid: true}
	}
	result := [][]sql.NullString{header}
	for rows.Next() {
		values := make([]sql.NullString, len(columns))
		destinations := make([]any, len(columns))
		for i := range values {
			destinations[i] = &values[i]
		}
		require.NoError(t, rows.Scan(destinations...))
		result = append(result, values)
	}
	require.NoError(t, rows.Err())
	return result
}
