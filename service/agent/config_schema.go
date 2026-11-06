package agent

import (
	"bytes"
	"errors"
	"math/big"
	"slices"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	agenttypes "github.com/QuantumNous/new-api/types/agent"
)

const (
	agentSchemaMaxBytes       = 16 * 1024
	agentSchemaMaxDepth       = 12
	agentSchemaMaxNodes       = 256
	agentSchemaMaxProperties  = 64
	agentSchemaMaxItems       = 256
	agentSchemaMaxStringRunes = 32 * 1024
)

var errAgentConfigSchema = errors.New("invalid or unsupported Agent configuration schema")

// normalizeAgentConfigSchema accepts only an inline, bounded object contract.
// It never evaluates a schema or resolves references, URLs, or expressions.
func normalizeAgentConfigSchema(raw []byte) ([]byte, error) {
	if len(raw) == 0 || len(raw) > agentSchemaMaxBytes {
		return nil, errAgentConfigSchema
	}
	remaining := agentSchemaMaxNodes
	normalized, err := normalizeAgentSchemaNode(raw, 1, &remaining)
	if err != nil || len(normalized) > agentSchemaMaxBytes {
		return nil, errAgentConfigSchema
	}
	return normalized, nil
}

func normalizeAgentSchemaNode(raw []byte, depth int, remaining *int) ([]byte, error) {
	if depth > agentSchemaMaxDepth || *remaining <= 0 {
		return nil, errAgentConfigSchema
	}
	*remaining--
	fields, err := common.UnmarshalJSONObjectStrict(raw)
	if err != nil {
		return nil, errAgentConfigSchema
	}
	if len(fields) == 0 {
		return []byte(`{}`), nil
	}
	var kind string
	if err := common.Unmarshal(fields["type"], &kind); err != nil ||
		!slices.Contains([]string{"object", "array", "string", "integer", "number", "boolean", "null"}, kind) || depth == 1 && kind != "object" {
		return nil, errAgentConfigSchema
	}
	for keyword := range fields {
		switch keyword {
		case "type", "title", "description":
			continue
		case "properties", "required", "additionalProperties", "minProperties", "maxProperties":
			if kind == "object" {
				continue
			}
		case "items", "minItems", "maxItems":
			if kind == "array" {
				continue
			}
		case "minLength", "maxLength":
			if kind == "string" {
				continue
			}
		case "minimum", "maximum":
			if kind == "integer" || kind == "number" {
				continue
			}
		}
		return nil, errAgentConfigSchema
	}
	result := map[string]any{"type": kind}
	for _, annotation := range []struct {
		keyword string
		limit   int
	}{{"title", 128}, {"description", 512}} {
		if raw, present := fields[annotation.keyword]; present {
			var text string
			if err := common.Unmarshal(raw, &text); err != nil || !agentSchemaTextValid(text, annotation.limit) {
				return nil, errAgentConfigSchema
			}
			result[annotation.keyword] = text
		}
	}

	switch kind {
	case "object":
		if err := normalizeAgentSchemaObject(fields, result, depth, remaining); err != nil {
			return nil, err
		}
	case "array":
		if raw, present := fields["items"]; present {
			items, err := normalizeAgentSchemaNode(raw, depth+1, remaining)
			if err != nil {
				return nil, err
			}
			result["items"] = common.RawMessage(items)
		}
		if _, _, err := normalizeAgentSchemaCounts(fields, result, "minItems", "maxItems", agentSchemaMaxItems); err != nil {
			return nil, err
		}
	case "string":
		if _, _, err := normalizeAgentSchemaCounts(fields, result, "minLength", "maxLength", agentSchemaMaxStringRunes); err != nil {
			return nil, err
		}
	case "integer", "number":
		var minimum, maximum *big.Rat
		for index, keyword := range []string{"minimum", "maximum"} {
			if raw, present := fields[keyword]; present {
				canonical, numeric, err := normalizeAgentSchemaNumber(raw, kind == "integer")
				if err != nil {
					return nil, err
				}
				result[keyword] = common.RawMessage(canonical)
				if index == 0 {
					minimum = numeric
				} else {
					maximum = numeric
				}
			}
		}
		if minimum != nil && maximum != nil && minimum.Cmp(maximum) > 0 {
			return nil, errAgentConfigSchema
		}
	}
	return common.Marshal(result)
}

func normalizeAgentSchemaObject(fields map[string]common.RawMessage, result map[string]any, depth int, remaining *int) error {
	properties := map[string]common.RawMessage{}
	if raw, present := fields["properties"]; present {
		declared, err := common.UnmarshalJSONObjectStrict(raw)
		if err != nil || len(declared) > agentSchemaMaxProperties {
			return errAgentConfigSchema
		}
		for name, child := range declared {
			if !agentSchemaTextValid(name, 128) || strings.HasPrefix(name, "$") ||
				slices.Contains([]string{"__proto__", "prototype", "constructor"}, name) {
				return errAgentConfigSchema
			}
			normalized, err := normalizeAgentSchemaNode(child, depth+1, remaining)
			if err != nil {
				return err
			}
			properties[name] = normalized
		}
		result["properties"] = properties
	}
	var required []string
	if raw, present := fields["required"]; present {
		if err := common.Unmarshal(raw, &required); err != nil || required == nil || len(required) > len(properties) {
			return errAgentConfigSchema
		}
		slices.Sort(required)
		for i, name := range required {
			if _, declared := properties[name]; !declared || i > 0 && required[i-1] == name {
				return errAgentConfigSchema
			}
		}
		result["required"] = required
	}
	allowExtra := true
	if raw, present := fields["additionalProperties"]; present {
		switch string(bytes.TrimSpace(raw)) {
		case "true":
		case "false":
			allowExtra = false
		default:
			return errAgentConfigSchema
		}
		result["additionalProperties"] = allowExtra
	}
	minimum, maximum, err := normalizeAgentSchemaCounts(fields, result, "minProperties", "maxProperties", agentSchemaMaxProperties)
	if err != nil || maximum >= 0 && maximum < int64(len(required)) || !allowExtra && minimum > int64(len(properties)) {
		return errAgentConfigSchema
	}
	return nil
}

// A missing constraint is returned as -1. Counts use plain, nonnegative JSON
// integers so that 1.0, 1e0, negative zero, and quoted numbers cannot be coerced.
func normalizeAgentSchemaCounts(fields map[string]common.RawMessage, result map[string]any, minimumKey, maximumKey string, limit int64) (int64, int64, error) {
	bounds := [2]int64{-1, -1}
	for i, key := range []string{minimumKey, maximumKey} {
		if raw, present := fields[key]; present {
			literal := string(bytes.TrimSpace(raw))
			value, err := strconv.ParseInt(literal, 10, 64)
			if err != nil || value < 0 || value > limit || strconv.FormatInt(value, 10) != literal {
				return -1, -1, errAgentConfigSchema
			}
			bounds[i], result[key] = value, value
		}
	}
	if bounds[1] >= 0 && bounds[0] > bounds[1] {
		return -1, -1, errAgentConfigSchema
	}
	return bounds[0], bounds[1], nil
}

func normalizeAgentSchemaNumber(raw []byte, integerOnly bool) ([]byte, *big.Rat, error) {
	literal := string(bytes.TrimSpace(raw))
	unsigned, negative := strings.CutPrefix(literal, "-")
	whole, fraction, decimal := strings.Cut(unsigned, ".")
	wholeNumber, err := strconv.ParseInt(whole, 10, 64)
	if err != nil || wholeNumber < 0 || wholeNumber > agenttypes.MaxSafeInteger || strconv.FormatInt(wholeNumber, 10) != whole ||
		decimal && (integerOnly || len(fraction) == 0 || len(fraction) > 6) || strings.ContainsFunc(fraction, func(c rune) bool { return c < '0' || c > '9' }) {
		return nil, nil, errAgentConfigSchema
	}
	fraction = strings.TrimRight(fraction, "0")
	if wholeNumber == agenttypes.MaxSafeInteger && fraction != "" {
		return nil, nil, errAgentConfigSchema
	}
	canonical := whole
	if fraction != "" {
		canonical += "." + fraction
	}
	if negative && canonical != "0" {
		canonical = "-" + canonical
	}
	// Refuse decimals that would silently round to a different number in a
	// browser. Compare the accepted bounds exactly below, without float math.
	approximate, err := strconv.ParseFloat(canonical, 64)
	if err != nil || strconv.FormatFloat(approximate, 'f', -1, 64) != canonical {
		return nil, nil, errAgentConfigSchema
	}
	value, ok := new(big.Rat).SetString(canonical)
	if !ok {
		return nil, nil, errAgentConfigSchema
	}
	return []byte(canonical), value, nil
}

func agentSchemaTextValid(value string, maxRunes int) bool {
	return strings.TrimSpace(value) != "" && utf8.ValidString(value) && utf8.RuneCountInString(value) <= maxRunes &&
		!strings.ContainsFunc(value, unicode.IsControl)
}
