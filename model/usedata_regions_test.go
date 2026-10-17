package model

import (
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type regionDialect struct {
	name string
	db   *gorm.DB
	// Database type reported to common so dialect-specific SQL branches match
	// the engine under test.
	mainType common.DatabaseType
}

// regionTestDialects opens one connection per supported engine. MySQL and
// PostgreSQL only run when their DSN env vars are configured.
func regionTestDialects(t *testing.T) []regionDialect {
	t.Helper()
	dialects := []regionDialect{}

	sqliteDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	dialects = append(dialects, regionDialect{name: "sqlite", db: sqliteDB, mainType: common.DatabaseTypeSQLite})

	if dsn := strings.TrimSpace(os.Getenv("TEST_MYSQL_DSN")); dsn != "" {
		db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
		require.NoError(t, err)
		dialects = append(dialects, regionDialect{name: "mysql", db: db, mainType: common.DatabaseTypeMySQL})
	} else {
		t.Log("TEST_MYSQL_DSN is not configured")
	}

	if dsn := strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN")); dsn != "" {
		db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
		require.NoError(t, err)
		dialects = append(dialects, regionDialect{name: "postgres", db: db, mainType: common.DatabaseTypePostgreSQL})
	} else {
		t.Log("TEST_POSTGRES_DSN is not configured")
	}

	return dialects
}

// useRegionDialect points the package-level DB and database type at the engine
// under test for the duration of one subtest.
func useRegionDialect(t *testing.T, dialect regionDialect) {
	t.Helper()
	previousDB := DB
	previousMainType := common.MainDatabaseType()
	previousLogType := common.LogDatabaseType()
	DB = dialect.db
	common.SetDatabaseTypes(dialect.mainType, dialect.mainType)
	t.Cleanup(func() {
		DB = previousDB
		common.SetDatabaseTypes(previousMainType, previousLogType)
	})
}

// prepareRegionTables migrates the tables the region queries read and drops
// them again only when this test created them.
func prepareRegionTables(t *testing.T, db *gorm.DB) {
	t.Helper()
	createdUsers := !db.Migrator().HasTable(&User{})
	createdQuotaData := !db.Migrator().HasTable(&QuotaData{})
	require.NoError(t, db.AutoMigrate(&User{}, &QuotaData{}))
	require.NoError(t, db.Exec("DELETE FROM quota_data").Error)
	require.NoError(t, db.Exec("DELETE FROM users").Error)
	t.Cleanup(func() {
		if createdQuotaData {
			require.NoError(t, db.Migrator().DropTable(&QuotaData{}))
		}
		if createdUsers {
			require.NoError(t, db.Migrator().DropTable(&User{}))
		}
	})
}

func seedRegionFixtures(t *testing.T, db *gorm.DB) {
	t.Helper()
	users := []User{
		{Id: 9101, Username: "region-sz", Password: "x", AffCode: "region-sz", Province: "广东省", City: "深圳市"},
		{Id: 9102, Username: "region-gz", Password: "x", AffCode: "region-gz", Province: "广东省", City: "广州市"},
		{Id: 9103, Username: "region-bj", Password: "x", AffCode: "region-bj", Province: "北京市"},
		{Id: 9104, Username: "region-none", Password: "x", AffCode: "region-none"},
	}
	for i := range users {
		require.NoError(t, db.Create(&users[i]).Error)
	}

	rows := []QuotaData{
		{UserID: 9101, Username: "region-sz", ModelName: "gpt-test", CreatedAt: 1000, TokenUsed: 100},
		{UserID: 9101, Username: "region-sz", ModelName: "gpt-test", CreatedAt: 4600, TokenUsed: 50},
		{UserID: 9102, Username: "region-gz", ModelName: "gpt-test", CreatedAt: 1000, TokenUsed: 30},
		{UserID: 9103, Username: "region-bj", ModelName: "gpt-test", CreatedAt: 1000, TokenUsed: 7},
		{UserID: 9104, Username: "region-none", ModelName: "gpt-test", CreatedAt: 1000, TokenUsed: 5},
		// Usage outside the queried window must be ignored.
		{UserID: 9101, Username: "region-sz", ModelName: "gpt-test", CreatedAt: 99999, TokenUsed: 999},
	}
	for i := range rows {
		require.NoError(t, db.Create(&rows[i]).Error)
	}
}

func TestRegionUsageAggregationAcrossDialects(t *testing.T) {
	for _, dialect := range regionTestDialects(t) {
		t.Run(dialect.name, func(t *testing.T) {
			useRegionDialect(t, dialect)
			prepareRegionTables(t, dialect.db)
			seedRegionFixtures(t, dialect.db)

			totals, err := GetRegionUsageTotals(0, 10000)
			require.NoError(t, err)
			byRegion := map[string]RegionUsageRow{}
			for _, row := range totals {
				byRegion[row.Province+"/"+row.City] = row
			}
			assert.Len(t, totals, 4)
			assert.Equal(t, int64(150), byRegion["广东省/深圳市"].Tokens)
			assert.Equal(t, 1, byRegion["广东省/深圳市"].Users)
			assert.Equal(t, int64(30), byRegion["广东省/广州市"].Tokens)
			assert.Equal(t, int64(7), byRegion["北京市/"].Tokens)
			assert.Equal(t, int64(5), byRegion["/"].Tokens)

			provinceTokens, err := GetRegionTokens(0, 10000, "广东省", "")
			require.NoError(t, err)
			assert.Equal(t, int64(180), provinceTokens)

			cityTokens, err := GetRegionTokens(0, 10000, "广东省", "广州市")
			require.NoError(t, err)
			assert.Equal(t, int64(30), cityTokens)

			allTokens, err := GetTotalTokensInRange(0, 10000)
			require.NoError(t, err)
			assert.Equal(t, int64(192), allTokens)

			buckets, err := GetRegionUsageBuckets(0, 10000, 3600, "广东省", "")
			require.NoError(t, err)
			require.Len(t, buckets, 2)
			assert.Equal(t, int64(0), buckets[0].Bucket)
			assert.Equal(t, int64(130), buckets[0].Tokens)
			assert.Equal(t, int64(3600), buckets[1].Bucket)
			assert.Equal(t, int64(50), buckets[1].Tokens)

			totalBuckets, err := GetTotalUsageBuckets(0, 10000, 3600)
			require.NoError(t, err)
			require.Len(t, totalBuckets, 2)
			assert.Equal(t, int64(142), totalBuckets[0].Tokens)
			assert.Equal(t, int64(50), totalBuckets[1].Tokens)
		})
	}
}

func TestUserRegionColumnsMigrationIsIdempotent(t *testing.T) {
	for _, dialect := range regionTestDialects(t) {
		t.Run(dialect.name, func(t *testing.T) {
			useRegionDialect(t, dialect)
			createdUsers := !dialect.db.Migrator().HasTable(&User{})
			require.NoError(t, dialect.db.AutoMigrate(&User{}))
			t.Cleanup(func() {
				if createdUsers {
					require.NoError(t, dialect.db.Migrator().DropTable(&User{}))
				}
			})
			require.True(t, dialect.db.Migrator().HasColumn(&User{}, "province"))
			require.True(t, dialect.db.Migrator().HasColumn(&User{}, "city"))

			recorder := &migrationSQLRecorder{}
			require.NoError(t, dialect.db.Session(&gorm.Session{Logger: recorder}).AutoMigrate(&User{}))
			// PostgreSQL also re-alters the deprecated users.access_token column
			// on every startup; that predates the region columns and is tracked
			// separately, so only the region columns are asserted here.
			assert.Empty(t, regionColumnMutations(recorder.schemaMutations()),
				"repeated startup must not re-alter the region columns")
		})
	}
}

func regionColumnMutations(mutations []string) []string {
	region := make([]string, 0, len(mutations))
	for _, statement := range mutations {
		normalized := strings.ToLower(statement)
		if strings.Contains(normalized, "province") || strings.Contains(normalized, "city") {
			region = append(region, statement)
		}
	}
	return region
}

func TestUserEditPersistsRegion(t *testing.T) {
	for _, dialect := range regionTestDialects(t) {
		t.Run(dialect.name, func(t *testing.T) {
			useRegionDialect(t, dialect)
			prepareRegionTables(t, dialect.db)

			user := User{Id: 9201, Username: "region-edit", Password: "x", AffCode: "region-edit"}
			require.NoError(t, dialect.db.Create(&user).Error)

			user.Province = "浙江省"
			user.City = "杭州市"
			require.NoError(t, user.EditWithTx(dialect.db, false))

			var reloaded User
			require.NoError(t, dialect.db.First(&reloaded, 9201).Error)
			assert.Equal(t, "浙江省", reloaded.Province)
			assert.Equal(t, "杭州市", reloaded.City)
		})
	}
}
