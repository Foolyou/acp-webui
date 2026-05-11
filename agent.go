package main

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const maxDisplayImageBytes = 5 * 1024 * 1024

type EventHub struct {
	mu   sync.Mutex
	subs map[chan any]struct{}
}

func newEventHub() *EventHub {
	return &EventHub{subs: map[chan any]struct{}{}}
}

func (h *EventHub) Subscribe() chan any {
	ch := make(chan any, 64)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *EventHub) Unsubscribe(ch chan any) {
	h.mu.Lock()
	delete(h.subs, ch)
	close(ch)
	h.mu.Unlock()
}

func (h *EventHub) Publish(event any) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- event:
		default:
		}
	}
}

type AgentRuntimeManager struct {
	configs  map[string]AgentConfig
	storage  *Storage
	events   *EventHub
	mu       sync.Mutex
	runtimes map[string]*AgentRuntime
}

func newAgentRuntimeManager(config Config, storage *Storage, events *EventHub) *AgentRuntimeManager {
	configs := map[string]AgentConfig{}
	for _, agent := range config.agentConfigs() {
		configs[agent.ID] = agent
	}
	return &AgentRuntimeManager{
		configs:  configs,
		storage:  storage,
		events:   events,
		runtimes: map[string]*AgentRuntime{},
	}
}

func (m *AgentRuntimeManager) resolveAgentID(requested string) (string, error) {
	if strings.TrimSpace(requested) == "" {
		requested = defaultAgentID
	}
	if _, ok := m.configs[requested]; !ok {
		return "", fmt.Errorf("unknown agent %q", requested)
	}
	return requested, nil
}

func (m *AgentRuntimeManager) resolvePermissionMode(agentID, requested string) (string, error) {
	agent := m.configs[agentID]
	mode := strings.TrimSpace(requested)
	if mode == "" {
		mode = permissionManual
	}
	if !agent.supportsPermissionMode(mode) {
		return "", fmt.Errorf("%s does not support permission mode %q", agent.Title, mode)
	}
	return mode, nil
}

func (m *AgentRuntimeManager) resolveLaunchProfile(agentID, permissionMode string, values map[string]string) (ResolvedAgentLaunchProfile, error) {
	return m.configs[agentID].resolveLaunchProfile(permissionMode, values)
}

func (m *AgentRuntimeManager) runtimeForLaunchProfile(agentID string, profile ResolvedAgentLaunchProfile, start bool) (*AgentRuntime, error) {
	agent, ok := m.configs[agentID]
	if !ok {
		return nil, fmt.Errorf("unknown agent %q", agentID)
	}
	var fullProfile *AgentLaunchProfile
	for i := range agent.LaunchProfiles {
		if agent.LaunchProfiles[i].Key == profile.Key {
			fullProfile = &agent.LaunchProfiles[i]
			break
		}
	}
	if fullProfile == nil {
		return nil, fmt.Errorf("%s launch profile %q is not available", agent.Title, profile.Key)
	}
	key := agentID + "\x00" + fullProfile.Key
	m.mu.Lock()
	runtime := m.runtimes[key]
	if runtime == nil {
		runtimeAgent := agent
		runtimeAgent.Args = append([]string{}, fullProfile.Args...)
		runtime = newAgentRuntime(runtimeAgent, fullProfile.PermissionMode, m.storage, m.events)
		m.runtimes[key] = runtime
	}
	m.mu.Unlock()
	if start {
		if err := runtime.ensureReady(context.Background()); err != nil {
			return runtime, err
		}
	}
	return runtime, nil
}

func (m *AgentRuntimeManager) runtimeForSession(session Session, start bool) (*AgentRuntime, error) {
	profile := ResolvedAgentLaunchProfile{Key: session.LaunchProfileKey, PermissionMode: session.PermissionMode, ID: session.LaunchProfileID}
	return m.runtimeForLaunchProfile(session.AgentID, profile, start)
}

func (m *AgentRuntimeManager) statuses() []AgentRuntimeStatus {
	items := make([]AgentRuntimeStatus, 0, len(m.configs))
	for _, agentID := range []string{codexAgentID, claudeAgentID, opencodeAgentID} {
		agent, ok := m.configs[agentID]
		if !ok {
			continue
		}
		status := disabledStatus(agent.Title + " is disabled")
		if agent.Enabled {
			status = idleStatus(agent.Title)
		}
		m.mu.Lock()
		for _, runtime := range m.runtimes {
			if runtime.agent.ID == agent.ID {
				status = runtime.status()
				break
			}
		}
		m.mu.Unlock()
		var modes []AgentPermissionModeStatus
		for _, mode := range agent.PermissionModes {
			modeStatus := status
			if !agent.Enabled {
				modeStatus = disabledStatus(agent.Title + " is disabled")
			}
			modes = append(modes, AgentPermissionModeStatus{ID: mode.ID, Label: mode.Label, Description: mode.Description, RiskLevel: mode.RiskLevel, Status: modeStatus})
		}
		items = append(items, AgentRuntimeStatus{
			ID:              agent.ID,
			ProviderID:      agent.ProviderID,
			Title:           agent.Title,
			Enabled:         agent.Enabled,
			Status:          status,
			PermissionModes: modes,
			LaunchControls:  agent.LaunchControls,
		})
	}
	return items
}

func (m *AgentRuntimeManager) codexStatus() ConnectionStatus {
	for _, status := range m.statuses() {
		if status.ID == codexAgentID {
			return status.Status
		}
	}
	return idleStatus("Codex")
}

type AgentRuntime struct {
	agent          AgentConfig
	permissionMode string
	storage        *Storage
	events         *EventHub
	mu             sync.Mutex
	statusValue    ConnectionStatus
	cmd            *exec.Cmd
	stdin          io.WriteCloser
	pending        map[string]chan rpcResponse
	nextID         atomic.Int64
	sessionMap     map[string]string
	permissionMap  map[string]string
	assistant      map[string]string
	promptCaps     AgentPromptCapabilities
	sessionCaps    AgentSessionCapabilities
}

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *rpcError       `json:"error"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func newAgentRuntime(agent AgentConfig, permissionMode string, storage *Storage, events *EventHub) *AgentRuntime {
	return &AgentRuntime{
		agent:          agent,
		permissionMode: permissionMode,
		storage:        storage,
		events:         events,
		statusValue:    idleStatus(agent.Title),
		pending:        map[string]chan rpcResponse{},
		sessionMap:     map[string]string{},
		permissionMap:  map[string]string{},
		assistant:      map[string]string{},
		promptCaps:     AgentPromptCapabilities{},
		sessionCaps:    AgentSessionCapabilities{},
	}
}

func idleStatus(agentTitle string) ConnectionStatus {
	return ConnectionStatus{State: "idle", Message: stringPtr(agentTitle + " runtime has not started"), PromptCapabilities: AgentPromptCapabilities{}, SessionCapabilities: AgentSessionCapabilities{}}
}

func startingStatus(agentTitle string) ConnectionStatus {
	return ConnectionStatus{State: "starting", Message: stringPtr("Starting " + agentTitle), PromptCapabilities: AgentPromptCapabilities{}, SessionCapabilities: AgentSessionCapabilities{}}
}

func failedStatus(message string) ConnectionStatus {
	return ConnectionStatus{State: "failed", Message: stringPtr(message), PromptCapabilities: AgentPromptCapabilities{}, SessionCapabilities: AgentSessionCapabilities{}}
}

func disabledStatus(message string) ConnectionStatus {
	return ConnectionStatus{State: "disabled", Message: stringPtr(message), PromptCapabilities: AgentPromptCapabilities{}, SessionCapabilities: AgentSessionCapabilities{}}
}

func readyStatus(agentInfo any, prompt AgentPromptCapabilities, session AgentSessionCapabilities) ConnectionStatus {
	return ConnectionStatus{State: "ready", AgentInfo: agentInfo, PromptCapabilities: prompt, SessionCapabilities: session}
}

func (r *AgentRuntime) status() ConnectionStatus {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.statusValue
}

func (r *AgentRuntime) setStatus(status ConnectionStatus) {
	r.mu.Lock()
	r.statusValue = status
	r.mu.Unlock()
	r.events.Publish(map[string]any{"type": "agent_connection_status", "agentId": r.agent.ID, "permissionMode": r.permissionMode, "status": status})
	if r.agent.ID == codexAgentID {
		r.events.Publish(map[string]any{"type": "connection_status", "status": status})
	}
}

func (r *AgentRuntime) ensureReady(ctx context.Context) error {
	r.mu.Lock()
	if !r.agent.Enabled {
		r.mu.Unlock()
		return fmt.Errorf("%s is disabled", r.agent.Title)
	}
	if r.statusValue.State == "ready" && r.stdin != nil {
		r.mu.Unlock()
		return nil
	}
	if r.statusValue.State == "starting" {
		r.mu.Unlock()
		for i := 0; i < 80; i++ {
			time.Sleep(100 * time.Millisecond)
			if r.status().State == "ready" {
				return nil
			}
		}
		return errors.New("agent runtime is still starting")
	}
	r.statusValue = startingStatus(r.agent.Title)
	r.mu.Unlock()
	r.events.Publish(map[string]any{"type": "agent_connection_status", "agentId": r.agent.ID, "permissionMode": r.permissionMode, "status": startingStatus(r.agent.Title)})

	cmd := exec.CommandContext(ctx, r.agent.Command, r.agent.Args...)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		r.setStatus(failedStatus(err.Error()))
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		r.setStatus(failedStatus(err.Error()))
		return err
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		r.setStatus(failedStatus(fmt.Sprintf("Failed to start %s (%s): %v", r.agent.Title, formatCommand(r.agent.Command, r.agent.Args), err)))
		return err
	}
	r.mu.Lock()
	r.cmd = cmd
	r.stdin = stdin
	r.mu.Unlock()
	go r.readLoop(stdout)
	go func() {
		err := cmd.Wait()
		if err != nil && r.status().State != "failed" {
			r.setStatus(failedStatus(err.Error()))
		}
	}()

	var initResult struct {
		AgentInfo         any `json:"agentInfo"`
		AgentCapabilities struct {
			LoadSession         bool `json:"loadSession"`
			SessionCapabilities struct {
				List   any `json:"list"`
				Resume any `json:"resume"`
				Close  any `json:"close"`
			} `json:"sessionCapabilities"`
			PromptCapabilities struct {
				Image           bool `json:"image"`
				Audio           bool `json:"audio"`
				EmbeddedContext bool `json:"embeddedContext"`
			} `json:"promptCapabilities"`
		} `json:"agentCapabilities"`
	}
	if err := r.request(ctx, "initialize", initializeParams(), &initResult); err != nil {
		r.setStatus(failedStatus(err.Error()))
		return err
	}
	promptCaps := AgentPromptCapabilities{
		Image:           initResult.AgentCapabilities.PromptCapabilities.Image,
		Audio:           initResult.AgentCapabilities.PromptCapabilities.Audio,
		EmbeddedContext: initResult.AgentCapabilities.PromptCapabilities.EmbeddedContext,
	}
	sessionCaps := AgentSessionCapabilities{
		LoadSession:   initResult.AgentCapabilities.LoadSession,
		ResumeSession: initResult.AgentCapabilities.SessionCapabilities.Resume != nil && initResult.AgentCapabilities.SessionCapabilities.Resume != false,
		ListSessions:  initResult.AgentCapabilities.SessionCapabilities.List != nil,
		CloseSession:  initResult.AgentCapabilities.SessionCapabilities.Close != nil,
	}
	if initResult.AgentCapabilities.LoadSession {
		sessionCaps.LoadSession = true
	}
	r.mu.Lock()
	r.promptCaps = promptCaps
	r.sessionCaps = sessionCaps
	r.mu.Unlock()
	r.setStatus(readyStatus(initResult.AgentInfo, promptCaps, sessionCaps))
	return nil
}

func (r *AgentRuntime) request(ctx context.Context, method string, params any, target any) error {
	id := r.nextID.Add(1)
	key := fmt.Sprintf("%d", id)
	ch := make(chan rpcResponse, 1)
	r.mu.Lock()
	r.pending[key] = ch
	stdin := r.stdin
	r.mu.Unlock()
	if stdin == nil {
		return errors.New("agent runtime is not connected")
	}
	message := map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params}
	data, _ := json.Marshal(message)
	if _, err := stdin.Write(append(data, '\n')); err != nil {
		return err
	}
	select {
	case response := <-ch:
		if response.Error != nil {
			return errors.New(response.Error.Message)
		}
		if target != nil {
			if err := json.Unmarshal(response.Result, target); err != nil {
				return err
			}
		}
		return nil
	case <-time.After(5 * time.Minute):
		return fmt.Errorf("%s timed out", method)
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (r *AgentRuntime) readLoop(stdout io.Reader) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 2*1024*1024)
	for scanner.Scan() {
		var message map[string]json.RawMessage
		if err := json.Unmarshal(scanner.Bytes(), &message); err != nil {
			continue
		}
		if rawID, ok := message["id"]; ok {
			if _, hasMethod := message["method"]; !hasMethod {
				key := idKey(rawID)
				var response rpcResponse
				_ = json.Unmarshal(scanner.Bytes(), &response)
				r.mu.Lock()
				ch := r.pending[key]
				delete(r.pending, key)
				r.mu.Unlock()
				if ch != nil {
					ch <- response
				}
				continue
			}
		}
		var envelope struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &envelope); err != nil {
			continue
		}
		r.handleIncoming(envelope.ID, envelope.Method, envelope.Params)
	}
	if err := scanner.Err(); err != nil {
		r.setStatus(failedStatus(err.Error()))
	}
}

func idKey(raw json.RawMessage) string {
	var asInt int64
	if err := json.Unmarshal(raw, &asInt); err == nil {
		return fmt.Sprintf("%d", asInt)
	}
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		return asString
	}
	return string(raw)
}

func (r *AgentRuntime) sendResponse(id string, result any) error {
	r.mu.Lock()
	stdin := r.stdin
	r.mu.Unlock()
	if stdin == nil {
		return errors.New("agent runtime is not connected")
	}
	message := map[string]any{"jsonrpc": "2.0", "id": id, "result": result}
	data, _ := json.Marshal(message)
	_, err := stdin.Write(append(data, '\n'))
	return err
}

func (r *AgentRuntime) sendRawResult(id json.RawMessage, result any) error {
	return r.sendRawMessage(id, "result", result)
}

func (r *AgentRuntime) sendRawError(id json.RawMessage, code int, message string) error {
	return r.sendRawMessage(id, "error", map[string]any{"code": code, "message": message})
}

func (r *AgentRuntime) sendRawMessage(id json.RawMessage, field string, value any) error {
	r.mu.Lock()
	stdin := r.stdin
	r.mu.Unlock()
	if stdin == nil {
		return errors.New("agent runtime is not connected")
	}
	message := map[string]any{"jsonrpc": "2.0", field: value}
	if len(id) > 0 {
		var decoded any
		if err := json.Unmarshal(id, &decoded); err == nil {
			message["id"] = decoded
		} else {
			message["id"] = string(id)
		}
	}
	data, _ := json.Marshal(message)
	_, err := stdin.Write(append(data, '\n'))
	return err
}

type NewSessionOutcome struct {
	SessionID     string
	ConfigOptions []SessionConfigOption
}

func (r *AgentRuntime) NewSession(ctx context.Context, cwd string) (NewSessionOutcome, error) {
	if err := r.ensureReady(ctx); err != nil {
		return NewSessionOutcome{}, err
	}
	var result struct {
		SessionID     string                `json:"sessionId"`
		ConfigOptions []SessionConfigOption `json:"configOptions"`
	}
	if err := r.request(ctx, "session/new", map[string]any{"cwd": cwd, "mcpServers": displayImageMCPServers()}, &result); err != nil {
		return NewSessionOutcome{}, err
	}
	return NewSessionOutcome{SessionID: result.SessionID, ConfigOptions: result.ConfigOptions}, nil
}

func (r *AgentRuntime) RegisterSession(acpSessionID, localSessionID string) {
	r.mu.Lock()
	r.sessionMap[acpSessionID] = localSessionID
	r.mu.Unlock()
}

func (r *AgentRuntime) hasRegisteredSession(acpSessionID *string) bool {
	if acpSessionID == nil {
		return false
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	_, ok := r.sessionMap[*acpSessionID]
	return ok
}

func (r *AgentRuntime) runtimeSessionContinuity(acpSessionID, externalSessionID *string) SessionContinuity {
	if r.status().State != "ready" {
		return viewOnlyContinuity("Agent runtime is not ready.")
	}
	if r.hasRegisteredSession(acpSessionID) {
		return liveContinuity()
	}
	r.mu.Lock()
	canLoad := r.sessionCaps.LoadSession
	r.mu.Unlock()
	if externalSessionID != nil && canLoad {
		return SessionContinuity{State: continuityLoadable, Restorable: true, Reason: stringPtr("Restore this agent session to continue.")}
	}
	return viewOnlyContinuity("This session history is available for review, but the live runtime context is not available.")
}

func (r *AgentRuntime) LoadSession(ctx context.Context, externalSessionID, localSessionID, cwd string) ([]SessionConfigOption, error) {
	if err := r.ensureReady(ctx); err != nil {
		return nil, err
	}
	r.mu.Lock()
	r.sessionMap[externalSessionID] = localSessionID
	r.mu.Unlock()
	var result struct {
		SessionID     string                `json:"sessionId"`
		ConfigOptions []SessionConfigOption `json:"configOptions"`
	}
	err := r.request(ctx, "session/load", map[string]any{"sessionId": externalSessionID, "cwd": cwd, "mcpServers": displayImageMCPServers()}, &result)
	if err != nil {
		return nil, err
	}
	return result.ConfigOptions, nil
}

func (r *AgentRuntime) SetConfigOption(ctx context.Context, acpSessionID, configID, value string) (SessionConfigState, error) {
	if err := r.ensureReady(ctx); err != nil {
		return SessionConfigState{}, err
	}
	var result SessionConfigState
	err := r.request(ctx, "session/set_config_option", map[string]any{"sessionId": acpSessionID, "configId": configID, "value": value}, &result)
	return result, err
}

func (r *AgentRuntime) StopSessionTurn(ctx context.Context, acpSessionID string) error {
	if err := r.ensureReady(ctx); err != nil {
		return err
	}
	var result map[string]any
	return r.request(ctx, "session/cancel", map[string]any{"sessionId": acpSessionID}, &result)
}

func (r *AgentRuntime) ResolvePermission(ctx context.Context, permissionID string, optionID string) (PermissionRequest, error) {
	permission, err := r.storage.ResolvePermissionRequest(ctx, permissionID, optionID)
	if err != nil {
		return PermissionRequest{}, err
	}
	r.mu.Lock()
	requestID := r.permissionMap[permissionID]
	delete(r.permissionMap, permissionID)
	r.mu.Unlock()
	if requestID != "" {
		if err := r.sendResponse(requestID, map[string]any{"outcome": map[string]any{"optionId": optionID}}); err != nil {
			return permission, err
		}
	}
	pending, _ := r.storage.PendingPermissionsForSession(ctx, permission.SessionID)
	var next *PermissionRequest
	if len(pending) > 0 {
		next = &pending[0]
	} else {
		_ = r.storage.UpdateSessionStatus(ctx, permission.SessionID, statusRunning)
	}
	r.events.Publish(map[string]any{
		"type":                 "permission_resolved",
		"sessionId":            permission.SessionID,
		"permissionId":         permission.ID,
		"nextPermission":       next,
		"pendingApprovalCount": len(pending),
		"queuedApprovalCount":  maxInt64(int64(len(pending)-1), 0),
	})
	return permission, nil
}

func (r *AgentRuntime) CancelPendingPermissionsForSession(ctx context.Context, sessionID string) error {
	pending, _ := r.storage.PendingPermissionsForSession(ctx, sessionID)
	for _, permission := range pending {
		r.mu.Lock()
		requestID := r.permissionMap[permission.ID]
		delete(r.permissionMap, permission.ID)
		r.mu.Unlock()
		if requestID != "" {
			_ = r.sendResponse(requestID, map[string]any{"outcome": map[string]any{"optionId": "cancelled"}})
		}
	}
	return r.storage.CancelPendingPermissionsForSession(ctx, sessionID)
}

func (r *AgentRuntime) Prompt(ctx context.Context, localSessionID, acpSessionID string, blocks []MessageContentBlock) error {
	if err := r.ensureReady(ctx); err != nil {
		return err
	}
	r.mu.Lock()
	r.assistant[localSessionID] = ""
	r.mu.Unlock()
	prompt := make([]map[string]any, 0, len(blocks))
	for _, block := range blocks {
		switch block.Type {
		case "image":
			prompt = append(prompt, map[string]any{"type": "image", "mimeType": block.MimeType, "data": block.Data})
		default:
			prompt = append(prompt, map[string]any{"type": "text", "text": block.Text})
		}
	}
	var result map[string]any
	err := r.request(ctx, "session/prompt", map[string]any{"sessionId": acpSessionID, "prompt": prompt}, &result)
	content := r.takeAssistantBuffer(localSessionID)
	if content != "" {
		message, createErr := r.storage.CreateMessage(ctx, localSessionID, roleAssistant, content, []MessageContentBlock{textBlock(content)}, statusIdle)
		if createErr == nil {
			r.events.Publish(map[string]any{"type": "assistant_message", "sessionId": localSessionID, "content": content})
			r.events.Publish(map[string]any{"type": "timeline_item_upsert", "item": messageTimelineItem(message)})
		}
	}
	return err
}

func (r *AgentRuntime) takeAssistantBuffer(localSessionID string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	content := r.assistant[localSessionID]
	delete(r.assistant, localSessionID)
	return content
}

func (r *AgentRuntime) handleIncoming(id json.RawMessage, method string, params json.RawMessage) {
	switch method {
	case "session/update":
		r.handleSessionUpdate(params)
	case "session/request_permission":
		r.handlePermissionRequest(id, params)
	case "fs/read_text_file":
		r.handleReadTextFile(id, params)
	case "display_image", "acp-webui/display_image", "_acp-webui/display_image":
		r.handleDisplayImage(id, params)
	default:
		if len(id) > 0 && string(id) != "null" {
			_ = r.sendRawError(id, -32601, fmt.Sprintf("Unsupported client method: %s", method))
		}
	}
}

func (r *AgentRuntime) handleReadTextFile(id json.RawMessage, params json.RawMessage) {
	content, err := r.readTextFile(params)
	if err.message != "" {
		_ = r.sendRawError(id, err.code, err.message)
		return
	}
	_ = r.sendRawResult(id, map[string]any{"content": content})
}

func (r *AgentRuntime) readTextFile(params json.RawMessage) (string, acpClientError) {
	var payload struct {
		SessionID string `json:"sessionId"`
		Path      string `json:"path"`
		Line      *int   `json:"line"`
		Limit     *int   `json:"limit"`
	}
	if err := json.Unmarshal(params, &payload); err != nil {
		return "", invalidParams("Invalid params")
	}
	if strings.TrimSpace(payload.SessionID) == "" {
		return "", invalidParams("sessionId is required")
	}
	if strings.TrimSpace(payload.Path) == "" {
		return "", invalidParams("path is required")
	}
	localSessionID := r.localSessionID(payload.SessionID)
	if localSessionID == "" {
		return "", resourceNotFound("ACP session is not registered")
	}
	session, err := r.storage.GetSession(context.Background(), localSessionID)
	if err != nil {
		return "", resourceNotFound("Session not found")
	}
	workspace, err := r.storage.GetWorkspace(context.Background(), session.WorkspaceID)
	if err != nil {
		return "", resourceNotFound("Workspace not found")
	}
	target, _, resolveErr := resolveWorkspacePath(workspace.Path, payload.Path)
	if resolveErr.message != "" {
		return "", resolveErr
	}
	info, err := os.Stat(target)
	if err != nil {
		return "", resourceNotFound("File not found")
	}
	if info.IsDir() {
		return "", invalidParams("File path must refer to a file")
	}
	data, err := os.ReadFile(target)
	if err != nil {
		return "", resourceNotFound("File is not readable text")
	}
	return applyLineBounds(string(data), payload.Line, payload.Limit)
}

func (r *AgentRuntime) handleDisplayImage(id json.RawMessage, params json.RawMessage) {
	artifact, err := r.displayImage(params, "display_image")
	if err.message != "" {
		_ = r.sendRawError(id, err.code, err.message)
		return
	}
	summary := reviewArtifactSummaryFromArtifact(artifact)
	r.events.Publish(map[string]any{"type": "review_artifact", "artifact": summary})
	_ = r.sendRawResult(id, map[string]any{
		"displayed":  true,
		"artifactId": artifact.ID,
		"kind":       artifact.Kind,
		"title":      artifact.Title,
		"summary":    artifact.Summary,
		"source":     artifact.Source,
	})
}

func (r *AgentRuntime) displayImage(params json.RawMessage, source string) (ReviewArtifact, acpClientError) {
	var payload map[string]any
	if err := json.Unmarshal(params, &payload); err != nil {
		return ReviewArtifact{}, invalidParams("Invalid params")
	}
	sessionID, _ := payload["sessionId"].(string)
	if strings.TrimSpace(sessionID) == "" {
		return ReviewArtifact{}, invalidParams("sessionId is required")
	}
	pathValue := firstStringValue(payload, "path", "imagePath", "file")
	if strings.TrimSpace(pathValue) == "" {
		return ReviewArtifact{}, invalidParams("path is required")
	}
	localSessionID := r.localSessionID(sessionID)
	if localSessionID == "" {
		return ReviewArtifact{}, resourceNotFound("ACP session is not registered")
	}
	session, err := r.storage.GetSession(context.Background(), localSessionID)
	if err != nil {
		return ReviewArtifact{}, resourceNotFound("Session not found")
	}
	workspace, err := r.storage.GetWorkspace(context.Background(), session.WorkspaceID)
	if err != nil {
		return ReviewArtifact{}, resourceNotFound("Workspace not found")
	}
	snapshot, snapshotErr := snapshotWorkspaceImage(workspace.Path, pathValue)
	if snapshotErr.message != "" {
		return ReviewArtifact{}, snapshotErr
	}
	title := strings.TrimSpace(firstStringValue(payload, "title"))
	if title == "" {
		title = snapshot.name
	}
	caption := strings.TrimSpace(firstStringValue(payload, "caption"))
	var captionValue any
	summary := "Image: " + snapshot.name
	if caption != "" {
		captionValue = caption
		summary = caption
	}
	var toolCallID *string
	if value := strings.TrimSpace(firstStringValue(payload, "toolCallId", "tool_call_id")); value != "" {
		toolCallID = &value
	}
	artifact, createErr := r.storage.CreateReviewArtifact(context.Background(), localSessionID, toolCallID, "image", title, summary, map[string]any{
		"type":       "image",
		"mimeType":   snapshot.mimeType,
		"data":       snapshot.data,
		"name":       snapshot.name,
		"caption":    captionValue,
		"sourcePath": snapshot.relativePath,
		"sizeBytes":  snapshot.sizeBytes,
	}, source)
	if createErr != nil {
		return ReviewArtifact{}, invalidParams("Failed to persist image evidence")
	}
	return artifact, acpClientError{}
}

type acpClientError struct {
	code    int
	message string
}

func invalidParams(message string) acpClientError {
	return acpClientError{code: -32602, message: message}
}

func resourceNotFound(message string) acpClientError {
	return acpClientError{code: -32004, message: message}
}

func initializeParams() map[string]any {
	return map[string]any{
		"protocolVersion": 1,
		"clientCapabilities": map[string]any{
			"fs": map[string]any{"readTextFile": true},
			"_meta": map[string]any{
				"acp-webui": map[string]any{
					"displayImage": map[string]any{
						"name":        "display_image",
						"description": displayImageDescription,
						"inputSchema": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"path":    map[string]any{"type": "string", "description": "Workspace-contained image path to display inline."},
								"title":   map[string]any{"type": "string", "description": "Optional concise image title."},
								"caption": map[string]any{"type": "string", "description": "Optional short caption for the user."},
							},
							"required": []string{"path"},
						},
					},
				},
			},
		},
		"clientInfo": map[string]any{"name": "acp-webui", "title": "ACP Web UI", "version": "0.1.0"},
	}
}

func displayImageMCPServers() []any {
	command, err := os.Executable()
	if err != nil || strings.TrimSpace(command) == "" {
		return []any{}
	}
	return []any{map[string]any{
		"name":    "acp-webui-display-image",
		"command": command,
		"args":    []string{"mcp-display-image"},
		"env":     []string{},
	}}
}

func firstStringValue(values map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := values[key].(string); ok && strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func resolveWorkspacePath(workspacePath, requestedPath string) (string, string, acpClientError) {
	workspaceRoot, err := filepath.EvalSymlinks(workspacePath)
	if err != nil {
		return "", "", resourceNotFound("Workspace not found")
	}
	target := requestedPath
	if !filepath.IsAbs(target) {
		target = filepath.Join(workspaceRoot, target)
	}
	canonicalTarget, err := filepath.EvalSymlinks(target)
	if err != nil {
		return "", "", resourceNotFound("File not found")
	}
	relative, err := filepath.Rel(workspaceRoot, canonicalTarget)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) || filepath.IsAbs(relative) {
		return "", "", resourceNotFound("File is outside the session workspace")
	}
	return canonicalTarget, filepath.ToSlash(relative), acpClientError{}
}

func applyLineBounds(content string, line *int, limit *int) (string, acpClientError) {
	if line != nil && *line < 1 {
		return "", invalidParams("line must be greater than zero")
	}
	if limit != nil && *limit < 1 {
		return "", invalidParams("limit must be greater than zero")
	}
	lines := strings.SplitAfter(content, "\n")
	start := 0
	if line != nil {
		start = *line - 1
	}
	if start >= len(lines) {
		return "", acpClientError{}
	}
	end := len(lines)
	if limit != nil && start+*limit < end {
		end = start + *limit
	}
	return strings.Join(lines[start:end], ""), acpClientError{}
}

type imageSnapshot struct {
	mimeType     string
	data         string
	name         string
	relativePath string
	sizeBytes    int64
}

func snapshotWorkspaceImage(workspacePath, requestedPath string) (imageSnapshot, acpClientError) {
	target, relativePath, err := resolveWorkspacePath(workspacePath, requestedPath)
	if err.message != "" {
		return imageSnapshot{}, err
	}
	info, statErr := os.Stat(target)
	if statErr != nil {
		return imageSnapshot{}, resourceNotFound("Image file not found")
	}
	if info.IsDir() {
		return imageSnapshot{}, invalidParams("Image path must refer to a file")
	}
	if info.Size() > maxDisplayImageBytes {
		return imageSnapshot{}, invalidParams("Image files must be 5 MB or smaller")
	}
	bytes, readErr := os.ReadFile(target)
	if readErr != nil {
		return imageSnapshot{}, resourceNotFound("Image file is not readable")
	}
	mimeType := imageMimeType(target, bytes)
	if mimeType == "" {
		return imageSnapshot{}, invalidParams("Unsupported image type")
	}
	name := filepath.Base(target)
	if name == "." || name == string(os.PathSeparator) {
		name = "image"
	}
	return imageSnapshot{
		mimeType:     mimeType,
		data:         base64.StdEncoding.EncodeToString(bytes),
		name:         name,
		relativePath: relativePath,
		sizeBytes:    info.Size(),
	}, acpClientError{}
}

func imageMimeType(path string, bytes []byte) string {
	if len(bytes) >= 8 && string(bytes[:8]) == "\x89PNG\r\n\x1a\n" {
		return "image/png"
	}
	if len(bytes) >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff {
		return "image/jpeg"
	}
	if len(bytes) >= 6 && (string(bytes[:6]) == "GIF87a" || string(bytes[:6]) == "GIF89a") {
		return "image/gif"
	}
	if len(bytes) >= 12 && string(bytes[:4]) == "RIFF" && string(bytes[8:12]) == "WEBP" {
		return "image/webp"
	}
	switch strings.ToLower(filepath.Ext(path)) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	default:
		return ""
	}
}

func reviewArtifactSummaryFromArtifact(artifact ReviewArtifact) ReviewArtifactSummary {
	return ReviewArtifactSummary{
		ID:         artifact.ID,
		SessionID:  artifact.SessionID,
		ToolCallID: artifact.ToolCallID,
		Kind:       artifact.Kind,
		Title:      artifact.Title,
		Summary:    artifact.Summary,
		Preview:    previewFromPayload(artifact.Kind, artifact.Payload),
		Source:     artifact.Source,
		CreatedAt:  artifact.CreatedAt,
	}
}

func (r *AgentRuntime) handleSessionUpdate(params json.RawMessage) {
	var payload struct {
		SessionID string         `json:"sessionId"`
		Update    map[string]any `json:"update"`
	}
	if err := json.Unmarshal(params, &payload); err != nil {
		return
	}
	localSessionID := r.localSessionID(payload.SessionID)
	if localSessionID == "" {
		return
	}
	updateType, _ := payload.Update["sessionUpdate"].(string)
	ctx := context.Background()
	switch updateType {
	case "agent_message_chunk":
		content := contentText(payload.Update["content"])
		if content == "" {
			return
		}
		r.mu.Lock()
		r.assistant[localSessionID] += content
		r.mu.Unlock()
		r.events.Publish(map[string]any{"type": "text_delta", "sessionId": localSessionID, "delta": content})
	case "user_message_chunk":
		// Replayed user history is already persisted for normal restore paths.
	case "config_option_update":
		options := configOptionsFromAny(payload.Update["configOptions"])
		state, err := r.storage.UpdateSessionConfigOptions(ctx, localSessionID, options)
		if err == nil {
			r.events.Publish(map[string]any{"type": "session_config_updated", "sessionId": localSessionID, "configOptions": state.ConfigOptions, "currentModel": state.CurrentModel})
		}
	case "tool_call":
		r.persistToolCall(ctx, localSessionID, payload.Update)
	}
}

func (r *AgentRuntime) localSessionID(acpSessionID string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.sessionMap[acpSessionID]
}

func contentText(value any) string {
	object, ok := value.(map[string]any)
	if !ok {
		return ""
	}
	text, _ := object["text"].(string)
	return text
}

func configOptionsFromAny(value any) []SessionConfigOption {
	data, _ := json.Marshal(value)
	var options []SessionConfigOption
	_ = json.Unmarshal(data, &options)
	if options == nil {
		return []SessionConfigOption{}
	}
	return options
}

func (r *AgentRuntime) persistToolCall(ctx context.Context, sessionID string, update map[string]any) {
	acpID, _ := update["toolCallId"].(string)
	title, _ := update["title"].(string)
	kind, _ := update["kind"].(string)
	statusValue, _ := update["status"].(string)
	if title == "" {
		title = "Tool call"
	}
	if kind == "" {
		kind = "tool"
	}
	if statusValue == "" {
		statusValue = "completed"
	}
	summary := toolSummary(update)
	var acpIDPtr *string
	if acpID != "" {
		acpIDPtr = &acpID
	}
	call, err := r.storage.UpsertToolCall(ctx, sessionID, acpIDPtr, kind, title, summary, statusValue, update, nil)
	if err != nil {
		return
	}
	r.events.Publish(map[string]any{"type": "timeline_item_upsert", "item": toolCallTimelineItem(call)})
	if statusValue == "completed" {
		artifactKind := "tool_call"
		payload := map[string]any{"toolCallId": acpID, "status": statusValue, "update": update}
		if markdown, ok := update["markdown"].(string); ok && markdown != "" {
			artifactKind = "markdown"
			payload["markdown"] = markdown
			summary = summarizeText(markdown, summary)
		}
		artifact, err := r.storage.CreateReviewArtifact(ctx, sessionID, acpIDPtr, artifactKind, title, summary, payload, "tool_call")
		if err == nil {
			summary := ReviewArtifactSummary{ID: artifact.ID, SessionID: artifact.SessionID, ToolCallID: artifact.ToolCallID, Kind: artifact.Kind, Title: artifact.Title, Summary: artifact.Summary, Preview: nil, Source: artifact.Source, CreatedAt: artifact.CreatedAt}
			r.events.Publish(map[string]any{"type": "review_artifact", "artifact": summary})
		}
	}
}

func toolSummary(update map[string]any) string {
	if markdown, ok := update["markdown"].(string); ok && markdown != "" {
		return summarizeText(markdown, "Markdown evidence")
	}
	if content, ok := update["content"].([]any); ok {
		var parts []string
		for _, item := range content {
			if text := contentText(item); text != "" {
				parts = append(parts, text)
			}
		}
		return summarizeText(strings.Join(parts, "\n"), "Tool call completed")
	}
	return "Tool call completed"
}

func (r *AgentRuntime) handlePermissionRequest(id json.RawMessage, params json.RawMessage) {
	requestID := idKey(id)
	var payload struct {
		SessionID string             `json:"sessionId"`
		ToolCall  map[string]any     `json:"toolCall"`
		Options   []PermissionOption `json:"options"`
	}
	if err := json.Unmarshal(params, &payload); err != nil {
		return
	}
	localSessionID := r.localSessionID(payload.SessionID)
	if localSessionID == "" {
		_ = r.sendResponse(requestID, map[string]any{"outcome": map[string]any{"optionId": "cancelled"}})
		return
	}
	title, _ := payload.ToolCall["title"].(string)
	kind, _ := payload.ToolCall["kind"].(string)
	toolCallID, _ := payload.ToolCall["toolCallId"].(string)
	if title == "" {
		title = "Permission request"
	}
	if kind == "" {
		kind = "tool"
	}
	var toolCallIDPtr *string
	if toolCallID != "" {
		toolCallIDPtr = &toolCallID
	}
	permission, err := r.storage.CreatePermissionRequest(context.Background(), NewPermissionRequest{
		SessionID:    localSessionID,
		ACPSessionID: payload.SessionID,
		ACPRequestID: requestID,
		ToolCallID:   toolCallIDPtr,
		Title:        title,
		Kind:         kind,
		ToolCall:     payload.ToolCall,
		Options:      payload.Options,
	})
	if err != nil {
		_ = r.sendResponse(requestID, map[string]any{"outcome": map[string]any{"optionId": "cancelled"}})
		return
	}
	r.mu.Lock()
	r.permissionMap[permission.ID] = requestID
	r.mu.Unlock()
	pending, _ := r.storage.PendingPermissionsForSession(context.Background(), localSessionID)
	active := permission
	if len(pending) > 0 {
		active = pending[0]
	}
	r.events.Publish(map[string]any{
		"type":                 "permission_requested",
		"permission":           permission,
		"activePermission":     active,
		"pendingApprovalCount": len(pending),
		"queuedApprovalCount":  maxInt64(int64(len(pending)-1), 0),
	})
}

func messageTimelineItem(message Message) TimelineItem {
	return TimelineItem{
		"kind":          "message",
		"id":            message.ID,
		"sessionId":     message.SessionID,
		"timestamp":     message.CreatedAt,
		"status":        message.Status,
		"role":          message.Role,
		"content":       message.Content,
		"contentBlocks": message.ContentBlocks,
	}
}

func toolCallTimelineItem(call ToolCall) TimelineItem {
	return TimelineItem{
		"kind":              "tool_call",
		"id":                call.ID,
		"sessionId":         call.SessionID,
		"timestamp":         call.CreatedAt,
		"status":            call.Status,
		"toolCallId":        call.ACPToolCallID,
		"toolKind":          call.Kind,
		"title":             call.Title,
		"summary":           call.Summary,
		"input":             parseJSONValue(call.InputJSON),
		"output":            nil,
		"reviewArtifactIds": []string{},
	}
}
