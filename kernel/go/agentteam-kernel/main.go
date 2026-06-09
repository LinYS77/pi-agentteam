package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"
)

const protocolVersion = 1
const helperVersion = "0.3.0-read-model-shadow"

var capabilities = []string{"health", "profile", "tmuxSnapshotParse", "compactReadModelFingerprint"}

type rpcRequest struct {
	JSONRPC string                 `json:"jsonrpc"`
	ID      any                    `json:"id,omitempty"`
	Method  string                 `json:"method"`
	Params  map[string]any         `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	JSONRPC string    `json:"jsonrpc"`
	ID      any       `json:"id,omitempty"`
	Result  any       `json:"result,omitempty"`
	Error   *rpcError `json:"error,omitempty"`
}

type healthResult struct {
	OK                     bool     `json:"ok"`
	Implementation         string   `json:"implementation"`
	ProtocolVersion        int      `json:"protocolVersion"`
	HelperVersion          string   `json:"helperVersion"`
	Capabilities           []string `json:"capabilities"`
	BusinessPathsConnected bool     `json:"businessPathsConnected"`
}

type profileResult struct {
	healthResult
	Profile map[string]any `json:"profile"`
}

type tmuxPaneSnapshotItem struct {
	PaneID         string `json:"paneId"`
	Target         string `json:"target"`
	Label          string `json:"label"`
	CurrentCommand string `json:"currentCommand"`
}

type tmuxSnapshotResult struct {
	CapturedAt int64                           `json:"capturedAt"`
	Panes      []tmuxPaneSnapshotItem          `json:"panes"`
	ByPaneID   map[string]tmuxPaneSnapshotItem `json:"byPaneId"`
	OK         bool                            `json:"ok"`
}

type compactReadModelResult struct {
	OK                bool   `json:"ok"`
	Projection        any    `json:"projection"`
	Fingerprint       string `json:"fingerprint"`
	InputKind         string `json:"inputKind"`
	ReadOnly          bool   `json:"readOnly"`
	FullTextIncluded  bool   `json:"fullTextIncluded"`
	StateFilesRead    bool   `json:"stateFilesRead"`
	StateFilesWritten bool   `json:"stateFilesWritten"`
}

func health() healthResult {
	return healthResult{
		OK:                     true,
		Implementation:         "go",
		ProtocolVersion:        protocolVersion,
		HelperVersion:          helperVersion,
		Capabilities:           append([]string(nil), capabilities...),
		BusinessPathsConnected: false,
	}
}

func profile(params map[string]any) profileResult {
	if params == nil {
		params = map[string]any{}
	}
	return profileResult{
		healthResult: health(),
		Profile: map[string]any{
			"scope":                      "skeleton-only",
			"params":                     params,
			"stateConnected":             false,
			"tmuxConnected":              false,
			"tmuxSnapshotParseConnected":           true,
			"compactReadModelFingerprintConnected": true,
			"panelConnected":                       false,
			"taskReportPlanRunConnected": false,
		},
	}
}

func stringParam(params map[string]any, key string) string {
	if params == nil {
		return ""
	}
	value, ok := params[key]
	if !ok || value == nil {
		return ""
	}
	return fmt.Sprint(value)
}

func int64Param(params map[string]any, key string) int64 {
	if params == nil {
		return 0
	}
	switch value := params[key].(type) {
	case float64:
		return int64(value)
	case int64:
		return value
	case int:
		return int64(value)
	default:
		return 0
	}
}

func parseTmuxSnapshot(params map[string]any) tmuxSnapshotResult {
	stdout := stringParam(params, "stdout")
	capturedAt := int64Param(params, "capturedAt")
	byPaneID := map[string]tmuxPaneSnapshotItem{}
	order := []string{}
	for _, line := range splitLines(stdout) {
		if line == "" {
			continue
		}
		fields := splitTabs(line)
		if len(fields) < 4 {
			continue
		}
		paneID := fields[0]
		if paneID == "" {
			continue
		}
		if _, exists := byPaneID[paneID]; !exists {
			order = append(order, paneID)
		}
		byPaneID[paneID] = tmuxPaneSnapshotItem{
			PaneID:         paneID,
			Target:         fields[1],
			Label:          fields[2],
			CurrentCommand: fields[3],
		}
	}
	panes := make([]tmuxPaneSnapshotItem, 0, len(order))
	for _, paneID := range order {
		if item, ok := byPaneID[paneID]; ok {
			panes = append(panes, item)
		}
	}
	return tmuxSnapshotResult{
		CapturedAt: capturedAt,
		Panes:      panes,
		ByPaneID:   byPaneID,
		OK:         true,
	}
}

func splitLines(text string) []string {
	lines := []string{}
	start := 0
	for index, ch := range text {
		if ch == '\n' {
			line := text[start:index]
			if len(line) > 0 && line[len(line)-1] == '\r' {
				line = line[:len(line)-1]
			}
			lines = append(lines, line)
			start = index + 1
		}
	}
	if start <= len(text) {
		line := text[start:]
		if len(line) > 0 && line[len(line)-1] == '\r' {
			line = line[:len(line)-1]
		}
		lines = append(lines, line)
	}
	return lines
}

func splitTabs(line string) []string {
	fields := []string{}
	start := 0
	for index, ch := range line {
		if ch == '\t' {
			fields = append(fields, line[start:index])
			start = index + 1
		}
	}
	fields = append(fields, line[start:])
	return fields
}

func compactReadModelFingerprint(params map[string]any) compactReadModelResult {
	projection := any(nil)
	if params != nil {
		projection = params["input"]
	}
	return compactReadModelResult{
		OK:                true,
		Projection:        projection,
		Fingerprint:       stableStringify(projection),
		InputKind:         "compact-panel-data",
		ReadOnly:          true,
		FullTextIncluded:  false,
		StateFilesRead:    false,
		StateFilesWritten: false,
	}
}

func stableStringify(value any) string {
	switch v := value.(type) {
	case nil:
		return "null"
	case string:
		encoded, _ := json.Marshal(v)
		return string(encoded)
	case bool:
		if v {
			return "true"
		}
		return "false"
	case float64:
		if v == float64(int64(v)) {
			return strconv.FormatInt(int64(v), 10)
		}
		return strconv.FormatFloat(v, 'f', -1, 64)
	case []any:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			parts = append(parts, stableStringify(item))
		}
		return "[" + strings.Join(parts, ",") + "]"
	case map[string]any:
		keys := make([]string, 0, len(v))
		for key, item := range v {
			if item != nil {
				keys = append(keys, key)
			}
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, key := range keys {
			encodedKey, _ := json.Marshal(key)
			parts = append(parts, string(encodedKey)+":"+stableStringify(v[key]))
		}
		return "{" + strings.Join(parts, ",") + "}"
	default:
		encoded, _ := json.Marshal(v)
		return string(encoded)
	}
}

func handle(request rpcRequest) rpcResponse {
	if request.JSONRPC != "2.0" {
		return rpcResponse{JSONRPC: "2.0", ID: request.ID, Error: &rpcError{Code: -32600, Message: "invalid JSON-RPC version"}}
	}
	switch request.Method {
	case "health":
		return rpcResponse{JSONRPC: "2.0", ID: request.ID, Result: health()}
	case "profile":
		return rpcResponse{JSONRPC: "2.0", ID: request.ID, Result: profile(request.Params)}
	case "tmuxSnapshotParse":
		return rpcResponse{JSONRPC: "2.0", ID: request.ID, Result: parseTmuxSnapshot(request.Params)}
	case "compactReadModelFingerprint":
		return rpcResponse{JSONRPC: "2.0", ID: request.ID, Result: compactReadModelFingerprint(request.Params)}
	default:
		return rpcResponse{JSONRPC: "2.0", ID: request.ID, Error: &rpcError{Code: -32601, Message: "method not found"}}
	}
}

func run(input io.Reader, output io.Writer) error {
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
	encoder := json.NewEncoder(output)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var request rpcRequest
		if err := json.Unmarshal(line, &request); err != nil {
			if encodeErr := encoder.Encode(rpcResponse{JSONRPC: "2.0", Error: &rpcError{Code: -32700, Message: "parse error"}}); encodeErr != nil {
				return encodeErr
			}
			continue
		}
		if err := encoder.Encode(handle(request)); err != nil {
			return err
		}
	}
	return scanner.Err()
}

func main() {
	if err := run(os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
