package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"time"
)

const protocolVersion = 1
const helperVersion = "0.3.0-read-model-shadow"

var capabilities = []string{"health", "profile", "tmuxSnapshotParse", "tmuxSnapshotCapture", "compactReadModelFingerprint", "workerLifecycle", "tmuxAvailability"}

type rpcRequest struct {
	JSONRPC string         `json:"jsonrpc"`
	ID      any            `json:"id,omitempty"`
	Method  string         `json:"method"`
	Params  map[string]any `json:"params,omitempty"`
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

const tmuxPaneSnapshotFormat = "#{pane_id}\t#{session_name}:#{window_id}\t#{@agentteam-name}\t#{pane_current_command}"
const workerLifecycleInspectPaneFormat = "#{pane_id}\t#{session_name}:#{window_id}\t#{pane_current_command}\t#{pane_in_mode}\t#{pane_mode}"
const workerLifecycleCurrentPaneBindingFormat = "#{pane_id}\t#{session_name}:#{window_id}"
const workerLifecycleWindowPaneFormat = "#{pane_id}"
const workerLifecycleAgentTeamWindowFormat = "#{window_id}\t#{@agentteam-window}"
const workerLifecycleWindowNameFormat = "#{window_id}\t#{window_name}"

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
	Status     string                          `json:"status,omitempty"`
	Marker     string                          `json:"resultMarker,omitempty"`
	Module     string                          `json:"module,omitempty"`
	Capability string                          `json:"capability,omitempty"`
	Failure    string                          `json:"cutoverFailureKind,omitempty"`
	Reason     string                          `json:"reason,omitempty"`
	Error      string                          `json:"error,omitempty"`
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

type workerPaneInspectionResult struct {
	OK                bool   `json:"ok"`
	Operation         string `json:"operation"`
	Capability        string `json:"capability"`
	PaneID            string `json:"paneId"`
	RequestedPaneID   string `json:"requestedPaneId"`
	Exists            bool   `json:"exists"`
	Target            string `json:"target,omitempty"`
	CurrentCommand    string `json:"currentCommand,omitempty"`
	InMode            *bool  `json:"inMode,omitempty"`
	Mode              string `json:"mode,omitempty"`
	CopyMode          *bool  `json:"copyMode,omitempty"`
	Status            string `json:"status,omitempty"`
	Marker            string `json:"resultMarker,omitempty"`
	Failure           string `json:"failureKind,omitempty"`
	Reason            string `json:"reason,omitempty"`
	Error             string `json:"error,omitempty"`
	ReadOnly          bool   `json:"readOnly"`
	StateFilesRead    bool   `json:"stateFilesRead"`
	StateFilesWritten bool   `json:"stateFilesWritten"`
	TmuxMutation      bool   `json:"tmuxMutation"`
}

type workerPaneListResult struct {
	OK                bool                            `json:"ok"`
	Operation         string                          `json:"operation"`
	Capability        string                          `json:"capability"`
	Panes             []tmuxPaneSnapshotItem          `json:"panes"`
	ByPaneID          map[string]tmuxPaneSnapshotItem `json:"byPaneId"`
	Status            string                          `json:"status,omitempty"`
	Marker            string                          `json:"resultMarker,omitempty"`
	Failure           string                          `json:"failureKind,omitempty"`
	Reason            string                          `json:"reason,omitempty"`
	Error             string                          `json:"error,omitempty"`
	ReadOnly          bool                            `json:"readOnly"`
	StateFilesRead    bool                            `json:"stateFilesRead"`
	StateFilesWritten bool                            `json:"stateFilesWritten"`
	TmuxMutation      bool                            `json:"tmuxMutation"`
}

type workerPaneBindingResult struct {
	OK                bool   `json:"ok"`
	Operation         string `json:"operation"`
	Capability        string `json:"capability"`
	PaneID            string `json:"paneId,omitempty"`
	Target            string `json:"target,omitempty"`
	Status            string `json:"status,omitempty"`
	Marker            string `json:"resultMarker,omitempty"`
	Failure           string `json:"failureKind,omitempty"`
	Reason            string `json:"reason,omitempty"`
	Error             string `json:"error,omitempty"`
	ReadOnly          bool   `json:"readOnly"`
	StateFilesRead    bool   `json:"stateFilesRead"`
	StateFilesWritten bool   `json:"stateFilesWritten"`
	TmuxMutation      bool   `json:"tmuxMutation"`
}

type workerWindowPaneListResult struct {
	OK                bool     `json:"ok"`
	Operation         string   `json:"operation"`
	Capability        string   `json:"capability"`
	Target            string   `json:"target"`
	Exists            bool     `json:"exists"`
	PaneIDs           []string `json:"paneIds"`
	Status            string   `json:"status,omitempty"`
	Marker            string   `json:"resultMarker,omitempty"`
	Failure           string   `json:"failureKind,omitempty"`
	Reason            string   `json:"reason,omitempty"`
	Error             string   `json:"error,omitempty"`
	ReadOnly          bool     `json:"readOnly"`
	StateFilesRead    bool     `json:"stateFilesRead"`
	StateFilesWritten bool     `json:"stateFilesWritten"`
	TmuxMutation      bool     `json:"tmuxMutation"`
}

type workerAgentTeamWindowTargetResult struct {
	OK                bool   `json:"ok"`
	Operation         string `json:"operation"`
	Capability        string `json:"capability"`
	SessionName       string `json:"sessionName"`
	Exists            bool   `json:"exists"`
	Target            string `json:"target,omitempty"`
	WindowID          string `json:"windowId,omitempty"`
	Status            string `json:"status,omitempty"`
	Marker            string `json:"resultMarker,omitempty"`
	Failure           string `json:"failureKind,omitempty"`
	Reason            string `json:"reason,omitempty"`
	Error             string `json:"error,omitempty"`
	ReadOnly          bool   `json:"readOnly"`
	StateFilesRead    bool   `json:"stateFilesRead"`
	StateFilesWritten bool   `json:"stateFilesWritten"`
	TmuxMutation      bool   `json:"tmuxMutation"`
}

type workerWindowNameTargetResult struct {
	OK                bool   `json:"ok"`
	Operation         string `json:"operation"`
	Capability        string `json:"capability"`
	SessionName       string `json:"sessionName"`
	WindowName        string `json:"windowName"`
	Exists            bool   `json:"exists"`
	Target            string `json:"target,omitempty"`
	WindowID          string `json:"windowId,omitempty"`
	Status            string `json:"status,omitempty"`
	Marker            string `json:"resultMarker,omitempty"`
	Failure           string `json:"failureKind,omitempty"`
	Reason            string `json:"reason,omitempty"`
	Error             string `json:"error,omitempty"`
	ReadOnly          bool   `json:"readOnly"`
	StateFilesRead    bool   `json:"stateFilesRead"`
	StateFilesWritten bool   `json:"stateFilesWritten"`
	TmuxMutation      bool   `json:"tmuxMutation"`
}

type workerSessionExistenceResult struct {
	OK                bool   `json:"ok"`
	Operation         string `json:"operation"`
	Capability        string `json:"capability"`
	SessionName       string `json:"sessionName"`
	Exists            bool   `json:"exists"`
	Status            string `json:"status,omitempty"`
	Marker            string `json:"resultMarker,omitempty"`
	Failure           string `json:"failureKind,omitempty"`
	Reason            string `json:"reason,omitempty"`
	Error             string `json:"error,omitempty"`
	ReadOnly          bool   `json:"readOnly"`
	StateFilesRead    bool   `json:"stateFilesRead"`
	StateFilesWritten bool   `json:"stateFilesWritten"`
	TmuxMutation      bool   `json:"tmuxMutation"`
}

type tmuxAvailabilityResult struct {
	OK                bool   `json:"ok"`
	Capability        string `json:"capability"`
	Available         bool   `json:"available"`
	Version           string `json:"version,omitempty"`
	Status            string `json:"status,omitempty"`
	Marker            string `json:"resultMarker,omitempty"`
	Failure           string `json:"failureKind,omitempty"`
	Reason            string `json:"reason,omitempty"`
	Error             string `json:"error,omitempty"`
	ReadOnly          bool   `json:"readOnly"`
	StateFilesRead    bool   `json:"stateFilesRead"`
	StateFilesWritten bool   `json:"stateFilesWritten"`
	TmuxMutation      bool   `json:"tmuxMutation"`
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
			"scope":                                             "skeleton-only",
			"params":                                            params,
			"stateConnected":                                    false,
			"tmuxConnected":                                     false,
			"tmuxSnapshotParseConnected":                        true,
			"tmuxSnapshotCaptureConnected":                      true,
			"compactReadModelFingerprintConnected":              true,
			"workerLifecycleInspectPaneConnected":               true,
			"workerLifecycleListAgentTeamPanesConnected":        true,
			"workerLifecycleCaptureCurrentPaneBindingConnected": true,
			"workerLifecycleListPanesInWindowConnected":         true,
			"workerLifecycleFindAgentTeamWindowTargetConnected": true,
			"workerLifecycleFindWindowTargetByNameConnected":    true,
			"workerLifecycleSessionExistsConnected":             true,
			"tmuxAvailabilityConnected":                         true,
			"panelConnected":                                    false,
			"taskReportPlanRunConnected":                        false,
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

func unavailableTmuxSnapshot(capturedAt int64, kind string) tmuxSnapshotResult {
	reason := "Go kernel cutover unavailable (" + kind + ")"
	return tmuxSnapshotResult{
		CapturedAt: capturedAt,
		Panes:      []tmuxPaneSnapshotItem{},
		ByPaneID:   map[string]tmuxPaneSnapshotItem{},
		OK:         false,
		Status:     "unknown",
		Marker:     "stale",
		Module:     "tmuxSnapshotCapture",
		Capability: "tmuxSnapshotCapture",
		Failure:    kind,
		Reason:     reason,
		Error:      reason,
	}
}

func captureTmuxSnapshot(params map[string]any) tmuxSnapshotResult {
	capturedAt := int64Param(params, "capturedAt")
	if capturedAt == 0 {
		capturedAt = time.Now().UnixMilli()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat)
	cmd.Env = os.Environ()
	output, err := cmd.Output()
	if ctx.Err() == context.DeadlineExceeded {
		return unavailableTmuxSnapshot(capturedAt, "tmux-command-timeout")
	}
	if err != nil {
		if _, ok := err.(*exec.Error); ok {
			return unavailableTmuxSnapshot(capturedAt, "tmux-unavailable")
		}
		return unavailableTmuxSnapshot(capturedAt, "tmux-command-failed")
	}
	stdout := strings.TrimSpace(string(output))
	if stdout == "" {
		return tmuxSnapshotResult{CapturedAt: capturedAt, Panes: []tmuxPaneSnapshotItem{}, ByPaneID: map[string]tmuxPaneSnapshotItem{}, OK: true}
	}
	return parseTmuxSnapshot(map[string]any{"stdout": stdout, "capturedAt": capturedAt})
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

func tmuxBool(raw string) *bool {
	trimmed := strings.TrimSpace(strings.ToLower(raw))
	if trimmed == "" {
		return nil
	}
	value := trimmed == "1" || trimmed == "true" || trimmed == "yes"
	return &value
}

func compactTmuxWindowTarget(raw string) string {
	target := strings.TrimSpace(raw)
	if target == "" || len(target) > 160 {
		return ""
	}
	for _, ch := range target {
		if ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' {
			continue
		}
		switch ch {
		case '_', '.', '/', ':', '=', '@', '%', '+', '-':
			continue
		default:
			return ""
		}
	}
	return target
}

func compactTmuxSessionName(raw string) string {
	sessionName := strings.TrimSpace(raw)
	if sessionName == "" || len(sessionName) > 160 {
		return ""
	}
	for _, ch := range sessionName {
		if ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' {
			continue
		}
		switch ch {
		case '_', '.', '/', '=', '%', '+', '-':
			continue
		default:
			return ""
		}
	}
	return sessionName
}

func compactTmuxWindowName(raw string) string {
	windowName := strings.TrimSpace(raw)
	if windowName == "" || len(windowName) > 160 {
		return ""
	}
	for _, ch := range windowName {
		if ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' {
			continue
		}
		switch ch {
		case '_', '.', '/', ':', '=', '@', '%', '+', '-', ' ':
			continue
		default:
			return ""
		}
	}
	return strings.Join(strings.Fields(windowName), " ")
}

func compactKernelText(raw string) string {
	text := strings.TrimSpace(raw)
	if text == "" {
		return ""
	}
	builder := strings.Builder{}
	for _, ch := range text {
		if ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' {
			builder.WriteRune(ch)
			continue
		}
		switch ch {
		case '_', '.', '/', ':', '=', '@', '%', '+', '-', ' ':
			builder.WriteRune(ch)
		}
		if builder.Len() >= 160 {
			break
		}
	}
	return strings.Join(strings.Fields(builder.String()), " ")
}

func unavailableTmuxAvailability(kind string) tmuxAvailabilityResult {
	reason := "Go tmux availability unavailable (" + kind + ")"
	return tmuxAvailabilityResult{
		OK:                false,
		Capability:        "tmuxAvailability",
		Available:         false,
		Status:            "unknown",
		Marker:            "stale",
		Failure:           kind,
		Reason:            reason,
		Error:             reason,
		ReadOnly:          true,
		StateFilesRead:    false,
		StateFilesWritten: false,
		TmuxMutation:      false,
	}
}

func checkTmuxAvailability() tmuxAvailabilityResult {
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tmux", "-V")
	cmd.Env = os.Environ()
	output, err := cmd.Output()
	if ctx.Err() == context.DeadlineExceeded {
		return unavailableTmuxAvailability("tmux-command-timeout")
	}
	if err != nil {
		if _, ok := err.(*exec.Error); ok {
			return unavailableTmuxAvailability("tmux-unavailable")
		}
		return unavailableTmuxAvailability("tmux-command-failed")
	}
	version := compactKernelText(string(output))
	if version == "" {
		return unavailableTmuxAvailability("tmux-command-failed")
	}
	return tmuxAvailabilityResult{
		OK:                true,
		Capability:        "tmuxAvailability",
		Available:         true,
		Version:           version,
		ReadOnly:          true,
		StateFilesRead:    false,
		StateFilesWritten: false,
		TmuxMutation:      false,
	}
}

func unavailableWorkerPaneInspection(requestedPaneID string, kind string) workerPaneInspectionResult {
	reason := "Go worker lifecycle inspectPane unavailable (" + kind + ")"
	return workerPaneInspectionResult{
		OK:                false,
		Operation:         "inspectPane",
		Capability:        "workerLifecycle",
		PaneID:            requestedPaneID,
		RequestedPaneID:   requestedPaneID,
		Exists:            false,
		Status:            "unknown",
		Marker:            "stale",
		Failure:           kind,
		Reason:            reason,
		Error:             reason,
		ReadOnly:          true,
		StateFilesRead:    false,
		StateFilesWritten: false,
		TmuxMutation:      false,
	}
}

func inspectWorkerPane(params map[string]any) workerPaneInspectionResult {
	requestedPaneID := strings.TrimSpace(stringParam(params, "paneId"))
	if requestedPaneID == "" {
		return unavailableWorkerPaneInspection(requestedPaneID, "invalid-pane-id")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat)
	cmd.Env = os.Environ()
	output, err := cmd.Output()
	if ctx.Err() == context.DeadlineExceeded {
		return unavailableWorkerPaneInspection(requestedPaneID, "tmux-command-timeout")
	}
	if err != nil {
		if _, ok := err.(*exec.Error); ok {
			return unavailableWorkerPaneInspection(requestedPaneID, "tmux-unavailable")
		}
		return unavailableWorkerPaneInspection(requestedPaneID, "tmux-command-failed")
	}
	for _, line := range splitLines(strings.TrimSpace(string(output))) {
		fields := splitTabs(line)
		if len(fields) < 5 || fields[0] != requestedPaneID {
			continue
		}
		inMode := tmuxBool(fields[3])
		mode := strings.TrimSpace(fields[4])
		copyModeValue := strings.Contains(strings.ToLower(mode), "copy")
		return workerPaneInspectionResult{
			OK:                true,
			Operation:         "inspectPane",
			Capability:        "workerLifecycle",
			PaneID:            fields[0],
			RequestedPaneID:   requestedPaneID,
			Exists:            true,
			Target:            strings.TrimSpace(fields[1]),
			CurrentCommand:    strings.TrimSpace(fields[2]),
			InMode:            inMode,
			Mode:              mode,
			CopyMode:          &copyModeValue,
			ReadOnly:          true,
			StateFilesRead:    false,
			StateFilesWritten: false,
			TmuxMutation:      false,
		}
	}
	return unavailableWorkerPaneInspection(requestedPaneID, "pane-not-found")
}

func unavailableWorkerPaneList(kind string) workerPaneListResult {
	reason := "Go worker lifecycle listAgentTeamPanes unavailable (" + kind + ")"
	return workerPaneListResult{
		OK:                false,
		Operation:         "listAgentTeamPanes",
		Capability:        "workerLifecycle",
		Panes:             []tmuxPaneSnapshotItem{},
		ByPaneID:          map[string]tmuxPaneSnapshotItem{},
		Status:            "unknown",
		Marker:            "stale",
		Failure:           kind,
		Reason:            reason,
		Error:             reason,
		ReadOnly:          true,
		StateFilesRead:    false,
		StateFilesWritten: false,
		TmuxMutation:      false,
	}
}

func listAgentTeamPanes() workerPaneListResult {
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat)
	cmd.Env = os.Environ()
	output, err := cmd.Output()
	if ctx.Err() == context.DeadlineExceeded {
		return unavailableWorkerPaneList("tmux-command-timeout")
	}
	if err != nil {
		if _, ok := err.(*exec.Error); ok {
			return unavailableWorkerPaneList("tmux-unavailable")
		}
		return unavailableWorkerPaneList("tmux-command-failed")
	}
	parsed := parseTmuxSnapshot(map[string]any{"stdout": strings.TrimSpace(string(output)), "capturedAt": int64(0)})
	panes := []tmuxPaneSnapshotItem{}
	byPaneID := map[string]tmuxPaneSnapshotItem{}
	for _, pane := range parsed.Panes {
		if strings.TrimSpace(pane.PaneID) == "" || strings.TrimSpace(pane.Label) == "" {
			continue
		}
		panes = append(panes, pane)
		byPaneID[pane.PaneID] = pane
	}
	return workerPaneListResult{
		OK:                true,
		Operation:         "listAgentTeamPanes",
		Capability:        "workerLifecycle",
		Panes:             panes,
		ByPaneID:          byPaneID,
		ReadOnly:          true,
		StateFilesRead:    false,
		StateFilesWritten: false,
		TmuxMutation:      false,
	}
}

func unavailableCurrentPaneBinding(kind string) workerPaneBindingResult {
	reason := "Go worker lifecycle captureCurrentPaneBinding unavailable (" + kind + ")"
	return workerPaneBindingResult{
		OK:                false,
		Operation:         "captureCurrentPaneBinding",
		Capability:        "workerLifecycle",
		Status:            "unknown",
		Marker:            "stale",
		Failure:           kind,
		Reason:            reason,
		Error:             reason,
		ReadOnly:          true,
		StateFilesRead:    false,
		StateFilesWritten: false,
		TmuxMutation:      false,
	}
}

func captureCurrentPaneBinding() workerPaneBindingResult {
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat)
	cmd.Env = os.Environ()
	output, err := cmd.Output()
	if ctx.Err() == context.DeadlineExceeded {
		return unavailableCurrentPaneBinding("tmux-command-timeout")
	}
	if err != nil {
		if _, ok := err.(*exec.Error); ok {
			return unavailableCurrentPaneBinding("tmux-unavailable")
		}
		return unavailableCurrentPaneBinding("tmux-command-failed")
	}
	line := ""
	for _, candidate := range splitLines(strings.TrimSpace(string(output))) {
		if strings.TrimSpace(candidate) != "" {
			line = candidate
			break
		}
	}
	fields := splitTabs(line)
	if len(fields) < 2 {
		return unavailableCurrentPaneBinding("pane-not-found")
	}
	paneID := strings.TrimSpace(fields[0])
	target := strings.TrimSpace(fields[1])
	if paneID == "" || target == "" {
		return unavailableCurrentPaneBinding("pane-not-found")
	}
	return workerPaneBindingResult{
		OK:                true,
		Operation:         "captureCurrentPaneBinding",
		Capability:        "workerLifecycle",
		PaneID:            paneID,
		Target:            target,
		ReadOnly:          true,
		StateFilesRead:    false,
		StateFilesWritten: false,
		TmuxMutation:      false,
	}
}

func unavailableWindowPaneList(target string, kind string) workerWindowPaneListResult {
	safeTarget := compactTmuxWindowTarget(target)
	reason := "Go worker lifecycle listPanesInWindow unavailable (" + kind + ")"
	return workerWindowPaneListResult{
		OK:                false,
		Operation:         "listPanesInWindow",
		Capability:        "workerLifecycle",
		Target:            safeTarget,
		Exists:            false,
		PaneIDs:           []string{},
		Status:            "unknown",
		Marker:            "stale",
		Failure:           kind,
		Reason:            reason,
		Error:             reason,
		ReadOnly:          true,
		StateFilesRead:    false,
		StateFilesWritten: false,
		TmuxMutation:      false,
	}
}

func listPanesInWindow(params map[string]any) workerWindowPaneListResult {
	target := compactTmuxWindowTarget(stringParam(params, "target"))
	if target == "" {
		return unavailableWindowPaneList("", "invalid-target")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tmux", "list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat)
	cmd.Env = os.Environ()
	output, err := cmd.Output()
	if ctx.Err() == context.DeadlineExceeded {
		return unavailableWindowPaneList(target, "tmux-command-timeout")
	}
	if err != nil {
		if _, ok := err.(*exec.Error); ok {
			return unavailableWindowPaneList(target, "tmux-unavailable")
		}
		return unavailableWindowPaneList(target, "tmux-command-failed")
	}
	paneIDs := []string{}
	for _, line := range splitLines(strings.TrimSpace(string(output))) {
		paneID := strings.TrimSpace(line)
		if paneID == "" {
			continue
		}
		paneIDs = append(paneIDs, paneID)
	}
	return workerWindowPaneListResult{
		OK:                true,
		Operation:         "listPanesInWindow",
		Capability:        "workerLifecycle",
		Target:            target,
		Exists:            true,
		PaneIDs:           paneIDs,
		ReadOnly:          true,
		StateFilesRead:    false,
		StateFilesWritten: false,
		TmuxMutation:      false,
	}
}

func unavailableAgentTeamWindowTarget(sessionName string, kind string) workerAgentTeamWindowTargetResult {
	safeSessionName := compactTmuxSessionName(sessionName)
	reason := "Go worker lifecycle findAgentTeamWindowTarget unavailable (" + kind + ")"
	return workerAgentTeamWindowTargetResult{
		OK:                false,
		Operation:         "findAgentTeamWindowTarget",
		Capability:        "workerLifecycle",
		SessionName:       safeSessionName,
		Exists:            false,
		Status:            "unknown",
		Marker:            "stale",
		Failure:           kind,
		Reason:            reason,
		Error:             reason,
		ReadOnly:          true,
		StateFilesRead:    false,
		StateFilesWritten: false,
		TmuxMutation:      false,
	}
}

func findAgentTeamWindowTarget(params map[string]any) workerAgentTeamWindowTargetResult {
	sessionName := compactTmuxSessionName(stringParam(params, "sessionName"))
	if sessionName == "" {
		return unavailableAgentTeamWindowTarget("", "invalid-session")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tmux", "list-windows", "-t", sessionName, "-F", workerLifecycleAgentTeamWindowFormat)
	cmd.Env = os.Environ()
	output, err := cmd.Output()
	if ctx.Err() == context.DeadlineExceeded {
		return unavailableAgentTeamWindowTarget(sessionName, "tmux-command-timeout")
	}
	if err != nil {
		if _, ok := err.(*exec.Error); ok {
			return unavailableAgentTeamWindowTarget(sessionName, "tmux-unavailable")
		}
		return unavailableAgentTeamWindowTarget(sessionName, "tmux-command-failed")
	}
	for _, line := range splitLines(strings.TrimSpace(string(output))) {
		fields := splitTabs(line)
		if len(fields) < 2 {
			continue
		}
		windowID := strings.TrimSpace(fields[0])
		marker := strings.TrimSpace(fields[1])
		if marker == "1" && windowID != "" {
			return workerAgentTeamWindowTargetResult{
				OK:                true,
				Operation:         "findAgentTeamWindowTarget",
				Capability:        "workerLifecycle",
				SessionName:       sessionName,
				Exists:            true,
				Target:            sessionName + ":" + windowID,
				WindowID:          windowID,
				ReadOnly:          true,
				StateFilesRead:    false,
				StateFilesWritten: false,
				TmuxMutation:      false,
			}
		}
	}
	return unavailableAgentTeamWindowTarget(sessionName, "pane-not-found")
}

func unavailableWindowNameTarget(sessionName string, windowName string, kind string) workerWindowNameTargetResult {
	safeSessionName := compactTmuxSessionName(sessionName)
	safeWindowName := compactTmuxWindowName(windowName)
	reason := "Go worker lifecycle findWindowTargetByName unavailable (" + kind + ")"
	return workerWindowNameTargetResult{
		OK:                false,
		Operation:         "findWindowTargetByName",
		Capability:        "workerLifecycle",
		SessionName:       safeSessionName,
		WindowName:        safeWindowName,
		Exists:            false,
		Status:            "unknown",
		Marker:            "stale",
		Failure:           kind,
		Reason:            reason,
		Error:             reason,
		ReadOnly:          true,
		StateFilesRead:    false,
		StateFilesWritten: false,
		TmuxMutation:      false,
	}
}

func findWindowTargetByName(params map[string]any) workerWindowNameTargetResult {
	sessionName := compactTmuxSessionName(stringParam(params, "sessionName"))
	windowName := compactTmuxWindowName(stringParam(params, "windowName"))
	if sessionName == "" {
		return unavailableWindowNameTarget("", windowName, "invalid-session")
	}
	if windowName == "" {
		return unavailableWindowNameTarget(sessionName, "", "invalid-window-name")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tmux", "list-windows", "-t", sessionName, "-F", workerLifecycleWindowNameFormat)
	cmd.Env = os.Environ()
	output, err := cmd.Output()
	if ctx.Err() == context.DeadlineExceeded {
		return unavailableWindowNameTarget(sessionName, windowName, "tmux-command-timeout")
	}
	if err != nil {
		if _, ok := err.(*exec.Error); ok {
			return unavailableWindowNameTarget(sessionName, windowName, "tmux-unavailable")
		}
		return unavailableWindowNameTarget(sessionName, windowName, "tmux-command-failed")
	}
	for _, line := range splitLines(strings.TrimSpace(string(output))) {
		fields := splitTabs(line)
		if len(fields) < 2 {
			continue
		}
		windowID := compactKernelText(fields[0])
		candidateName := compactTmuxWindowName(fields[1])
		if windowID == "" || candidateName != windowName {
			continue
		}
		return workerWindowNameTargetResult{
			OK:                true,
			Operation:         "findWindowTargetByName",
			Capability:        "workerLifecycle",
			SessionName:       sessionName,
			WindowName:        windowName,
			Exists:            true,
			Target:            sessionName + ":" + windowID,
			WindowID:          windowID,
			ReadOnly:          true,
			StateFilesRead:    false,
			StateFilesWritten: false,
			TmuxMutation:      false,
		}
	}
	return unavailableWindowNameTarget(sessionName, windowName, "pane-not-found")
}

func unavailableSessionExistence(sessionName string, kind string) workerSessionExistenceResult {
	safeSessionName := compactTmuxSessionName(sessionName)
	reason := "Go worker lifecycle sessionExists unavailable (" + kind + ")"
	return workerSessionExistenceResult{
		OK:                false,
		Operation:         "sessionExists",
		Capability:        "workerLifecycle",
		SessionName:       safeSessionName,
		Exists:            false,
		Status:            "unknown",
		Marker:            "stale",
		Failure:           kind,
		Reason:            reason,
		Error:             reason,
		ReadOnly:          true,
		StateFilesRead:    false,
		StateFilesWritten: false,
		TmuxMutation:      false,
	}
}

func sessionExists(params map[string]any) workerSessionExistenceResult {
	sessionName := compactTmuxSessionName(stringParam(params, "sessionName"))
	if sessionName == "" {
		return unavailableSessionExistence("", "invalid-session")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tmux", "has-session", "-t", sessionName)
	cmd.Env = os.Environ()
	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return unavailableSessionExistence(sessionName, "tmux-command-timeout")
	}
	if err != nil {
		if _, ok := err.(*exec.Error); ok {
			return unavailableSessionExistence(sessionName, "tmux-unavailable")
		}
		return unavailableSessionExistence(sessionName, "pane-not-found")
	}
	return workerSessionExistenceResult{
		OK:                true,
		Operation:         "sessionExists",
		Capability:        "workerLifecycle",
		SessionName:       sessionName,
		Exists:            true,
		ReadOnly:          true,
		StateFilesRead:    false,
		StateFilesWritten: false,
		TmuxMutation:      false,
	}
}

func workerLifecycle(params map[string]any) any {
	operation := stringParam(params, "operation")
	switch operation {
	case "inspectPane":
		return inspectWorkerPane(params)
	case "listAgentTeamPanes":
		return listAgentTeamPanes()
	case "captureCurrentPaneBinding":
		return captureCurrentPaneBinding()
	case "listPanesInWindow":
		return listPanesInWindow(params)
	case "findAgentTeamWindowTarget":
		return findAgentTeamWindowTarget(params)
	case "findWindowTargetByName":
		return findWindowTargetByName(params)
	case "sessionExists":
		return sessionExists(params)
	default:
		return unavailableWorkerPaneInspection(strings.TrimSpace(stringParam(params, "paneId")), "unsupported-operation")
	}
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
	case "tmuxSnapshotCapture":
		return rpcResponse{JSONRPC: "2.0", ID: request.ID, Result: captureTmuxSnapshot(request.Params)}
	case "compactReadModelFingerprint":
		return rpcResponse{JSONRPC: "2.0", ID: request.ID, Result: compactReadModelFingerprint(request.Params)}
	case "workerLifecycle":
		return rpcResponse{JSONRPC: "2.0", ID: request.ID, Result: workerLifecycle(request.Params)}
	case "tmuxAvailability":
		return rpcResponse{JSONRPC: "2.0", ID: request.ID, Result: checkTmuxAvailability()}
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
