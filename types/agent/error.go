// Package agent contains transport types owned by the host Agent platform.
// It has no dependency on relaykit, tokenkit, a web framework or database code.
package agent

type ErrorCode string

const RuntimeUnavailable ErrorCode = "AG_RUNTIME_UNAVAILABLE"

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
