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

const (
	maxDisplayImageBytes   = 5 * 1024 * 1024
	maxACPSessionListPages = 100
)

type initializeResult struct {
	AgentInfo         any `json:"agentInfo"`
	AgentCapabilities struct {
		LoadSession         bool                          `json:"loadSession"`
		SessionCapabilities initializeSessionCapabilities `json:"sessionCapabilities"`
		PromptCapabilities  struct {
			Image           bool `json:"image"`
			Audio           bool `json:"audio"`
			EmbeddedContext bool `json:"embeddedContext"`
		} `json:"promptCapabilities"`
	} `json:"agentCapabilities"`
}

type initializeSessionCapabilities struct {
	List   any `json:"list"`
	Resume any `json:"resume"`
	Close  any `json:"close"`
}

type ACPSessionListParams struct {
	CWD    string  `json:"cwd,omitempty"`
	Cursor *string `json:"cursor,omitempty"`
}

type ACPSessionListResult struct {
	Sessions   []ACPSessionListItem `json:"sessions"`
	NextCursor *string              `json:"nextCursor,omitempty"`
}

type ACPSessionListItem struct {
	SessionID string         `json:"sessionId"`
	CWD       string         `json:"cwd"`
	Title     *string        `json:"title,omitempty"`
	UpdatedAt *string        `json:"updatedAt,omitempty"`
	Meta      map[string]any `json:"_meta,omitempty"`
}

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

func (m *AgentRuntimeManager) SyncWorkspaceAgentSessions(ctx context.Context, workspace Workspace, agentID string, profile ResolvedAgentLaunchProfile) ([]SessionListItem, error) {
	resolvedAgentID, err := m.resolveAgentID(agentID)
	if err != nil {
		return nil, err
	}
	agent := m.configs[resolvedAgentID]
	if strings.TrimSpace(profile.Key) == "" {
		permissionMode := profile.PermissionMode
		if strings.TrimSpace(permissionMode) == "" {
			permissionMode = permissionManual
		}
		profile, err = m.resolveLaunchProfile(resolvedAgentID, permissionMode, nil)
		if err != nil {
			return nil, err
		}
	}

	runtime, runtimeErr := m.runtimeForLaunchProfile(resolvedAgentID, profile, true)
	workspaceCWD := nativePathString(workspace.Path)
	if runtimeErr == nil && runtime.supportsSessionList() {
		if sessions, err := runtime.ListSessions(ctx, workspaceCWD); err == nil {
			for _, item := range sessions {
				if !nativeSessionMatchesWorkspace(item, workspaceCWD) {
					continue
				}
				if _, err := m.storage.ImportNativeSession(ctx, NativeSessionImport{
					WorkspaceID:       workspace.ID,
					AgentID:           resolvedAgentID,
					AgentName:         agent.Title,
					ExternalSessionID: item.SessionID,
					Title:             item.Title,
					NativeTitle:       item.Title,
					NativeUpdatedAt:   item.UpdatedAt,
					PermissionMode:    profile.PermissionMode,
					LaunchProfile:     profile,
					ImportSource:      importSourceACPSessionList,
				}); err != nil {
					return nil, err
				}
			}
		}
	}
	return m.storage.ListSessionItemsForAgent(ctx, workspace.ID, resolvedAgentID)
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
			status = m.statusForMode(agent, permissionManual)
		}
		var modes []AgentPermissionModeStatus
		for _, mode := range agent.PermissionModes {
			modeStatus := status
			if !agent.Enabled {
				modeStatus = disabledStatus(agent.Title + " is disabled")
			} else {
				modeStatus = m.statusForMode(agent, mode.ID)
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

func (m *AgentRuntimeManager) statusForMode(agent AgentConfig, mode string) ConnectionStatus {
	key, ok := agent.defaultLaunchProfileKeyForPermissionMode(mode)
	if !ok {
		return failedStatus(fmt.Sprintf("%s permission mode %q is not available", agent.Title, mode))
	}
	runtimeKey := agent.ID + "\x00" + key
	m.mu.Lock()
	runtime := m.runtimes[runtimeKey]
	m.mu.Unlock()
	if runtime == nil {
		return idleStatus(agent.Title)
	}
	return runtime.status()
}

func (m *AgentRuntimeManager) codexStatus() ConnectionStatus {
	agent, ok := m.configs[codexAgentID]
	if !ok {
		return failedStatus("Codex runtime is not available")
	}
	if !agent.Enabled {
		return disabledStatus("Codex is disabled")
	}
	return m.statusForMode(agent, permissionManual)
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
	restoreMap     map[string]RestoreContext
	permissionMap  map[string]json.RawMessage
	assistant      map[string]string
	assistantIDs   map[string]string
	promptCaps     AgentPromptCapabilities
	sessionCaps    AgentSessionCapabilities
}

type RestoreContext struct {
	LocalSessionID         string
	PersistReplayedHistory bool
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
		restoreMap:     map[string]RestoreContext{},
		permissionMap:  map[string]json.RawMessage{},
		assistant:      map[string]string{},
		assistantIDs:   map[string]string{},
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

func (r *AgentRuntime) supportsSessionList() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.sessionCaps.ListSessions
}

func (r *AgentRuntime) setStatus(status ConnectionStatus) {
	r.mu.Lock()
	r.statusValue = status
	r.mu.Unlock()
	r.events.Publish(map[string]any{"type": "agent_connection_status", "agentId": r.agent.ID, "permissionMode": r.permissionMode, "status": status})
	if r.agent.ID == codexAgentID && r.permissionMode == permissionManual {
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

	var initResult initializeResult
	if err := r.request(ctx, "initialize", initializeParams(), &initResult); err != nil {
		r.setStatus(failedStatus(err.Error()))
		return err
	}
	promptCaps := AgentPromptCapabilities{
		Image:           initResult.AgentCapabilities.PromptCapabilities.Image,
		Audio:           initResult.AgentCapabilities.PromptCapabilities.Audio,
		EmbeddedContext: initResult.AgentCapabilities.PromptCapabilities.EmbeddedContext,
	}
	sessionCaps := parseAgentSessionCapabilities(initResult.AgentCapabilities.LoadSession, initResult.AgentCapabilities.SessionCapabilities)
	r.mu.Lock()
	r.promptCaps = promptCaps
	r.sessionCaps = sessionCaps
	r.mu.Unlock()
	r.setStatus(readyStatus(initResult.AgentInfo, promptCaps, sessionCaps))
	return nil
}

func parseAgentSessionCapabilities(loadSession bool, caps initializeSessionCapabilities) AgentSessionCapabilities {
	return AgentSessionCapabilities{
		LoadSession:   loadSession,
		ResumeSession: acpCapabilityAdvertised(caps.Resume),
		ListSessions:  acpCapabilityAdvertised(caps.List),
		CloseSession:  acpCapabilityAdvertised(caps.Close),
	}
}

func acpCapabilityAdvertised(value any) bool {
	switch capability := value.(type) {
	case nil:
		return false
	case bool:
		return capability
	default:
		return true
	}
}

func nativeSessionMatchesWorkspace(item ACPSessionListItem, workspaceCWD string) bool {
	return strings.TrimSpace(item.SessionID) != "" && strings.TrimSpace(item.CWD) != "" && item.CWD == workspaceCWD
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

func cloneRawMessage(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return nil
	}
	return append(json.RawMessage(nil), raw...)
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

func (r *AgentRuntime) ListSessions(ctx context.Context, cwd string) ([]ACPSessionListItem, error) {
	if err := r.ensureReady(ctx); err != nil {
		return nil, err
	}
	r.mu.Lock()
	canList := r.sessionCaps.ListSessions
	agentTitle := r.agent.Title
	r.mu.Unlock()
	if !canList {
		return nil, fmt.Errorf("%s does not support session/list", agentTitle)
	}

	sessions := make([]ACPSessionListItem, 0)
	var cursor *string
	seenCursors := map[string]struct{}{}
	for page := 0; page < maxACPSessionListPages; page++ {
		var result ACPSessionListResult
		if err := r.request(ctx, "session/list", ACPSessionListParams{CWD: cwd, Cursor: cursor}, &result); err != nil {
			return nil, err
		}
		sessions = append(sessions, result.Sessions...)
		if result.NextCursor == nil || strings.TrimSpace(*result.NextCursor) == "" {
			return sessions, nil
		}
		nextCursor := *result.NextCursor
		if _, ok := seenCursors[nextCursor]; ok {
			return nil, fmt.Errorf("session/list cursor loop detected at %q", nextCursor)
		}
		seenCursors[nextCursor] = struct{}{}
		cursor = &nextCursor
	}
	return nil, fmt.Errorf("session/list exceeded %d pages", maxACPSessionListPages)
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
	hasAssistantHistory, err := r.storage.HasAssistantMessages(ctx, localSessionID)
	if err != nil {
		return nil, err
	}
	r.mu.Lock()
	r.restoreMap[externalSessionID] = RestoreContext{
		LocalSessionID:         localSessionID,
		PersistReplayedHistory: !hasAssistantHistory,
	}
	r.mu.Unlock()
	var result struct {
		SessionID     string                `json:"sessionId"`
		ConfigOptions []SessionConfigOption `json:"configOptions"`
	}
	err = r.request(ctx, "session/load", map[string]any{"sessionId": externalSessionID, "cwd": cwd, "mcpServers": displayImageMCPServers()}, &result)
	if err == nil && !hasAssistantHistory {
		r.flushAssistantBuffer(ctx, externalSessionID, localSessionID, true, true, false)
	} else {
		r.discardAssistantBuffer(externalSessionID)
	}
	r.mu.Lock()
	delete(r.restoreMap, externalSessionID)
	if err == nil {
		r.sessionMap[externalSessionID] = localSessionID
	}
	r.mu.Unlock()
	if err != nil {
		return nil, err
	}
	return result.ConfigOptions, nil
}

func (r *AgentRuntime) promptCapabilities() AgentPromptCapabilities {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.promptCaps
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
	requestID := cloneRawMessage(r.permissionMap[permissionID])
	delete(r.permissionMap, permissionID)
	r.mu.Unlock()
	if len(requestID) > 0 {
		if err := r.sendRawResult(requestID, selectedPermissionResponse(optionID)); err != nil {
			return permission, err
		}
	}
	pending, _ := r.storage.PendingPermissionsForSession(ctx, permission.SessionID)
	var next *PermissionRequest
	nextStatus := statusWaitingApproval
	if len(pending) > 0 {
		next = &pending[0]
	} else {
		_ = r.storage.UpdateSessionStatus(ctx, permission.SessionID, statusRunning)
		nextStatus = statusRunning
	}
	r.events.Publish(map[string]any{"type": "session_status", "sessionId": permission.SessionID, "status": nextStatus})
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
		requestID := cloneRawMessage(r.permissionMap[permission.ID])
		delete(r.permissionMap, permission.ID)
		r.mu.Unlock()
		if len(requestID) > 0 {
			_ = r.sendRawResult(requestID, cancelledPermissionResponse())
		}
	}
	return r.storage.CancelPendingPermissionsForSession(ctx, sessionID)
}

func (r *AgentRuntime) Prompt(ctx context.Context, localSessionID, acpSessionID string, blocks []MessageContentBlock) error {
	if err := r.ensureReady(ctx); err != nil {
		return err
	}
	r.beginAssistantBuffer(acpSessionID)
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
	content := r.flushAssistantBuffer(ctx, acpSessionID, localSessionID, true, false, true)
	if content != "" {
		r.persistImageArtifactsFromText(ctx, localSessionID, nil, content)
	}
	return err
}

func (r *AgentRuntime) beginAssistantBuffer(bufferID string) {
	r.mu.Lock()
	r.assistant[bufferID] = ""
	r.mu.Unlock()
}

func (r *AgentRuntime) appendAssistantBuffer(ctx context.Context, bufferID, localSessionID string, blocks []MessageContentBlock, persistLive bool) (string, bool) {
	content := textFallbackFromBlocks(blocks)
	r.mu.Lock()
	if _, ok := r.assistant[bufferID]; !ok {
		r.mu.Unlock()
		return "", false
	}
	r.assistant[bufferID] += content
	r.mu.Unlock()
	if persistLive {
		r.persistLiveAssistantChunk(ctx, bufferID, localSessionID, blocks)
	}
	return content, true
}

func (r *AgentRuntime) persistLiveAssistantChunk(ctx context.Context, bufferID, localSessionID string, blocks []MessageContentBlock) {
	contentDelta := textFallbackFromBlocks(blocks)
	r.mu.Lock()
	messageID := r.assistantIDs[bufferID]
	r.mu.Unlock()
	if messageID != "" {
		_, _ = r.storage.AppendMessageContentBlocks(ctx, messageID, contentDelta, blocks, statusRunning)
		return
	}
	message, err := r.storage.CreateMessage(ctx, localSessionID, roleAssistant, contentDelta, blocks, statusRunning)
	if err != nil {
		return
	}
	r.mu.Lock()
	r.assistantIDs[bufferID] = message.ID
	r.mu.Unlock()
}

func (r *AgentRuntime) flushAssistantBuffer(ctx context.Context, bufferID, localSessionID string, close bool, dedupe bool, emitAssistant bool) string {
	content, messageID := r.drainAssistantBuffer(bufferID, close)
	if content == "" {
		return ""
	}
	var message *Message
	if messageID != "" {
		updated, err := r.storage.UpdateMessageStatus(ctx, messageID, statusIdle)
		if err == nil {
			message = &updated
		}
	} else if dedupe {
		created, err := r.storage.CreateMessageIfMissing(ctx, localSessionID, roleAssistant, content, []MessageContentBlock{textBlock(content)}, statusIdle)
		if err == nil {
			message = created
		}
	} else {
		created, err := r.storage.CreateMessage(ctx, localSessionID, roleAssistant, content, []MessageContentBlock{textBlock(content)}, statusIdle)
		if err == nil {
			message = &created
		}
	}
	if message != nil {
		r.events.Publish(map[string]any{"type": "timeline_item_upsert", "item": messageTimelineItem(*message)})
	}
	if emitAssistant {
		r.events.Publish(map[string]any{"type": "assistant_message", "sessionId": localSessionID, "content": content})
	}
	return content
}

func (r *AgentRuntime) drainAssistantBuffer(bufferID string, close bool) (string, string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	content, ok := r.assistant[bufferID]
	if !ok {
		return "", ""
	}
	if close {
		delete(r.assistant, bufferID)
	} else {
		r.assistant[bufferID] = ""
	}
	messageID := r.assistantIDs[bufferID]
	delete(r.assistantIDs, bufferID)
	return content, messageID
}

func (r *AgentRuntime) discardAssistantBuffer(bufferID string) {
	r.mu.Lock()
	delete(r.assistant, bufferID)
	delete(r.assistantIDs, bufferID)
	r.mu.Unlock()
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
	r.flushAssistantBuffer(context.Background(), sessionID, localSessionID, false, false, true)
	var toolCallID *string
	if value := strings.TrimSpace(firstStringValue(payload, "toolCallId", "tool_call_id")); value != "" {
		toolCallID = &value
	}
	return r.displayImageArtifactForLocalSession(context.Background(), localSessionID, toolCallID, pathValue, firstStringValue(payload, "title"), firstStringValue(payload, "caption"), source)
}

func (r *AgentRuntime) displayImageArtifactForLocalSession(ctx context.Context, localSessionID string, toolCallID *string, pathValue, titleValue, captionText, source string) (ReviewArtifact, acpClientError) {
	session, err := r.storage.GetSession(ctx, localSessionID)
	if err != nil {
		return ReviewArtifact{}, resourceNotFound("Session not found")
	}
	workspace, err := r.storage.GetWorkspace(ctx, session.WorkspaceID)
	if err != nil {
		return ReviewArtifact{}, resourceNotFound("Workspace not found")
	}
	snapshot, snapshotErr := snapshotWorkspaceImage(workspace.Path, pathValue)
	if snapshotErr.message != "" {
		return ReviewArtifact{}, snapshotErr
	}
	title := strings.TrimSpace(titleValue)
	if title == "" {
		title = snapshot.name
	}
	caption := strings.TrimSpace(captionText)
	var captionPayload any
	summary := "Image: " + snapshot.name
	if caption != "" {
		captionPayload = caption
		summary = caption
	}
	result, createErr := r.storage.UpsertReviewArtifact(ctx, localSessionID, toolCallID, "image", title, summary, map[string]any{
		"type":       "image",
		"mimeType":   snapshot.mimeType,
		"data":       snapshot.data,
		"name":       snapshot.name,
		"caption":    captionPayload,
		"sourcePath": snapshot.relativePath,
		"sizeBytes":  snapshot.sizeBytes,
	}, source)
	if createErr != nil {
		return ReviewArtifact{}, invalidParams("Failed to persist image evidence")
	}
	return result.Artifact, acpClientError{}
}

func (r *AgentRuntime) persistDisplayImageFromToolUpdate(ctx context.Context, localSessionID string, update map[string]any) {
	if !looksLikeDisplayImageCall(update) {
		return
	}
	pathValue := findStringField(update, []string{"path", "imagePath", "file"})
	if pathValue == "" {
		return
	}
	artifact, err := r.displayImageArtifactForLocalSession(
		ctx,
		localSessionID,
		toolCallID(update),
		pathValue,
		findStringField(update, []string{"title", "name"}),
		findStringField(update, []string{"caption", "description"}),
		"display_image",
	)
	if err.message == "" {
		r.events.Publish(map[string]any{"type": "review_artifact", "artifact": reviewArtifactSummaryFromArtifact(artifact)})
	}
}

func (r *AgentRuntime) persistImageArtifactsFromText(ctx context.Context, localSessionID string, toolCallID *string, text string) {
	created := 0
	for _, pathValue := range candidateImagePaths(text) {
		if created >= 3 {
			break
		}
		artifact, err := r.displayImageArtifactForLocalSession(ctx, localSessionID, toolCallID, pathValue, "", "", "path_enrichment")
		if err.message != "" {
			continue
		}
		created++
		r.events.Publish(map[string]any{"type": "review_artifact", "artifact": reviewArtifactSummaryFromArtifact(artifact)})
	}
}

func looksLikeDisplayImageCall(value any) bool {
	var builder strings.Builder
	collectStringValues(value, 0, &builder)
	text := strings.ToLower(builder.String())
	return strings.Contains(text, "display_image") || strings.Contains(text, "display image") || strings.Contains(text, "acp-webui/display_image")
}

func collectStringValues(value any, depth int, builder *strings.Builder) {
	if depth > 5 {
		return
	}
	switch typed := value.(type) {
	case string:
		builder.WriteByte(' ')
		builder.WriteString(typed)
	case []any:
		for _, item := range typed {
			collectStringValues(item, depth+1, builder)
		}
	case map[string]any:
		for key, item := range typed {
			builder.WriteByte(' ')
			builder.WriteString(key)
			collectStringValues(item, depth+1, builder)
		}
	}
}

func findStringField(value any, keys []string) string {
	return findStringFieldInner(value, keys, 0)
}

func findStringFieldInner(value any, keys []string, depth int) string {
	if depth > 5 {
		return ""
	}
	switch typed := value.(type) {
	case map[string]any:
		for _, key := range keys {
			if text, ok := typed[key].(string); ok && strings.TrimSpace(text) != "" {
				return strings.TrimSpace(text)
			}
		}
		for _, key := range []string{"input", "params", "arguments", "toolCall", "data", "content", "output", "rawOutput", "structuredContent"} {
			if found := findStringFieldInner(typed[key], keys, depth+1); found != "" {
				return found
			}
		}
	case []any:
		for _, item := range typed {
			if found := findStringFieldInner(item, keys, depth+1); found != "" {
				return found
			}
		}
	}
	return ""
}

func candidateImagePaths(text string) []string {
	var paths []string
	for _, raw := range strings.Fields(text) {
		candidate := strings.Trim(raw, "`'\",;:.)([]<>!")
		if candidate == "" || strings.Contains(candidate, "://") {
			continue
		}
		lower := strings.ToLower(candidate)
		if !(strings.HasSuffix(lower, ".png") || strings.HasSuffix(lower, ".jpg") || strings.HasSuffix(lower, ".jpeg") || strings.HasSuffix(lower, ".webp") || strings.HasSuffix(lower, ".gif")) {
			continue
		}
		seen := false
		for _, existing := range paths {
			if existing == candidate {
				seen = true
				break
			}
		}
		if !seen {
			paths = append(paths, candidate)
		}
	}
	return paths
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
	updateType, _ := payload.Update["sessionUpdate"].(string)
	ctx := context.Background()
	switch updateType {
	case "agent_message_chunk":
		blocks := contentBlocksFromAny(payload.Update["content"])
		if len(blocks) == 0 {
			return
		}
		if localSessionID := r.localSessionID(payload.SessionID); localSessionID != "" {
			r.beginAssistantBufferIfMissing(payload.SessionID)
			if content, ok := r.appendAssistantBuffer(ctx, payload.SessionID, localSessionID, blocks, true); ok && content != "" {
				r.events.Publish(map[string]any{"type": "text_delta", "sessionId": localSessionID, "delta": content})
			}
			return
		}
		if restore, ok := r.restoreContext(payload.SessionID); ok {
			if restore.PersistReplayedHistory {
				r.beginAssistantBufferIfMissing(payload.SessionID)
				_, _ = r.appendAssistantBuffer(ctx, payload.SessionID, restore.LocalSessionID, blocks, false)
			} else {
				r.discardAssistantBuffer(payload.SessionID)
			}
		}
	case "user_message_chunk":
		restore, ok := r.restoreContext(payload.SessionID)
		if !ok {
			return
		}
		if !restore.PersistReplayedHistory {
			r.discardAssistantBuffer(payload.SessionID)
			return
		}
		r.flushAssistantBuffer(ctx, payload.SessionID, restore.LocalSessionID, true, true, false)
		blocks := contentBlocksFromAny(payload.Update["content"])
		if len(blocks) == 0 {
			return
		}
		content := textFallbackFromBlocks(blocks)
		message, err := r.storage.CreateMessageIfMissing(ctx, restore.LocalSessionID, roleUser, content, blocks, statusIdle)
		if err == nil && message != nil {
			r.events.Publish(map[string]any{"type": "timeline_item_upsert", "item": messageTimelineItem(*message)})
		}
	case "config_option_update":
		localSessionID := r.localSessionID(payload.SessionID)
		if localSessionID == "" {
			return
		}
		options := configOptionsFromAny(payload.Update["configOptions"])
		state, err := r.storage.UpdateSessionConfigOptions(ctx, localSessionID, options)
		if err == nil {
			r.events.Publish(map[string]any{"type": "session_config_updated", "sessionId": localSessionID, "configOptions": state.ConfigOptions, "currentModel": state.CurrentModel})
		}
	case "tool_call", "tool_call_update":
		if restore, ok := r.restoreContext(payload.SessionID); ok {
			if !restore.PersistReplayedHistory {
				r.discardAssistantBuffer(payload.SessionID)
				return
			}
			r.flushAssistantBuffer(ctx, payload.SessionID, restore.LocalSessionID, true, true, false)
			if toolCallID(payload.Update) == nil {
				return
			}
			r.persistToolCall(ctx, restore.LocalSessionID, payload.Update)
			return
		}
		localSessionID := r.localSessionID(payload.SessionID)
		if localSessionID == "" {
			return
		}
		r.flushAssistantBuffer(ctx, payload.SessionID, localSessionID, false, false, true)
		r.persistToolCall(ctx, localSessionID, payload.Update)
	}
}

func (r *AgentRuntime) localSessionID(acpSessionID string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.sessionMap[acpSessionID]
}

func (r *AgentRuntime) restoreContext(acpSessionID string) (RestoreContext, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	restore, ok := r.restoreMap[acpSessionID]
	return restore, ok
}

func (r *AgentRuntime) beginAssistantBufferIfMissing(bufferID string) {
	r.mu.Lock()
	if _, ok := r.assistant[bufferID]; !ok {
		r.assistant[bufferID] = ""
	}
	r.mu.Unlock()
}

func contentText(value any) string {
	return textFromAny(value)
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

func toolCallID(value map[string]any) *string {
	for _, key := range []string{"toolCallId", "id"} {
		if text, ok := value[key].(string); ok && text != "" {
			return &text
		}
	}
	return nil
}

func toolCallTitle(value map[string]any) string {
	if text := toolCallTitleField(value); text != "" {
		return text
	}
	return "Tool call"
}

func permissionToolCallTitle(value map[string]any) string {
	if text := toolCallTitleField(value); text != "" {
		return text
	}
	return "Permission requested"
}

func toolCallTitleField(value map[string]any) string {
	for _, key := range []string{"title", "name"} {
		if text, ok := value[key].(string); ok && text != "" {
			return text
		}
	}
	return ""
}

func toolCallKind(value map[string]any) string {
	for _, key := range []string{"kind", "type"} {
		if text, ok := value[key].(string); ok && text != "" {
			return text
		}
	}
	return "unknown"
}

func normalizedToolStatus(update map[string]any) string {
	status, _ := update["status"].(string)
	switch strings.ToLower(status) {
	case "completed", "complete", "succeeded", "success":
		return "completed"
	case "failed", "error":
		return "failed"
	default:
		return statusRunning
	}
}

func valueMapField(update map[string]any, key string) any {
	if value, ok := update[key]; ok {
		return value
	}
	return nil
}

func (r *AgentRuntime) persistToolCall(ctx context.Context, sessionID string, update map[string]any) {
	acpIDPtr := toolCallID(update)
	title := toolCallTitle(update)
	kind := toolCallKind(update)
	statusValue := normalizedToolStatus(update)
	summary := toolSummary(update)
	call, err := r.storage.UpsertToolCall(ctx, sessionID, acpIDPtr, kind, title, summary, statusValue, update, valueMapField(update, "output"))
	if err != nil {
		return
	}
	r.events.Publish(map[string]any{"type": "timeline_item_upsert", "item": toolCallTimelineItem(call)})
	if artifactKind, ok := reviewArtifactKindFromUpdate(update); ok {
		result, err := r.storage.UpsertReviewArtifact(ctx, sessionID, acpIDPtr, artifactKind, title, summary, update, "acp")
		if err == nil && result.Created {
			r.events.Publish(map[string]any{"type": "review_artifact", "artifact": reviewArtifactSummaryFromArtifact(result.Artifact)})
		}
	}
	displayImageCall := looksLikeDisplayImageCall(update)
	if displayImageCall {
		r.persistDisplayImageFromToolUpdate(ctx, sessionID, update)
	}
	if !displayImageCall {
		if text := textFromAny(update["content"]); text != "" {
			r.persistImageArtifactsFromText(ctx, sessionID, acpIDPtr, text)
		} else if text := textFromAny(update["output"]); text != "" {
			r.persistImageArtifactsFromText(ctx, sessionID, acpIDPtr, text)
		}
	}
}

func toolSummary(update map[string]any) string {
	updateType, _ := update["sessionUpdate"].(string)
	if updateType == "" {
		updateType = "tool_call"
	}
	status, _ := update["status"].(string)
	if status == "" {
		status = "updated"
	}
	kind := toolCallKind(update)
	if kind == "unknown" {
		kind = updateType
	}
	content := textFromAny(update["content"])
	if content == "" {
		content = textFromAny(update["output"])
	}
	if strings.TrimSpace(content) != "" {
		return fmt.Sprintf("%s %s: %s", kind, status, summarizeText(content, ""))
	}
	return fmt.Sprintf("%s %s", kind, status)
}

func reviewArtifactKindFromUpdate(update map[string]any) (string, bool) {
	kind := reviewKindForUpdate(update)
	if kind == "diff" || kind == "markdown" {
		return kind, true
	}
	if hasNonemptyReviewContent(update["content"]) || hasNonemptyReviewContent(update["output"]) {
		return kind, true
	}
	return "", false
}

func reviewKindForUpdate(update map[string]any) string {
	explicit := strings.ToLower(firstStringValue(update, "kind", "type"))
	switch {
	case strings.Contains(explicit, "diff"):
		return "diff"
	case strings.Contains(explicit, "image"), strings.Contains(explicit, "display_image"):
		return "image"
	case strings.Contains(explicit, "markdown"):
		return "markdown"
	case strings.Contains(explicit, "terminal"), strings.Contains(explicit, "command"), strings.Contains(explicit, "execute"):
		return "terminal"
	}
	if updateType, _ := update["sessionUpdate"].(string); strings.Contains(updateType, "tool_call") {
		return "tool_call"
	}
	return "generic"
}

func hasNonemptyReviewContent(value any) bool {
	if text := textFromAny(value); text != "" {
		return true
	}
	switch typed := value.(type) {
	case nil:
		return false
	case string:
		return strings.TrimSpace(typed) != ""
	case []any:
		return len(typed) > 0
	case map[string]any:
		return len(typed) > 0
	default:
		return true
	}
}

func textFromAny(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		if strings.TrimSpace(typed) == "" {
			return ""
		}
		return typed
	case []any:
		var parts []string
		for _, item := range typed {
			if text := textFromAny(item); text != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, "\n")
	case map[string]any:
		if typed["type"] == "text" {
			if text, ok := typed["text"].(string); ok && strings.TrimSpace(text) != "" {
				return text
			}
		}
		for _, key := range []string{"text", "content", "output", "diff", "markdown"} {
			if text := textFromAny(typed[key]); text != "" {
				return text
			}
		}
	}
	return ""
}

func contentBlocksFromAny(value any) []MessageContentBlock {
	switch typed := value.(type) {
	case nil:
		return nil
	case string:
		if strings.TrimSpace(typed) == "" {
			return nil
		}
		return []MessageContentBlock{textBlock(typed)}
	case []any:
		var blocks []MessageContentBlock
		for _, item := range typed {
			blocks = append(blocks, contentBlocksFromAny(item)...)
		}
		return blocks
	case map[string]any:
		switch typed["type"] {
		case "text":
			if text, ok := typed["text"].(string); ok && strings.TrimSpace(text) != "" {
				return []MessageContentBlock{textBlock(text)}
			}
			return nil
		case "image":
			data, dataOK := typed["data"].(string)
			mimeType, mimeOK := typed["mimeType"].(string)
			if !dataOK || !mimeOK || data == "" || mimeType == "" {
				return nil
			}
			block := MessageContentBlock{Type: "image", MimeType: mimeType, Data: data}
			if uri, ok := typed["uri"].(string); ok {
				block.URI = &uri
			}
			if name, ok := typed["name"].(string); ok {
				block.Name = &name
			}
			return []MessageContentBlock{block}
		default:
			if text := textFromAny(typed); text != "" {
				return []MessageContentBlock{textBlock(text)}
			}
		}
	}
	return nil
}

func selectedPermissionResponse(optionID string) map[string]any {
	return map[string]any{"outcome": map[string]any{"outcome": "selected", "optionId": optionID}}
}

func cancelledPermissionResponse() map[string]any {
	return map[string]any{"outcome": map[string]any{"outcome": "cancelled"}}
}

func (r *AgentRuntime) handlePermissionRequest(id json.RawMessage, params json.RawMessage) {
	requestID := idKey(id)
	rawRequestID := cloneRawMessage(id)
	var payload struct {
		SessionID string             `json:"sessionId"`
		ToolCall  map[string]any     `json:"toolCall"`
		Options   []PermissionOption `json:"options"`
	}
	if err := json.Unmarshal(params, &payload); err != nil {
		return
	}
	if _, ok := r.restoreContext(payload.SessionID); ok {
		_ = r.sendRawResult(rawRequestID, cancelledPermissionResponse())
		return
	}
	localSessionID := r.localSessionID(payload.SessionID)
	if localSessionID == "" {
		_ = r.sendRawResult(rawRequestID, cancelledPermissionResponse())
		return
	}
	r.flushAssistantBuffer(context.Background(), payload.SessionID, localSessionID, false, false, true)
	toolCallIDPtr := toolCallID(payload.ToolCall)
	permission, err := r.storage.CreatePermissionRequest(context.Background(), NewPermissionRequest{
		SessionID:    localSessionID,
		ACPSessionID: payload.SessionID,
		ACPRequestID: requestID,
		ToolCallID:   toolCallIDPtr,
		Title:        permissionToolCallTitle(payload.ToolCall),
		Kind:         toolCallKind(payload.ToolCall),
		ToolCall:     payload.ToolCall,
		Options:      payload.Options,
	})
	if err != nil {
		_ = r.sendRawResult(rawRequestID, cancelledPermissionResponse())
		return
	}
	r.mu.Lock()
	r.permissionMap[permission.ID] = rawRequestID
	r.mu.Unlock()
	r.events.Publish(map[string]any{"type": "session_status", "sessionId": localSessionID, "status": statusWaitingApproval})
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
	var output any
	if call.OutputJSON != nil {
		output = parseJSONValue(*call.OutputJSON)
	}
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
		"output":            output,
		"reviewArtifactIds": []string{},
	}
}
