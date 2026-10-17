package model

import (
	"fmt"

	"gorm.io/gorm"
)

// RegionUsageRow is one (province, city) pair with its aggregated token usage.
// An empty Province means the usage could not be attributed to a region.
type RegionUsageRow struct {
	Province string `json:"province"`
	City     string `json:"city"`
	Tokens   int64  `json:"tokens"`
	Users    int    `json:"users"`
}

type RegionUsageBucket struct {
	Bucket int64 `json:"bucket"`
	Tokens int64 `json:"tokens"`
}

// Region attribution lives on users; quota_data is joined to it so that every
// recorded token lands in exactly one region.
const (
	regionProvinceExpr = "COALESCE(u.province, '')"
	regionCityExpr     = "COALESCE(u.city, '')"
)

// GetRegionUsageTotals aggregates token usage per (province, city) over the
// time range. A user has a single region, so summing the per-city distinct
// user counts of a province never double-counts.
func GetRegionUsageTotals(startTime int64, endTime int64) ([]RegionUsageRow, error) {
	var rows []RegionUsageRow
	groupExpr := fmt.Sprintf("%s, %s", regionProvinceExpr, regionCityExpr)
	query := DB.Table("quota_data AS q").
		Select(fmt.Sprintf("%s AS province, %s AS city, SUM(q.token_used) AS tokens, COUNT(DISTINCT q.user_id) AS users", regionProvinceExpr, regionCityExpr)).
		Joins("LEFT JOIN users AS u ON u.id = q.user_id").
		Group(groupExpr).
		Having("SUM(q.token_used) > 0").
		Order("tokens DESC")
	query = applyRegionTimeRange(query, startTime, endTime)
	err := query.Find(&rows).Error
	return rows, err
}

// GetRegionUsageBuckets returns the token usage time series of one region.
// province is required; an empty city means "the whole province".
func GetRegionUsageBuckets(startTime int64, endTime int64, bucketSize int64, province string, city string) ([]RegionUsageBucket, error) {
	if bucketSize <= 0 {
		bucketSize = 3600
	}
	bucketExpr := rankingBucketExprFor("q.created_at", bucketSize)
	var rows []RegionUsageBucket
	query := DB.Table("quota_data AS q").
		Select(fmt.Sprintf("%s AS bucket, SUM(q.token_used) AS tokens", bucketExpr)).
		Joins("LEFT JOIN users AS u ON u.id = q.user_id").
		Where(fmt.Sprintf("%s = ?", regionProvinceExpr), province).
		Group(bucketExpr).
		Having("SUM(q.token_used) > 0").
		Order("bucket ASC")
	if city != "" {
		query = query.Where(fmt.Sprintf("%s = ?", regionCityExpr), city)
	}
	query = applyRegionTimeRange(query, startTime, endTime)
	err := query.Find(&rows).Error
	return rows, err
}

// GetTotalUsageBuckets returns the platform-wide token usage time series.
func GetTotalUsageBuckets(startTime int64, endTime int64, bucketSize int64) ([]RegionUsageBucket, error) {
	if bucketSize <= 0 {
		bucketSize = 3600
	}
	bucketExpr := rankingBucketExprFor("q.created_at", bucketSize)
	var rows []RegionUsageBucket
	query := DB.Table("quota_data AS q").
		Select(fmt.Sprintf("%s AS bucket, SUM(q.token_used) AS tokens", bucketExpr)).
		Group(bucketExpr).
		Having("SUM(q.token_used) > 0").
		Order("bucket ASC")
	query = applyRegionTimeRange(query, startTime, endTime)
	err := query.Find(&rows).Error
	return rows, err
}

// GetRegionTokens sums the token usage of one region over the time range.
func GetRegionTokens(startTime int64, endTime int64, province string, city string) (int64, error) {
	query := DB.Table("quota_data AS q").
		Select("COALESCE(SUM(q.token_used), 0)").
		Joins("LEFT JOIN users AS u ON u.id = q.user_id").
		Where(fmt.Sprintf("%s = ?", regionProvinceExpr), province)
	if city != "" {
		query = query.Where(fmt.Sprintf("%s = ?", regionCityExpr), city)
	}
	query = applyRegionTimeRange(query, startTime, endTime)
	var tokens int64
	err := query.Scan(&tokens).Error
	return tokens, err
}

// GetTotalTokensInRange sums the platform-wide token usage.
func GetTotalTokensInRange(startTime int64, endTime int64) (int64, error) {
	query := DB.Table("quota_data AS q").Select("COALESCE(SUM(q.token_used), 0)")
	query = applyRegionTimeRange(query, startTime, endTime)
	var tokens int64
	err := query.Scan(&tokens).Error
	return tokens, err
}

func applyRegionTimeRange(query *gorm.DB, startTime int64, endTime int64) *gorm.DB {
	if startTime > 0 {
		query = query.Where("q.created_at >= ?", startTime)
	}
	if endTime > 0 {
		query = query.Where("q.created_at <= ?", endTime)
	}
	return query
}
