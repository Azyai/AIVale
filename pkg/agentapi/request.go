package agentapi

import (
	"bytes"
	"errors"
	"io"
	"mime"
	"net/http"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
	"github.com/gin-gonic/gin"
)

const MaxJSONRequestBytes int64 = 1 << 20

// ReadJSONObject admits only the endpoint's exact fields. It does not bind an
// ORM entity or permit a query/body field to supply tenant or actor identity.
func ReadJSONObject(c *gin.Context, allowedFields ...string) (map[string]common.RawMessage, error) {
	if c.Request.URL.RawQuery != "" || c.Request.URL.ForceQuery {
		return nil, agenttypes.NewInvalidArgument("query", "This operation does not accept query parameters")
	}
	contentTypes := c.Request.Header.Values("Content-Type")
	if len(contentTypes) != 1 {
		return nil, agenttypes.NewInvalidArgument("content_type", "Content type must be application/json")
	}
	mediaType, parameters, err := mime.ParseMediaType(contentTypes[0])
	if err != nil || mediaType != "application/json" || len(parameters) > 1 {
		return nil, agenttypes.NewInvalidArgument("content_type", "Content type must be application/json")
	}
	for key, value := range parameters {
		if key != "charset" || !strings.EqualFold(value, "utf-8") {
			return nil, agenttypes.NewInvalidArgument("content_type", "Only UTF-8 JSON is supported")
		}
	}
	encodings := c.Request.Header.Values("Content-Encoding")
	if len(encodings) > 1 || len(encodings) == 1 && encodings[0] != "" && !strings.EqualFold(encodings[0], "identity") {
		return nil, agenttypes.NewInvalidArgument("content_encoding", "Content encoding must be identity")
	}
	if c.Request.Body == nil {
		return nil, agenttypes.NewInvalidArgument("body", "A JSON object is required")
	}
	data, err := io.ReadAll(io.LimitReader(c.Request.Body, MaxJSONRequestBytes+1))
	var tooLarge *http.MaxBytesError
	if int64(len(data)) > MaxJSONRequestBytes || errors.As(err, &tooLarge) {
		return nil, agenttypes.NewError(agenttypes.PayloadTooLarge, nil)
	}
	if err != nil {
		return nil, agenttypes.NewInvalidArgument("body", "The request body could not be read")
	}
	fields, err := common.UnmarshalJSONObjectStrict(data)
	if err != nil {
		return nil, agenttypes.NewInvalidArgument("body", "A valid JSON object with unique fields is required")
	}
	for key, value := range fields {
		if !slices.Contains(allowedFields, key) {
			return nil, agenttypes.NewInvalidArgument("body", "The request contains an unsupported field")
		}
		if common.GetJsonType(value) == "null" {
			return nil, agenttypes.NewInvalidArgument("body", "Request fields must not be null")
		}
	}
	return fields, nil
}

// ReadIdempotencyKey preserves the caller's visible ASCII key without trimming.
// Only its hash may enter persistent identifiers or audit metadata.
func ReadIdempotencyKey(c *gin.Context) (string, error) {
	values := c.Request.Header.Values("Idempotency-Key")
	if len(values) != 1 || len(values[0]) < 16 || len(values[0]) > 128 {
		return "", agenttypes.NewInvalidArgument("idempotency_key", "One idempotency key of 16 to 128 visible ASCII characters is required")
	}
	for _, character := range []byte(values[0]) {
		if character < 0x21 || character > 0x7e {
			return "", agenttypes.NewInvalidArgument("idempotency_key", "Idempotency key must contain only visible ASCII characters")
		}
	}
	return values[0], nil
}

// ParseJSONRevision checks the raw integer spelling before any conversion.
func ParseJSONRevision(raw common.RawMessage) (int64, error) {
	value, err := ParseID(string(bytes.TrimSpace(raw)))
	if err != nil || value > agenttypes.MaxSafeInteger {
		return 0, agenttypes.NewInvalidArgument("expected_revision", "Expected revision must be a positive safe JSON integer")
	}
	return value, nil
}
