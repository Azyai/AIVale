package common

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strconv"
	"unicode/utf8"

	kitutil "github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
	"github.com/gin-gonic/gin/binding"
)

type RawMessage = json.RawMessage

var ErrInvalidJSONObject = errors.New("JSON object is invalid")

// UnmarshalJSONObjectStrict keeps the strict object parser at the host codec
// boundary. Keys are compared after decoding escapes, and malformed Unicode is
// rejected instead of being silently replaced by the standard JSON decoder.
func UnmarshalJSONObjectStrict(data []byte) (map[string]RawMessage, error) {
	if !utf8.Valid(data) || !json.Valid(data) {
		return nil, ErrInvalidJSONObject
	}
	inString := false
	for index := 0; index < len(data); index++ {
		if data[index] == '"' {
			inString = !inString
			continue
		}
		if !inString || data[index] != '\\' {
			continue
		}
		index++
		if data[index] != 'u' {
			continue // consume any escaped quote or backslash as a pair.
		}
		unit, err := strconv.ParseUint(string(data[index+1:index+5]), 16, 16)
		if err != nil || unit >= 0xdc00 && unit <= 0xdfff {
			return nil, ErrInvalidJSONObject
		}
		index += 4
		if unit < 0xd800 || unit > 0xdbff {
			continue
		}
		if len(data)-index-1 < 6 || data[index+1] != '\\' || data[index+2] != 'u' {
			return nil, ErrInvalidJSONObject
		}
		low, err := strconv.ParseUint(string(data[index+3:index+7]), 16, 16)
		if err != nil || low < 0xdc00 || low > 0xdfff {
			return nil, ErrInvalidJSONObject
		}
		index += 6
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	opening, err := decoder.Token()
	if err != nil || opening != json.Delim('{') {
		return nil, ErrInvalidJSONObject
	}
	type objectFrame struct {
		keys       map[string]struct{}
		expectsKey bool
	}
	frames := []objectFrame{{keys: make(map[string]struct{}), expectsKey: true}}
	for len(frames) > 0 {
		token, err := decoder.Token()
		if err != nil {
			return nil, ErrInvalidJSONObject
		}
		current := &frames[len(frames)-1]
		if delimiter, container := token.(json.Delim); container {
			if delimiter == '}' || delimiter == ']' {
				frames = frames[:len(frames)-1]
				continue
			}
			current.expectsKey = true // the opening container is its parent's value.
			frame := objectFrame{}
			if delimiter == '{' {
				frame.keys = make(map[string]struct{})
				frame.expectsKey = true
			}
			frames = append(frames, frame)
			continue
		}
		if current.keys == nil {
			continue // an array value does not have object keys.
		}
		if !current.expectsKey {
			current.expectsKey = true
			continue
		}
		key, valid := token.(string)
		if !valid {
			return nil, ErrInvalidJSONObject
		}
		if _, duplicate := current.keys[key]; duplicate {
			return nil, ErrInvalidJSONObject
		}
		current.keys[key] = struct{}{}
		current.expectsKey = false
	}
	var fields map[string]RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return nil, ErrInvalidJSONObject
	}
	return fields, nil // json.Valid already requires exactly one complete value.
}

// hostJSONCodec is the single place where the host chooses its JSON engine.
// Swap the implementation here (for example to sonic.ConfigStd) and every
// common.* and kitutil.* JSON helper, including relaykit DTO (un)marshalling,
// follows. Injected from init() rather than main() so tests run on the same
// engine as production: common is imported by virtually every root package
// and test binary, while main() never executes under `go test`.
type hostJSONCodec struct{}

func (hostJSONCodec) Marshal(v any) ([]byte, error) {
	return json.Marshal(v)
}

func (hostJSONCodec) Unmarshal(data []byte, v any) error {
	return json.Unmarshal(data, v)
}

func (hostJSONCodec) Decode(r io.Reader, v any) error {
	return json.NewDecoder(r).Decode(v)
}

func (hostJSONCodec) Valid(data []byte) bool {
	return json.Valid(data)
}

func init() {
	kitutil.SetCodec(hostJSONCodec{})
}

func Unmarshal(data []byte, v any) error {
	return kitutil.Unmarshal(data, v)
}

func UnmarshalJsonStr(data string, v any) error {
	return kitutil.UnmarshalJsonStr(data, v)
}

func DecodeJson(reader io.Reader, v any) error {
	return kitutil.DecodeJson(reader, v)
}

// DecodeJsonWithValidation decodes JSON and applies Gin's configured binding-tag
// validator, including binding:"required" and any registered custom validators.
func DecodeJsonWithValidation(reader io.Reader, v any) error {
	if err := DecodeJson(reader, v); err != nil {
		return err
	}
	if binding.Validator == nil {
		return nil
	}
	return binding.Validator.ValidateStruct(v)
}

func Marshal(v any) ([]byte, error) {
	return kitutil.Marshal(v)
}

func IndentJson(data []byte) ([]byte, error) {
	var buffer bytes.Buffer
	if err := json.Indent(&buffer, data, "", "  "); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func GetJsonType(data RawMessage) string {
	return kitutil.GetJsonType(data)
}

// JsonRawMessageToString returns JSON strings as their decoded value and other JSON values as raw text.
func JsonRawMessageToString(data RawMessage) string {
	return kitutil.JsonRawMessageToString(data)
}
