package agentapi

import (
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

// ParseID accepts only a canonical, positive signed-int64 decimal identifier.
func ParseID(value string) (int64, error) {
	if len(value) < 1 || len(value) > 19 || value[0] < '1' || value[0] > '9' {
		return 0, agenttypes.NewInvalidArgument("id", "ID must be a canonical positive decimal string")
	}
	for _, digit := range []byte(value) {
		if digit < '0' || digit > '9' {
			return 0, agenttypes.NewInvalidArgument("id", "ID must be a canonical positive decimal string")
		}
	}
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, agenttypes.NewInvalidArgument("id", "ID exceeds the supported range")
	}
	return id, nil
}

// ParseJSONID enforces the JSON string boundary before any integer conversion.
func ParseJSONID(raw []byte) (int64, error) {
	// A valid ID has at most 19 ASCII digits; even fully escaped as \u0031
	// its quoted representation is at most 116 bytes. Trim only JSON's outer
	// whitespace, then bound decoding without allocating an oversized string.
	for len(raw) > 0 && strings.ContainsRune(" \t\r\n", rune(raw[0])) {
		raw = raw[1:]
	}
	for len(raw) > 0 && strings.ContainsRune(" \t\r\n", rune(raw[len(raw)-1])) {
		raw = raw[:len(raw)-1]
	}
	if len(raw) < 2 || len(raw) > 116 {
		return 0, agenttypes.NewInvalidArgument("id", "ID must be a canonical positive decimal string")
	}
	var value string
	if err := common.Unmarshal(raw, &value); err != nil {
		return 0, agenttypes.NewInvalidArgument("id", "ID must be a canonical positive decimal string")
	}
	return ParseID(value)
}

// ParsePageQuery owns exactly page/page_size/sort. Endpoint-specific filters
// must be parsed and removed by their controller before calling this function.
func ParsePageQuery(values url.Values) (agenttypes.PageQuery, error) {
	for key, entries := range values {
		switch key {
		case "page", "page_size", "sort":
			if len(entries) != 1 || entries[0] == "" {
				return agenttypes.PageQuery{}, agenttypes.NewInvalidArgument(key, "Query parameters must have one nonempty value")
			}
		default:
			return agenttypes.PageQuery{}, agenttypes.NewInvalidArgument("query", "Query contains an unsupported parameter")
		}
	}
	page, pageSize := int64(1), int64(20)
	if value, provided := values["page"]; provided {
		parsed, err := ParseID(value[0])
		if err != nil || parsed > agenttypes.MaxSafeInteger {
			return agenttypes.PageQuery{}, agenttypes.NewInvalidArgument("page", "Page must be a canonical positive safe integer")
		}
		page = parsed
	}
	if value, provided := values["page_size"]; provided {
		parsed, err := ParseID(value[0])
		if err != nil || parsed > 100 {
			return agenttypes.PageQuery{}, agenttypes.NewInvalidArgument("page_size", "Page size must be a canonical integer between 1 and 100")
		}
		pageSize = parsed
	}
	sort := []agenttypes.SortTerm{
		{Field: agenttypes.SortFieldCreatedAt, Direction: agenttypes.SortDescending},
		{Field: agenttypes.SortFieldID, Direction: agenttypes.SortDescending},
	}
	if value, provided := values["sort"]; provided {
		raw := value[0]
		if len(raw) > 32 {
			return agenttypes.PageQuery{}, agenttypes.NewInvalidArgument("sort", "Sort must contain one or two supported fields")
		}
		parts := strings.Split(raw, ",")
		if len(parts) > 2 {
			return agenttypes.PageQuery{}, agenttypes.NewInvalidArgument("sort", "Sort must contain one or two supported fields")
		}
		sort = make([]agenttypes.SortTerm, 0, 2)
		hasID := false
		for _, part := range parts {
			field, direction, found := strings.Cut(part, ":")
			if !found {
				return agenttypes.PageQuery{}, agenttypes.NewInvalidArgument("sort", "Sort must use field:direction terms")
			}
			sort = append(sort, agenttypes.SortTerm{Field: agenttypes.SortField(field), Direction: agenttypes.SortDirection(direction)})
			hasID = hasID || field == string(agenttypes.SortFieldID)
		}
		if !hasID {
			sort = append(sort, agenttypes.SortTerm{Field: agenttypes.SortFieldID, Direction: agenttypes.SortDescending})
		}
	}
	return agenttypes.NewPageQuery(page, int(pageSize), sort)
}
