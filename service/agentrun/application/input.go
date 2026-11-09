package application

import (
	"bytes"
	"encoding/json"
	"errors"
	"math/big"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
)

var errRunObject = errors.New("invalid Run object")

// Canonical input preserves decimal values exactly. No value is decoded via
// float64, including nested arrays, hashes and schema bound comparisons.
func normalizeRunObject(raw []byte, maxBytes int) (map[string]any, []byte, error) {
	if len(raw) == 0 || len(raw) > maxBytes {
		return nil, nil, errRunObject
	}
	if _, err := common.UnmarshalJSONObjectStrict(raw); err != nil {
		return nil, nil, errRunObject
	}
	remaining := 4096
	value, err := normalizeRunValue(raw, 0, &remaining)
	object, ok := value.(map[string]any)
	if err != nil || !ok {
		return nil, nil, errRunObject
	}
	canonical, err := common.Marshal(object)
	if err != nil || len(canonical) > maxBytes {
		return nil, nil, errRunObject
	}
	return object, canonical, nil
}

func normalizeRunValue(raw []byte, depth int, remaining *int) (any, error) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || depth > 16 || *remaining <= 0 {
		return nil, errRunObject
	}
	*remaining--
	switch raw[0] {
	case '{':
		fields, err := common.UnmarshalJSONObjectStrict(raw)
		if err != nil {
			return nil, errRunObject
		}
		result := make(map[string]any, len(fields))
		for key, value := range fields {
			parsed, err := normalizeRunValue(value, depth+1, remaining)
			if err != nil {
				return nil, err
			}
			result[key] = parsed
		}
		return result, nil
	case '[':
		var values []common.RawMessage
		if common.Unmarshal(raw, &values) != nil {
			return nil, errRunObject
		}
		result := make([]any, len(values))
		for index, value := range values {
			parsed, err := normalizeRunValue(value, depth+1, remaining)
			if err != nil {
				return nil, err
			}
			result[index] = parsed
		}
		return result, nil
	case '"':
		var value string
		if common.Unmarshal(raw, &value) != nil {
			return nil, errRunObject
		}
		return value, nil
	case 't', 'f':
		var value bool
		if common.Unmarshal(raw, &value) != nil {
			return nil, errRunObject
		}
		return value, nil
	case 'n':
		if string(raw) != "null" {
			return nil, errRunObject
		}
		return nil, nil
	default:
		if len(raw) > 128 {
			return nil, errRunObject
		}
		if offset := bytes.IndexAny(raw, "eE"); offset >= 0 {
			exponent, err := strconv.ParseInt(string(raw[offset+1:]), 10, 32)
			if err != nil || exponent < -308 || exponent > 308 {
				return nil, errRunObject
			}
		}
		value, err := decimal.NewFromString(string(raw))
		if err != nil {
			return nil, errRunObject
		}
		return json.Number(value.String()), nil
	}
}

// Reserved authority names cannot become a second control channel inside a
// business correlation object. Check nested objects as well as the root.
func runMetadataFieldsAllowed(raw []byte) bool {
	var fields map[string]common.RawMessage
	if common.Unmarshal(raw, &fields) != nil || len(fields) > 32 {
		return false
	}
	reserved := []string{"authorization", "password", "secret", "token", "api_key", "key", "access_token", "caller_token_id", "funding_token_id", "team_id", "workspace_id", "user_id", "created_by", "subject_id", "subject_type", "permissions", "auth_snapshot", "auth_snapshot_json", "budget", "limits", "mode", "trigger_type", "priority", "admission", "version_id", "agent_version_id"}
	for key, value := range fields {
		if key == "" || len(key) > 128 || strings.ContainsRune(key, 0) || slices.Contains(reserved, strings.ToLower(key)) {
			return false
		}
		trimmed := bytes.TrimSpace(value)
		// Correlation metadata is deliberately flat. Inputs carry structured data.
		if len(trimmed) == 0 || trimmed[0] == '{' || trimmed[0] == '[' {
			return false
		}
	}
	return true
}

// The published configuration admits a small inline keyword vocabulary.
// Evaluate that same vocabulary with exact rationals; no $ref, network loader,
// executable expression or float-based schema bound can enter this path.
func runInputMatchesSchema(value any, raw common.RawMessage) bool {
	fields, err := common.UnmarshalJSONObjectStrict(raw)
	if err != nil {
		return false
	}
	if len(fields) == 0 {
		return true
	}
	var kind string
	if common.Unmarshal(fields["type"], &kind) != nil {
		return false
	}
	countWithin := func(length int, minimum, maximum string) bool {
		for index, name := range []string{minimum, maximum} {
			if encoded, present := fields[name]; present {
				var bound int
				if common.Unmarshal(encoded, &bound) != nil || index == 0 && length < bound || index == 1 && length > bound {
					return false
				}
			}
		}
		return true
	}
	switch kind {
	case "object":
		object, ok := value.(map[string]any)
		if !ok || !countWithin(len(object), "minProperties", "maxProperties") {
			return false
		}
		var required []string
		if encoded, present := fields["required"]; present && common.Unmarshal(encoded, &required) != nil {
			return false
		}
		for _, key := range required {
			if _, present := object[key]; !present {
				return false
			}
		}
		properties := map[string]common.RawMessage{}
		if encoded, present := fields["properties"]; present && common.Unmarshal(encoded, &properties) != nil {
			return false
		}
		additional := true
		if encoded, present := fields["additionalProperties"]; present && common.Unmarshal(encoded, &additional) != nil {
			return false
		}
		for key, child := range object {
			if schema, present := properties[key]; present {
				if !runInputMatchesSchema(child, schema) {
					return false
				}
			} else if !additional {
				return false
			}
		}
		return true
	case "array":
		array, ok := value.([]any)
		if !ok || !countWithin(len(array), "minItems", "maxItems") {
			return false
		}
		if schema, present := fields["items"]; present {
			for _, child := range array {
				if !runInputMatchesSchema(child, schema) {
					return false
				}
			}
		}
		return true
	case "string":
		text, ok := value.(string)
		return ok && countWithin(utf8.RuneCountInString(text), "minLength", "maxLength")
	case "number", "integer":
		number, ok := value.(json.Number)
		if !ok {
			return false
		}
		exact, ok := new(big.Rat).SetString(string(number))
		if !ok || kind == "integer" && !exact.IsInt() {
			return false
		}
		for index, name := range []string{"minimum", "maximum"} {
			if encoded, present := fields[name]; present {
				bound, ok := new(big.Rat).SetString(string(encoded))
				if !ok || index == 0 && exact.Cmp(bound) < 0 || index == 1 && exact.Cmp(bound) > 0 {
					return false
				}
			}
		}
		return true
	case "boolean":
		_, ok := value.(bool)
		return ok
	case "null":
		return value == nil
	default:
		return false
	}
}
