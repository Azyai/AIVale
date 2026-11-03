// Package agentapi adapts the host Agent contract to HTTP. It does not register
// routes, resolve tenant authorization or perform database operations.
package agentapi

import (
	"context"
	"net/http"
	"net/url"

	"github.com/QuantumNous/new-api/common"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

// RequestID uses server-owned context only, never an incoming correlation header.
func RequestID(c *gin.Context) string {
	id := c.GetString(common.RequestIdKey)
	valid := len(id) > 0 && len(id) <= 64
	for i := 0; valid && i < len(id); i++ {
		character := id[i]
		valid = (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') || character == '-' || character == '_' || character == '.' || character == ':'
	}
	if !valid {
		id = common.NewRequestId()
	}
	c.Set(common.RequestIdKey, id)
	c.Header(common.RequestIdKey, id)
	if c.Request != nil {
		c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), common.RequestIdKey, id))
	}
	return id
}

// WriteSuccess preserves operation-specific status/code semantics. Encoding is
// completed before headers are sent, so encoding failures can still return 500.
func WriteSuccess[T any](c *gin.Context, status int, code string, data T) {
	if (status != http.StatusOK && status != http.StatusCreated && status != http.StatusAccepted) ||
		(status == http.StatusAccepted && code != "ACCEPTED") || (status != http.StatusAccepted && code != "OK") {
		WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
		return
	}
	payload := agenttypes.SuccessResponse[T]{
		Success: true, Code: code, Message: "", RequestID: RequestID(c), Data: data,
	}
	encoded, err := common.Marshal(payload)
	if err != nil {
		WriteError(c, err)
		return
	}
	if c.Writer.Written() {
		c.Abort()
		return
	}
	c.Header("Cache-Control", "no-store")
	c.Abort()
	c.Data(status, "application/json; charset=utf-8", encoded)
}

// WriteError selects public text from the controlled catalogue. Internal error
// text, SQL, upstream responses and credentials are neither returned nor logged.
func WriteError(c *gin.Context, err error) {
	problem := agenttypes.NormalizeError(err)
	id := RequestID(c)
	if problem.Code() == agenttypes.InternalError {
		common.SysError("Agent API request failed: code=AG_INTERNAL_ERROR request_id=" + id)
	}
	if c.Writer.Written() {
		c.Abort()
		return
	}
	encoded, encodeErr := common.Marshal(problem.PublicResponse(id))
	c.Header("Cache-Control", "no-store")
	c.Abort()
	if encodeErr != nil {
		// A broken codec must not fall back to printing its error or private cause.
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Data(problem.Status(), "application/json; charset=utf-8", encoded)
}

// Recover must be deferred directly by the Agent namespace boundary. A response
// already on the wire cannot have its status rewritten; abort without appending
// panic text. Legacy routes keep their existing recovery policy.
func Recover(c *gin.Context) {
	if recover() != nil {
		WriteError(c, agenttypes.NewError(agenttypes.InternalError, nil))
	}
}

// ReadPageQuery rejects malformed escaping before the strict query parser sees
// values; URL.Query would silently discard some malformed parameters.
func ReadPageQuery(c *gin.Context) (agenttypes.PageQuery, error) {
	values, err := url.ParseQuery(c.Request.URL.RawQuery)
	if err != nil {
		return agenttypes.PageQuery{}, agenttypes.NewInvalidArgument("query", "Query encoding is invalid")
	}
	return ParsePageQuery(values)
}
