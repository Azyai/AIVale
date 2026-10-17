package service

import (
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/model"
)

const (
	regionCacheTTL     = 5 * time.Minute
	regionNameMaxChars = 64
)

type RegionStat struct {
	Rank        int     `json:"rank"`
	Name        string  `json:"name"`
	TotalTokens int64   `json:"total_tokens"`
	Users       int     `json:"users"`
	Cities      int     `json:"cities,omitempty"`
	TopCity     string  `json:"top_city,omitempty"`
	Share       float64 `json:"share"`
	GrowthPct   float64 `json:"growth_pct"`
}

type RegionPoint struct {
	Ts     string `json:"ts"`
	Label  string `json:"label"`
	Tokens int64  `json:"tokens"`
}

type RegionDetail struct {
	Province    string        `json:"province"`
	City        string        `json:"city,omitempty"`
	TodayTokens int64         `json:"today_tokens"`
	MonthTokens int64         `json:"month_tokens"`
	YearTokens  int64         `json:"year_tokens"`
	Series      []RegionPoint `json:"series"`
}

type RegionsResponse struct {
	Period      string       `json:"period"`
	Province    string       `json:"province"`
	TotalTokens int64        `json:"total_tokens"`
	Provinces   []RegionStat `json:"provinces"`
	Cities      []RegionStat `json:"cities"`
	Unassigned  RegionStat   `json:"unassigned"`
	Detail      RegionDetail `json:"detail"`
}

type regionAggregate struct {
	name           string
	tokens         int64
	previousTokens int64
	users          int
	cities         map[string]struct{}
	topCity        string
	topCityTokens  int64
}

type regionCacheItem struct {
	expiresAt time.Time
	data      *RegionsResponse
}

var (
	regionCacheMu sync.Mutex
	regionCache   = map[string]regionCacheItem{}
)

// GetRegionsSnapshot aggregates quota_data by the region admins maintain on
// each user. province selects the drill-down level: empty returns the whole
// country, a province name adds its city breakdown and usage detail.
func GetRegionsSnapshot(period string, province string) (*RegionsResponse, error) {
	config, err := rankingConfig(period)
	if err != nil {
		return nil, err
	}
	province = normalizeRegionName(province)

	now := time.Now()
	key := config.id + "|" + province
	regionCacheMu.Lock()
	if item, ok := regionCache[key]; ok && now.Before(item.expiresAt) {
		regionCacheMu.Unlock()
		return item.data, nil
	}
	regionCacheMu.Unlock()

	data, err := buildRegionsSnapshot(config, province, now)
	if err != nil {
		return nil, err
	}

	regionCacheMu.Lock()
	regionCache[key] = regionCacheItem{expiresAt: now.Add(regionCacheTTL), data: data}
	regionCacheMu.Unlock()

	return data, nil
}

func normalizeRegionName(name string) string {
	name = strings.TrimSpace(name)
	if runes := []rune(name); len(runes) > regionNameMaxChars {
		name = string(runes[:regionNameMaxChars])
	}
	return name
}

func buildRegionsSnapshot(config rankingPeriodConfig, province string, now time.Time) (*RegionsResponse, error) {
	startTime, endTime := rankingTimeRange(config, now)
	rows, err := model.GetRegionUsageTotals(startTime, endTime)
	if err != nil {
		return nil, err
	}

	var previousRows []model.RegionUsageRow
	if config.hasPrevious {
		previousStart, previousEnd := previousRankingTimeRange(config, startTime)
		previousRows, err = model.GetRegionUsageTotals(previousStart, previousEnd)
		if err != nil {
			return nil, err
		}
	}

	totalTokens := int64(0)
	unassignedTokens := int64(0)
	unassignedUsers := 0
	provinces := make(map[string]*regionAggregate)
	for _, row := range rows {
		totalTokens += row.Tokens
		if row.Province == "" {
			unassignedTokens += row.Tokens
			unassignedUsers += row.Users
			continue
		}
		agg := ensureRegionAggregate(provinces, row.Province)
		agg.tokens += row.Tokens
		agg.users += row.Users
		if row.City != "" {
			agg.cities[row.City] = struct{}{}
			if row.Tokens > agg.topCityTokens {
				agg.topCity = row.City
				agg.topCityTokens = row.Tokens
			}
		}
	}
	for _, row := range previousRows {
		if row.Province == "" {
			continue
		}
		ensureRegionAggregate(provinces, row.Province).previousTokens += row.Tokens
	}

	provinceStats := sortRegionStats(buildRegionStats(provinces, totalTokens, config.hasPrevious))
	cityStats := make([]RegionStat, 0)
	if province != "" {
		cities := make(map[string]*regionAggregate)
		for _, row := range rows {
			if row.Province != province || row.City == "" {
				continue
			}
			agg := ensureRegionAggregate(cities, row.City)
			agg.tokens += row.Tokens
			agg.users += row.Users
		}
		for _, row := range previousRows {
			if row.Province != province || row.City == "" {
				continue
			}
			ensureRegionAggregate(cities, row.City).previousTokens += row.Tokens
		}
		provinceTokens := totalTokens
		if agg, ok := provinces[province]; ok {
			provinceTokens = agg.tokens
		}
		cityStats = sortRegionStats(buildRegionStats(cities, provinceTokens, config.hasPrevious))
	}

	detail, err := buildRegionDetail(config, province, now)
	if err != nil {
		return nil, err
	}

	return &RegionsResponse{
		Period:      config.id,
		Province:    province,
		TotalTokens: totalTokens,
		// Full lists on purpose: the map colors every region with traffic, and
		// the counts are bounded by the 34 provinces / 38 cities per province.
		Provinces: provinceStats,
		Cities:    cityStats,
		Unassigned: RegionStat{
			TotalTokens: unassignedTokens,
			Users:       unassignedUsers,
			Share:       rankingShare(unassignedTokens, totalTokens),
		},
		Detail: detail,
	}, nil
}

func buildRegionDetail(config rankingPeriodConfig, province string, now time.Time) (RegionDetail, error) {
	detail := RegionDetail{Province: province, Series: []RegionPoint{}}
	todayStart, monthStart, yearStart := calendarRegionRanges(now)
	endTime := now.Unix()

	var err error
	if detail.TodayTokens, err = regionTokensSince(todayStart, endTime, province); err != nil {
		return detail, err
	}
	if detail.MonthTokens, err = regionTokensSince(monthStart, endTime, province); err != nil {
		return detail, err
	}
	if detail.YearTokens, err = regionTokensSince(yearStart, endTime, province); err != nil {
		return detail, err
	}

	startTime, seriesEnd := rankingTimeRange(config, now)
	buckets, err := regionSeriesBuckets(startTime, seriesEnd, config.bucketSize, province)
	if err != nil {
		return detail, err
	}
	for _, bucket := range buckets {
		detail.Series = append(detail.Series, RegionPoint{
			Ts:     rankingBucketTs(bucket.Bucket),
			Label:  rankingBucketLabel(bucket.Bucket, config),
			Tokens: bucket.Tokens,
		})
	}
	return detail, nil
}

func regionTokensSince(startTime int64, endTime int64, province string) (int64, error) {
	if province == "" {
		return model.GetTotalTokensInRange(startTime, endTime)
	}
	return model.GetRegionTokens(startTime, endTime, province, "")
}

func regionSeriesBuckets(startTime int64, endTime int64, bucketSize int64, province string) ([]model.RegionUsageBucket, error) {
	if province == "" {
		return model.GetTotalUsageBuckets(startTime, endTime, bucketSize)
	}
	return model.GetRegionUsageBuckets(startTime, endTime, bucketSize, province, "")
}

func calendarRegionRanges(now time.Time) (todayStart int64, monthStart int64, yearStart int64) {
	year, month, day := now.Date()
	location := now.Location()
	todayStart = time.Date(year, month, day, 0, 0, 0, 0, location).Unix()
	monthStart = time.Date(year, month, 1, 0, 0, 0, 0, location).Unix()
	yearStart = time.Date(year, time.January, 1, 0, 0, 0, 0, location).Unix()
	return todayStart, monthStart, yearStart
}

func ensureRegionAggregate(aggregates map[string]*regionAggregate, name string) *regionAggregate {
	agg, ok := aggregates[name]
	if !ok {
		agg = &regionAggregate{name: name, cities: make(map[string]struct{})}
		aggregates[name] = agg
	}
	return agg
}

func buildRegionStats(aggregates map[string]*regionAggregate, totalTokens int64, showGrowth bool) []RegionStat {
	stats := make([]RegionStat, 0, len(aggregates))
	for _, agg := range aggregates {
		if agg.tokens <= 0 && agg.previousTokens <= 0 {
			continue
		}
		growth := 0.0
		if showGrowth {
			growth = rankingGrowthPct(agg.tokens, agg.previousTokens)
		}
		stats = append(stats, RegionStat{
			Name:        agg.name,
			TotalTokens: agg.tokens,
			Users:       agg.users,
			Cities:      len(agg.cities),
			TopCity:     agg.topCity,
			Share:       rankingShare(agg.tokens, totalTokens),
			GrowthPct:   growth,
		})
	}
	return stats
}

func sortRegionStatsInPlace(stats []RegionStat) {
	sort.Slice(stats, func(i, j int) bool {
		if stats[i].TotalTokens == stats[j].TotalTokens {
			return stats[i].Name < stats[j].Name
		}
		return stats[i].TotalTokens > stats[j].TotalTokens
	})
}

func sortRegionStats(stats []RegionStat) []RegionStat {
	sortRegionStatsInPlace(stats)
	for idx := range stats {
		stats[idx].Rank = idx + 1
	}
	return stats
}
