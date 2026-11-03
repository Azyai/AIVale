// Package agent contains transport types owned by the host Agent platform.
// It has no dependency on relaykit, tokenkit, a web framework or database code.
package agent

import (
	"errors"
	"net/http"
	"unicode"
	"unicode/utf8"
)

type ErrorCode string

const (
	InvalidArgument       ErrorCode = "AG_INVALID_ARGUMENT"
	AuthRequired          ErrorCode = "AG_AUTH_REQUIRED"
	PermissionDenied      ErrorCode = "AG_PERMISSION_DENIED"
	ResourceNotFound      ErrorCode = "AG_RESOURCE_NOT_FOUND"
	DraftRevisionConflict ErrorCode = "AG_DRAFT_REVISION_CONFLICT"
	IdempotencyConflict   ErrorCode = "AG_IDEMPOTENCY_CONFLICT"
	RequestInProgress     ErrorCode = "AG_REQUEST_IN_PROGRESS"
	InvalidState          ErrorCode = "AG_INVALID_STATE"
	ResourceInUse         ErrorCode = "AG_RESOURCE_IN_USE"
	EventCursorExpired    ErrorCode = "AG_EVENT_CURSOR_EXPIRED"
	PayloadTooLarge       ErrorCode = "AG_PAYLOAD_TOO_LARGE"
	DependencyUnavailable ErrorCode = "AG_DEPENDENCY_UNAVAILABLE"
	ToolSchemaChanged     ErrorCode = "AG_TOOL_SCHEMA_CHANGED"
	SkillRejected         ErrorCode = "AG_SKILL_REJECTED"
	ConcurrencyLimit      ErrorCode = "AG_CONCURRENCY_LIMIT"
	BudgetExceeded        ErrorCode = "AG_BUDGET_EXCEEDED"
	FundingUnavailable    ErrorCode = "AG_FUNDING_UNAVAILABLE"
	RuntimeUnavailable    ErrorCode = "AG_RUNTIME_UNAVAILABLE"
	ToolUpstreamError     ErrorCode = "AG_TOOL_UPSTREAM_ERROR"
	StepTimeout           ErrorCode = "AG_STEP_TIMEOUT"
	CallOutcomeUnknown    ErrorCode = "CALL_OUTCOME_UNKNOWN"
	ReconciliationPending ErrorCode = "AG_RECONCILIATION_PENDING"
	InternalError         ErrorCode = "AG_INTERNAL_ERROR"
)

type errorDefinition struct {
	status  int
	message string
}

// The catalogue is private and immutable after package initialization. Public
// messages are selected here, never inferred from an internal error's text.
var errorDefinitions = map[ErrorCode]errorDefinition{
	InvalidArgument:       {http.StatusBadRequest, "Request parameters are invalid"},
	AuthRequired:          {http.StatusUnauthorized, "Authentication is required"},
	PermissionDenied:      {http.StatusForbidden, "This operation is not permitted"},
	ResourceNotFound:      {http.StatusNotFound, "The resource is not available"},
	DraftRevisionConflict: {http.StatusConflict, "The draft revision has changed"},
	IdempotencyConflict:   {http.StatusConflict, "The idempotency key conflicts with another request"},
	RequestInProgress:     {http.StatusConflict, "The request is still being processed"},
	InvalidState:          {http.StatusConflict, "The operation is not valid in the current state"},
	ResourceInUse:         {http.StatusConflict, "The resource is still in use"},
	EventCursorExpired:    {http.StatusGone, "The event cursor has expired"},
	PayloadTooLarge:       {http.StatusRequestEntityTooLarge, "The request exceeds the allowed size"},
	DependencyUnavailable: {http.StatusUnprocessableEntity, "A required dependency is not available"},
	ToolSchemaChanged:     {http.StatusUnprocessableEntity, "The tool schema has changed"},
	SkillRejected:         {http.StatusUnprocessableEntity, "The skill was rejected"},
	ConcurrencyLimit:      {http.StatusTooManyRequests, "The concurrency limit has been reached"},
	BudgetExceeded:        {http.StatusTooManyRequests, "The execution budget has been exceeded"},
	FundingUnavailable:    {http.StatusConflict, "The configured funding source is not available"},
	RuntimeUnavailable:    {http.StatusServiceUnavailable, "Agent platform capability is unavailable"},
	ToolUpstreamError:     {http.StatusBadGateway, "The external tool could not complete the request"},
	StepTimeout:           {http.StatusGatewayTimeout, "The external step timed out"},
	CallOutcomeUnknown:    {http.StatusConflict, "The external operation outcome requires verification"},
	ReconciliationPending: {http.StatusServiceUnavailable, "Usage reconciliation is still pending"},
	InternalError:         {http.StatusInternalServerError, "The request could not be completed"},
}

type FieldError struct {
	Path    string `json:"path"`
	Message string `json:"message"`
}

type ErrorData struct {
	FieldErrors []FieldError `json:"field_errors"`
	Retryable   bool         `json:"retryable"`
}

// ErrorResponse is the frozen public error shape. Internal errors, credentials
// and execution context do not belong in this response.
type ErrorResponse struct {
	Success   bool      `json:"success"`
	Code      ErrorCode `json:"code"`
	Message   string    `json:"message"`
	RequestID string    `json:"request_id"`
	Data      ErrorData `json:"data"`
}

// Error separates a stable public classification from its private cause. Its
// zero value is a safe internal error; it cannot grant a public error message.
type Error struct {
	code   ErrorCode
	fields []FieldError
	cause  error
}

func NewError(code ErrorCode, cause error) *Error {
	if _, known := errorDefinitions[code]; !known {
		code = InternalError
	}
	return &Error{code: code, cause: cause}
}

// NewInvalidArgument accepts only server-declared field paths and static rule
// messages. Callers must never pass rejected values or an internal err.Error().
func NewInvalidArgument(field, message string) *Error {
	if !validFieldText(field) || !validFieldText(message) {
		field, message = "request", errorDefinitions[InvalidArgument].message
	}
	return &Error{code: InvalidArgument, fields: []FieldError{{Path: field, Message: message}}}
}

func validFieldText(value string) bool {
	if value == "" || !utf8.ValidString(value) || utf8.RuneCountInString(value) > 256 {
		return false
	}
	for _, character := range value {
		if unicode.IsControl(character) {
			return false
		}
	}
	return true
}

func (err *Error) Code() ErrorCode {
	if err != nil {
		if _, known := errorDefinitions[err.code]; known {
			return err.code
		}
	}
	return InternalError
}

func (err *Error) Status() int {
	return errorDefinitions[err.Code()].status
}

func (err *Error) Error() string {
	return errorDefinitions[err.Code()].message
}

// Unwrap is for internal errors.Is/errors.As use only. Neither Error() nor the
// public response serializes this cause, even when it contains SQL or secrets.
func (err *Error) Unwrap() error {
	if err == nil {
		return nil
	}
	return err.cause
}

// PublicResponse expects the HTTP adapter's server-owned correlation ID.
// Field errors are copied so a response consumer cannot mutate the Error.
// Retryability requires operation-specific evidence; it defaults to false.
func (err *Error) PublicResponse(requestID string) ErrorResponse {
	fields := make([]FieldError, 0)
	if err != nil && err.Code() == InvalidArgument {
		fields = make([]FieldError, min(len(err.fields), 100))
		copy(fields, err.fields)
	}
	return ErrorResponse{
		Success: false, Code: err.Code(), Message: err.Error(), RequestID: requestID,
		Data: ErrorData{FieldErrors: fields, Retryable: false},
	}
}

// NormalizeError preserves a controlled error through ordinary wrapping.
// Unknown errors, nil and typed-nil values become a generic internal error.
// Context cancellation alone does not establish a step or billing outcome.
func NormalizeError(err error) *Error {
	var controlled *Error
	if errors.As(err, &controlled) && controlled != nil {
		return controlled
	}
	return NewError(InternalError, err)
}
