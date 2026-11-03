package agent

import "math"

const MaxSafeInteger int64 = 9007199254740991

type SortField string

const (
	SortFieldCreatedAt SortField = "created_at"
	SortFieldID        SortField = "id"
)

type SortDirection string

const (
	SortAscending  SortDirection = "asc"
	SortDescending SortDirection = "desc"
)

// SortTerm contains only validated identifiers and directions, never raw SQL.
type SortTerm struct {
	Field     SortField
	Direction SortDirection
}

// PageQuery is constructed only after validation. Its zero value is invalid.
type PageQuery struct {
	page     int64
	pageSize int
	sort     []SortTerm
}

func NewPageQuery(page int64, pageSize int, sort []SortTerm) (PageQuery, error) {
	query := PageQuery{page: page, pageSize: pageSize, sort: sort}
	if err := query.validate(); err != nil {
		return PageQuery{}, err
	}
	query.sort = append([]SortTerm(nil), sort...)
	return query, nil
}

func (query PageQuery) Page() int64 { return query.page }

func (query PageQuery) PageSize() int { return query.pageSize }

func (query PageQuery) Sort() []SortTerm { return append([]SortTerm(nil), query.sort...) }

// Offset is internal int64 arithmetic, not a JSON number. Valid safe-integer
// page numbers may produce an offset above the JavaScript safe-integer limit.
func (query PageQuery) Offset() (int64, error) {
	if err := query.validate(); err != nil {
		return 0, err
	}
	if query.page-1 > math.MaxInt64/int64(query.pageSize) {
		return 0, NewInvalidArgument("page", "Page offset exceeds the supported range")
	}
	return (query.page - 1) * int64(query.pageSize), nil
}

func (query PageQuery) validate() error {
	if query.page < 1 || query.page > MaxSafeInteger {
		return NewInvalidArgument("page", "Page must be a positive safe integer")
	}
	if query.pageSize < 1 || query.pageSize > 100 {
		return NewInvalidArgument("page_size", "Page size must be between 1 and 100")
	}
	if len(query.sort) < 1 || len(query.sort) > 2 {
		return NewInvalidArgument("sort", "Sort must contain one or two supported fields")
	}
	seen := make(map[SortField]bool, len(query.sort))
	for _, term := range query.sort {
		if (term.Field != SortFieldCreatedAt && term.Field != SortFieldID) ||
			(term.Direction != SortAscending && term.Direction != SortDescending) || seen[term.Field] {
			return NewInvalidArgument("sort", "Sort contains an unsupported or duplicate field or direction")
		}
		seen[term.Field] = true
	}
	if query.sort[len(query.sort)-1].Field != SortFieldID {
		return NewInvalidArgument("sort", "Sort must end with the ID tie breaker")
	}
	return nil
}

type Page[T any] struct {
	Items    []T   `json:"items"`
	Total    int64 `json:"total"`
	Page     int64 `json:"page"`
	PageSize int   `json:"page_size"`
}

// NewPage validates server-produced output; invalid repository data is an
// internal failure, not an invalid client request. It never truncates items.
func NewPage[T any](items []T, total int64, query PageQuery) (Page[T], error) {
	if err := query.validate(); err != nil {
		return Page[T]{}, NewError(InternalError, err)
	}
	if total < 0 || total > MaxSafeInteger || len(items) > query.pageSize || total < int64(len(items)) {
		return Page[T]{}, NewError(InternalError, nil)
	}
	if items == nil {
		items = []T{}
	}
	return Page[T]{Items: items, Total: total, Page: query.page, PageSize: query.pageSize}, nil
}
