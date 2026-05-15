package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gorilla/websocket"
)

type Server struct {
	config  Config
	storage *Storage
	agents  *AgentRuntimeManager
	auth    *AuthService
	events  *EventHub
	mux     *http.ServeMux
}

const (
	maxPromptImageBytes      = 5 * 1024 * 1024
	maxPromptImageTotalBytes = 10 * 1024 * 1024
)

var supportedPromptImageMimeTypes = map[string]struct{}{
	"image/png":  {},
	"image/jpeg": {},
	"image/webp": {},
	"image/gif":  {},
}

func newServer(config Config, storage *Storage, agents *AgentRuntimeManager, auth *AuthService, events *EventHub) *Server {
	server := &Server{config: config, storage: storage, agents: agents, auth: auth, events: events, mux: http.NewServeMux()}
	server.routes()
	return server
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/auth/status", s.handleAuthStatus)
	s.mux.HandleFunc("POST /api/auth/pair", s.handlePair)
	s.mux.HandleFunc("GET /api/app-state", s.handleAppState)
	s.mux.HandleFunc("GET /api/skills", s.handleSkills)
	s.mux.HandleFunc("GET /api/inbox", s.handleInbox)
	s.mux.HandleFunc("GET /api/workspaces", s.handleWorkspaces)
	s.mux.HandleFunc("POST /api/workspaces", s.handleCreateWorkspace)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceId}/sessions", s.handleWorkspaceSessions)
	s.mux.HandleFunc("POST /api/workspaces/{workspaceId}/sessions", s.handleCreateSession)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceId}/agents/{agentId}/sessions", s.handleWorkspaceAgentSessions)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceId}/agents/{agentId}/prompt-templates", s.handlePromptTemplates)
	s.mux.HandleFunc("POST /api/workspaces/{workspaceId}/agents/{agentId}/prompt-templates", s.handleCreatePromptTemplate)
	s.mux.HandleFunc("PATCH /api/prompt-templates/{templateId}", s.handleUpdatePromptTemplate)
	s.mux.HandleFunc("DELETE /api/prompt-templates/{templateId}", s.handleDeletePromptTemplate)
	s.mux.HandleFunc("POST /api/prompt-templates/{templateId}/use", s.handleUsePromptTemplate)
	s.mux.HandleFunc("GET /api/sessions", s.handleSessions)
	s.mux.HandleFunc("GET /api/sessions/{sessionId}", s.handleSession)
	s.mux.HandleFunc("POST /api/sessions/{sessionId}/restore", s.handleRestoreSession)
	s.mux.HandleFunc("POST /api/sessions/{sessionId}/config-options/{configId}", s.handleSetSessionConfig)
	s.mux.HandleFunc("GET /api/sessions/{sessionId}/review-artifacts", s.handleReviewArtifacts)
	s.mux.HandleFunc("GET /api/sessions/{sessionId}/review-artifacts/{artifactId}", s.handleReviewArtifact)
	s.mux.HandleFunc("GET /api/sessions/{sessionId}/review-diff", s.handleReviewDiff)
	s.mux.HandleFunc("POST /api/sessions/{sessionId}/prompt", s.handlePrompt)
	s.mux.HandleFunc("POST /api/sessions/{sessionId}/cancel", s.handleCancel)
	s.mux.HandleFunc("POST /api/permission-requests/{permissionId}/resolve", s.handleResolvePermission)
	s.mux.HandleFunc("GET /api/ws", s.handleWebSocket)
	s.mux.HandleFunc("/", s.handleFrontend)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("access-control-allow-origin", "*")
	w.Header().Set("access-control-allow-headers", "content-type")
	w.Header().Set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/") && !strings.HasPrefix(r.URL.Path, "/api/auth/") {
		if err := s.auth.requireAccess(r); err != nil {
			writeError(w, err)
			return
		}
	}
	s.mux.ServeHTTP(w, r)
}

func (s *Server) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.auth.status(r))
}

func (s *Server) handlePair(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Token string `json:"token"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, err)
		return
	}
	status, err := s.auth.pair(w, r, payload.Token)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleAppState(w http.ResponseWriter, r *http.Request) {
	inbox, err := s.storage.ListInboxItems(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, AppData{Codex: s.agents.codexStatus(), Agents: s.agents.statuses(), Inbox: nonNilSlice(inbox)})
}

func (s *Server) handleInbox(w http.ResponseWriter, r *http.Request) {
	items, err := s.storage.ListInboxItems(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, nonNilSlice(items))
}

func (s *Server) handleSkills(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, discoverSkills())
}

func (s *Server) handleWorkspaces(w http.ResponseWriter, r *http.Request) {
	workspaces, err := s.storage.ListWorkspaces(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, nonNilSlice(workspaces))
}

func (s *Server) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Path string  `json:"path"`
		Name *string `json:"name"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, err)
		return
	}
	path := strings.TrimSpace(payload.Path)
	if path == "" {
		writeError(w, badRequest("Workspace path is required"))
		return
	}
	if stat, err := os.Stat(path); err != nil || !stat.IsDir() {
		writeError(w, badRequest("Workspace path must be an accessible directory"))
		return
	}
	workspace, err := s.storage.CreateWorkspace(r.Context(), path, payload.Name)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, workspace)
}

func (s *Server) handleWorkspaceSessions(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.PathValue("workspaceId")
	if _, err := s.storage.GetWorkspace(r.Context(), workspaceID); err != nil {
		writeError(w, notFound("Workspace not found"))
		return
	}
	items, err := s.storage.ListSessionItems(r.Context(), &workspaceID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, nonNilSlice(s.applySessionListContinuity(items)))
}

func (s *Server) handleWorkspaceAgentSessions(w http.ResponseWriter, r *http.Request) {
	workspace, err := s.storage.GetWorkspace(r.Context(), r.PathValue("workspaceId"))
	if err != nil {
		writeError(w, notFound("Workspace not found"))
		return
	}
	agentID, err := s.agents.resolveAgentID(r.PathValue("agentId"))
	if err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	permissionMode, err := s.agents.resolvePermissionMode(agentID, permissionManual)
	if err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	// Until route/query launch controls exist, list sync uses the selected agent's default manual profile.
	profile, err := s.agents.resolveLaunchProfile(agentID, permissionMode, nil)
	if err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	items, err := s.agents.SyncWorkspaceAgentSessions(r.Context(), workspace, agentID, profile)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, nonNilSlice(s.applySessionListContinuity(items)))
}

func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	items, err := s.storage.ListSessionItems(r.Context(), nil)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, nonNilSlice(s.applySessionListContinuity(items)))
}

func (s *Server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.PathValue("workspaceId")
	workspace, err := s.storage.GetWorkspace(r.Context(), workspaceID)
	if err != nil {
		writeError(w, notFound("Workspace not found"))
		return
	}
	var payload struct {
		AgentID             string            `json:"agentId"`
		PermissionMode      string            `json:"permissionMode"`
		LaunchControlValues map[string]string `json:"launchControlValues"`
	}
	if r.Body != nil && r.ContentLength != 0 {
		if err := decodeJSON(r, &payload); err != nil {
			writeError(w, err)
			return
		}
	}
	agentID, err := s.agents.resolveAgentID(payload.AgentID)
	if err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	permissionMode, err := s.agents.resolvePermissionMode(agentID, payload.PermissionMode)
	if err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	profile, err := s.agents.resolveLaunchProfile(agentID, permissionMode, payload.LaunchControlValues)
	if err != nil {
		writeError(w, badRequest(err.Error()))
		return
	}
	runtime, err := s.agents.runtimeForLaunchProfile(r.Context(), agentID, profile, true)
	if err != nil {
		writeError(w, unavailable(err.Error()))
		return
	}
	outcome, err := runtime.NewSession(r.Context(), nativePathString(workspace.Path))
	if err != nil {
		writeError(w, unavailable(err.Error()))
		return
	}
	sessionID := outcome.SessionID
	session, err := s.storage.CreateSession(r.Context(), workspace.ID, agentID, runtime.agent.Title, &sessionID, profile.PermissionMode, profile, outcome.ConfigOptions)
	if err != nil {
		writeError(w, err)
		return
	}
	runtime.RegisterSession(outcome.SessionID, session.ID)
	detail, err := s.sessionDetail(r.Context(), session.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	s.events.Publish(map[string]any{
		"type":        "session_list_changed",
		"workspaceId": session.WorkspaceID,
		"agentId":     session.AgentID,
		"count":       1,
	})
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	detail, err := s.sessionDetail(r.Context(), r.PathValue("sessionId"))
	if err != nil {
		writeError(w, notFound("Session not found"))
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleRestoreSession(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionId")
	session, err := s.storage.GetSession(r.Context(), sessionID)
	if err != nil {
		writeError(w, notFound("Session not found"))
		return
	}
	workspace, _ := s.storage.GetWorkspace(r.Context(), session.WorkspaceID)
	runtime, err := s.agents.runtimeForSession(r.Context(), session, true)
	if err != nil {
		writeError(w, unavailable(err.Error()))
		return
	}
	continuity := s.sessionContinuity(r.Context(), session)
	if continuity.Continuable {
		detail, _ := s.storage.SessionDetail(r.Context(), sessionID, continuity)
		writeJSON(w, http.StatusOK, detail)
		return
	}
	if !continuity.Restorable {
		writeError(w, conflict(valueOr(continuity.Reason, viewOnlyReason(session.AgentName))))
		return
	}
	externalID := session.ExternalSessionID
	if externalID == nil {
		externalID = session.ACPSessionID
	}
	if externalID == nil {
		writeError(w, conflict("Session is missing an agent session id."))
		return
	}
	_ = s.storage.MarkSessionRestoreStarted(r.Context(), sessionID)
	s.events.Publish(map[string]any{"type": "session_restore_started", "sessionId": sessionID})
	options, err := runtime.LoadSession(r.Context(), *externalID, sessionID, nativePathString(workspace.Path))
	if err != nil {
		message := "Failed to restore session: " + err.Error()
		_ = s.storage.MarkSessionRestoreFailed(r.Context(), sessionID, message)
		s.events.Publish(map[string]any{"type": "session_restore_failed", "sessionId": sessionID, "message": message})
		writeError(w, conflict(message))
		return
	}
	if options != nil {
		_, _ = s.storage.UpdateSessionConfigOptions(r.Context(), sessionID, options)
	}
	_ = s.storage.MarkSessionRestoreSucceeded(r.Context(), sessionID)
	s.events.Publish(map[string]any{"type": "session_restore_succeeded", "sessionId": sessionID})
	detail, _ := s.sessionDetail(r.Context(), sessionID)
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleSetSessionConfig(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionId")
	configID := strings.TrimSpace(r.PathValue("configId"))
	var payload struct {
		Value string `json:"value"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, err)
		return
	}
	value := strings.TrimSpace(payload.Value)
	if configID == "" || value == "" {
		writeError(w, badRequest("Configuration option id and value are required"))
		return
	}
	session, err := s.storage.GetSession(r.Context(), sessionID)
	if err != nil {
		writeError(w, notFound("Session not found"))
		return
	}
	if pending, _ := s.storage.PendingPermissionForSession(r.Context(), sessionID); pending != nil || session.Status == statusWaitingApproval {
		writeError(w, conflict("This session is waiting for approval. Resolve the pending approval before changing configuration."))
		return
	}
	if session.Status == statusRunning {
		writeError(w, conflict("This session is already running. Wait for it to finish before changing configuration."))
		return
	}
	continuity := s.sessionContinuity(r.Context(), session)
	if !continuity.Continuable {
		writeError(w, conflict(valueOr(continuity.Reason, viewOnlyReason(session.AgentName))))
		return
	}
	if session.ACPSessionID == nil {
		writeError(w, conflict("Session is missing an ACP session id"))
		return
	}
	runtime, err := s.agents.runtimeForSession(r.Context(), session, true)
	if err != nil {
		writeError(w, unavailable(err.Error()))
		return
	}
	state, err := runtime.SetConfigOption(r.Context(), *session.ACPSessionID, configID, value)
	if err != nil {
		writeError(w, conflict(err.Error()))
		return
	}
	updated, err := s.storage.UpdateSessionConfigOptions(r.Context(), sessionID, state.ConfigOptions)
	if err != nil {
		writeError(w, err)
		return
	}
	s.events.Publish(map[string]any{"type": "session_config_updated", "sessionId": sessionID, "configOptions": updated.ConfigOptions, "currentModel": updated.CurrentModel})
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handlePrompt(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionId")
	var payload struct {
		Prompt        string                `json:"prompt"`
		ContentBlocks []MessageContentBlock `json:"contentBlocks"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, err)
		return
	}
	blocks, err := promptBlocksFromRequest(payload.Prompt, payload.ContentBlocks)
	if err != nil {
		writeError(w, err)
		return
	}
	if len(blocks) == 0 {
		writeError(w, badRequest("Prompt or image attachment is required"))
		return
	}
	session, err := s.storage.GetSession(r.Context(), sessionID)
	if err != nil {
		writeError(w, notFound("Session not found"))
		return
	}
	continuity := s.sessionContinuity(r.Context(), session)
	if !continuity.Continuable {
		writeError(w, conflict(valueOr(continuity.Reason, viewOnlyReason(session.AgentName))))
		return
	}
	if session.ACPSessionID == nil {
		writeError(w, conflict("Session is missing an ACP session id"))
		return
	}
	runtime, err := s.agents.runtimeForSession(r.Context(), session, true)
	if err != nil {
		writeError(w, unavailable(err.Error()))
		return
	}
	if hasImageBlocks(blocks) && !runtime.promptCapabilities().Image {
		writeError(w, conflict("This agent does not support image prompt attachments."))
		return
	}
	prompt := textFallbackFromBlocks(blocks)
	pending, _ := s.storage.PendingPermissionForSession(r.Context(), sessionID)
	shouldQueue := pending != nil || session.Status == statusWaitingApproval || session.Status == statusRunning || session.Status == statusStopping
	messageStatus := statusIdle
	if shouldQueue {
		messageStatus = "queued"
	}
	message, err := s.storage.CreateMessage(r.Context(), sessionID, roleUser, prompt, blocks, messageStatus)
	if err != nil {
		writeError(w, err)
		return
	}
	s.events.Publish(map[string]any{"type": "timeline_item_upsert", "item": messageTimelineItem(message)})
	if shouldQueue {
		queued, err := s.storage.CreateQueuedPrompt(r.Context(), sessionID, message.ID, prompt, blocks)
		if err != nil {
			writeError(w, err)
			return
		}
		queuedPrompts, _ := s.storage.ListQueuedPrompts(r.Context(), sessionID)
		s.events.Publish(map[string]any{"type": "queued_prompts_updated", "sessionId": sessionID, "queuedPrompts": nonNilSlice(queuedPrompts)})
		active, _ := s.storage.ActiveTurnForSession(r.Context(), sessionID)
		writeJSON(w, http.StatusOK, map[string]any{"message": message, "queuedPrompt": queued, "queuedPrompts": nonNilSlice(queuedPrompts), "activeTurn": active})
		return
	}
	active, err := s.storage.StartActiveTurn(r.Context(), sessionID)
	if err != nil {
		writeError(w, err)
		return
	}
	s.events.Publish(map[string]any{"type": "session_status", "sessionId": sessionID, "status": statusRunning})
	s.events.Publish(map[string]any{"type": "active_turn_updated", "sessionId": sessionID, "status": statusRunning, "activeTurn": active})
	go s.runPromptTurn(context.Background(), runtime, sessionID, *session.ACPSessionID, blocks)
	queuedPrompts, _ := s.storage.ListQueuedPrompts(r.Context(), sessionID)
	writeJSON(w, http.StatusOK, map[string]any{"message": message, "queuedPrompt": nil, "queuedPrompts": nonNilSlice(queuedPrompts), "activeTurn": active})
}

func (s *Server) runPromptTurn(ctx context.Context, runtime *AgentRuntime, sessionID, acpSessionID string, blocks []MessageContentBlock) {
	err := runtime.Prompt(ctx, sessionID, acpSessionID, blocks)
	nextStatus := statusIdle
	if err != nil {
		nextStatus = statusFailed
		s.events.Publish(map[string]any{"type": "error", "message": err.Error()})
	}
	if err == nil {
		if pending, _ := s.storage.PendingPermissionForSession(ctx, sessionID); pending != nil {
			s.events.Publish(map[string]any{"type": "session_status", "sessionId": sessionID, "status": statusWaitingApproval})
			return
		}
	}
	_ = s.storage.FinishActiveTurn(ctx, sessionID, nextStatus)
	s.events.Publish(map[string]any{"type": "session_status", "sessionId": sessionID, "status": nextStatus})
	s.events.Publish(map[string]any{"type": "active_turn_updated", "sessionId": sessionID, "status": nextStatus, "activeTurn": nil})
	if err == nil {
		s.drainQueuedPrompts(ctx, runtime, sessionID, acpSessionID)
	}
}

func (s *Server) drainQueuedPrompts(ctx context.Context, runtime *AgentRuntime, sessionID, acpSessionID string) {
	for {
		next, _ := s.storage.NextQueuedPrompt(ctx, sessionID)
		if next == nil {
			queued, _ := s.storage.ListQueuedPrompts(ctx, sessionID)
			s.events.Publish(map[string]any{"type": "queued_prompts_updated", "sessionId": sessionID, "queuedPrompts": nonNilSlice(queued)})
			return
		}
		_ = s.storage.MarkQueuedPromptSubmitted(ctx, next.ID)
		active, _ := s.storage.StartActiveTurn(ctx, sessionID)
		s.events.Publish(map[string]any{"type": "session_status", "sessionId": sessionID, "status": statusRunning})
		s.events.Publish(map[string]any{"type": "active_turn_updated", "sessionId": sessionID, "status": statusRunning, "activeTurn": active})
		err := runtime.Prompt(ctx, sessionID, acpSessionID, next.ContentBlocks)
		nextStatus := statusIdle
		if err != nil {
			nextStatus = statusFailed
		}
		if err == nil {
			if pending, _ := s.storage.PendingPermissionForSession(ctx, sessionID); pending != nil {
				s.events.Publish(map[string]any{"type": "session_status", "sessionId": sessionID, "status": statusWaitingApproval})
				return
			}
		}
		_ = s.storage.FinishActiveTurn(ctx, sessionID, nextStatus)
		s.events.Publish(map[string]any{"type": "session_status", "sessionId": sessionID, "status": nextStatus})
		s.events.Publish(map[string]any{"type": "active_turn_updated", "sessionId": sessionID, "status": nextStatus, "activeTurn": nil})
		if err != nil {
			return
		}
	}
}

func promptBlocksFromRequest(prompt string, contentBlocks []MessageContentBlock) ([]MessageContentBlock, error) {
	var blocks []MessageContentBlock
	text := strings.TrimSpace(prompt)
	if text != "" {
		blocks = append(blocks, textBlock(text))
	}
	blocks = append(blocks, contentBlocks...)
	if err := validatePromptBlocks(blocks); err != nil {
		return nil, err
	}
	return blocks, nil
}

func validatePromptBlocks(blocks []MessageContentBlock) error {
	totalImageBytes := 0
	for _, block := range blocks {
		if block.Type != "image" {
			continue
		}
		if _, ok := supportedPromptImageMimeTypes[block.MimeType]; !ok {
			return badRequest(fmt.Sprintf("Unsupported image type `%s`.", block.MimeType))
		}
		estimatedBytes := (len(block.Data) * 3) / 4
		if estimatedBytes > maxPromptImageBytes {
			return badRequest(fmt.Sprintf("Image attachments must be %d MB or smaller.", maxPromptImageBytes/1024/1024))
		}
		totalImageBytes += estimatedBytes
	}
	if totalImageBytes > maxPromptImageTotalBytes {
		return badRequest(fmt.Sprintf("Image attachments must be %d MB or smaller in total.", maxPromptImageTotalBytes/1024/1024))
	}
	return nil
}

func hasImageBlocks(blocks []MessageContentBlock) bool {
	for _, block := range blocks {
		if block.Type == "image" {
			return true
		}
	}
	return false
}

func (s *Server) handleCancel(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionId")
	session, err := s.storage.GetSession(r.Context(), sessionID)
	if err != nil {
		writeError(w, notFound("Session not found"))
		return
	}
	pending, _ := s.storage.PendingPermissionForSession(r.Context(), sessionID)
	if pending == nil && session.Status != statusRunning && session.Status != statusWaitingApproval && session.Status != statusStopping {
		writeError(w, conflict("This session does not have active work to stop."))
		return
	}
	runtime, err := s.agents.runtimeForSession(r.Context(), session, false)
	if err == nil {
		_ = runtime.CancelPendingPermissionsForSession(r.Context(), sessionID)
		if session.ACPSessionID != nil {
			_ = runtime.StopSessionTurn(r.Context(), *session.ACPSessionID)
		}
	}
	_ = s.storage.FinishActiveTurn(r.Context(), sessionID, statusStopped)
	detail, _ := s.sessionDetail(r.Context(), sessionID)
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleResolvePermission(w http.ResponseWriter, r *http.Request) {
	permissionID := r.PathValue("permissionId")
	var payload struct {
		OptionID string `json:"optionId"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, err)
		return
	}
	if strings.TrimSpace(payload.OptionID) == "" {
		writeError(w, badRequest("Permission option id is required"))
		return
	}
	permission, err := s.storage.GetPermissionRequest(r.Context(), permissionID)
	if err != nil {
		writeError(w, notFound("Permission request not found"))
		return
	}
	session, err := s.storage.GetSession(r.Context(), permission.SessionID)
	if err != nil {
		writeError(w, notFound("Session not found"))
		return
	}
	runtime, err := s.agents.runtimeForSession(r.Context(), session, false)
	if err != nil {
		writeError(w, unavailable(err.Error()))
		return
	}
	resolved, err := runtime.ResolvePermission(r.Context(), permissionID, payload.OptionID)
	if err != nil {
		writeError(w, conflict(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, resolved)
}

func (s *Server) handleReviewArtifacts(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionId")
	if _, err := s.storage.GetSession(r.Context(), sessionID); err != nil {
		writeError(w, notFound("Session not found"))
		return
	}
	artifacts, err := s.storage.ListReviewArtifactSummaries(r.Context(), sessionID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, nonNilSlice(artifacts))
}

func (s *Server) handleReviewArtifact(w http.ResponseWriter, r *http.Request) {
	artifact, err := s.storage.GetReviewArtifactForSession(r.Context(), r.PathValue("sessionId"), r.PathValue("artifactId"))
	if err != nil {
		writeError(w, notFound("Review artifact not found"))
		return
	}
	writeJSON(w, http.StatusOK, artifact)
}

func (s *Server) handleReviewDiff(w http.ResponseWriter, r *http.Request) {
	session, err := s.storage.GetSession(r.Context(), r.PathValue("sessionId"))
	if err != nil {
		writeError(w, notFound("Session not found"))
		return
	}
	workspace, _ := s.storage.GetWorkspace(r.Context(), session.WorkspaceID)
	cmd := exec.CommandContext(r.Context(), "git", "diff", "--no-ext-diff")
	cmd.Dir = workspace.Path
	output, err := cmd.Output()
	if err != nil {
		writeError(w, unavailable("git diff failed for this workspace"))
		return
	}
	diff := string(output)
	artifact := ReviewArtifact{
		ID:        "diff-fallback-" + session.ID,
		SessionID: session.ID,
		Kind:      "diff",
		Title:     "Workspace diff",
		Summary:   summarizeDiff(diff),
		Payload:   map[string]any{"format": "unified_diff", "diff": diff, "source": "git diff --no-ext-diff"},
		Source:    "git_diff",
		CreatedAt: nowString(),
	}
	writeJSON(w, http.StatusOK, map[string]any{"artifact": artifact})
}

func summarizeDiff(diff string) string {
	if strings.TrimSpace(diff) == "" {
		return "No workspace changes."
	}
	lines := strings.Count(diff, "\n")
	return fmt.Sprintf("Workspace diff with %d lines.", lines)
}

func (s *Server) handlePromptTemplates(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.PathValue("workspaceId")
	agentID := r.PathValue("agentId")
	if err := s.validatePromptTemplateScope(r.Context(), workspaceID, agentID); err != nil {
		writeError(w, err)
		return
	}
	templates, err := s.storage.ListPromptTemplates(r.Context(), workspaceID, agentID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, nonNilSlice(templates))
}

func (s *Server) handleCreatePromptTemplate(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.PathValue("workspaceId")
	agentID := r.PathValue("agentId")
	if err := s.validatePromptTemplateScope(r.Context(), workspaceID, agentID); err != nil {
		writeError(w, err)
		return
	}
	var payload struct {
		Title    string   `json:"title"`
		Body     string   `json:"body"`
		Tags     []string `json:"tags"`
		Position *int64   `json:"position"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, err)
		return
	}
	title, body := strings.TrimSpace(payload.Title), strings.TrimSpace(payload.Body)
	if title == "" || body == "" {
		writeError(w, badRequest("Prompt template title and body are required."))
		return
	}
	template, err := s.storage.CreatePromptTemplate(r.Context(), workspaceID, agentID, title, body, payload.Tags, payload.Position)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, template)
}

func (s *Server) handleUpdatePromptTemplate(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Title    *string  `json:"title"`
		Body     *string  `json:"body"`
		Tags     []string `json:"tags"`
		Position *int64   `json:"position"`
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, badRequest("Invalid JSON request body"))
		return
	}
	if len(body) > 0 {
		if err := json.Unmarshal(body, &payload); err != nil {
			writeError(w, badRequest("Invalid JSON request body"))
			return
		}
	}
	var fields map[string]json.RawMessage
	_ = json.Unmarshal(body, &fields)
	_, tagsSet := fields["tags"]
	if payload.Title != nil {
		trimmed := strings.TrimSpace(*payload.Title)
		payload.Title = &trimmed
	}
	if payload.Body != nil {
		trimmed := strings.TrimSpace(*payload.Body)
		payload.Body = &trimmed
	}
	template, err := s.storage.UpdatePromptTemplate(r.Context(), r.PathValue("templateId"), payload.Title, payload.Body, payload.Tags, tagsSet, payload.Position)
	if err != nil {
		writeError(w, notFound("Prompt template not found"))
		return
	}
	writeJSON(w, http.StatusOK, template)
}

func (s *Server) handleDeletePromptTemplate(w http.ResponseWriter, r *http.Request) {
	template, err := s.storage.ArchivePromptTemplate(r.Context(), r.PathValue("templateId"))
	if err != nil {
		writeError(w, notFound("Prompt template not found"))
		return
	}
	writeJSON(w, http.StatusOK, template)
}

func (s *Server) handleUsePromptTemplate(w http.ResponseWriter, r *http.Request) {
	template, err := s.storage.RecordPromptTemplateUse(r.Context(), r.PathValue("templateId"))
	if err != nil {
		writeError(w, notFound("Prompt template not found"))
		return
	}
	writeJSON(w, http.StatusOK, template)
}

func (s *Server) validatePromptTemplateScope(ctx context.Context, workspaceID, agentID string) error {
	if _, err := s.storage.GetWorkspace(ctx, workspaceID); err != nil {
		return notFound("Workspace not found")
	}
	if _, err := s.agents.resolveAgentID(agentID); err != nil {
		return badRequest(err.Error())
	}
	return nil
}

func (s *Server) sessionDetail(ctx context.Context, sessionID string) (SessionDetail, error) {
	session, err := s.storage.GetSession(ctx, sessionID)
	if err != nil {
		return SessionDetail{}, err
	}
	continuity := s.sessionContinuity(ctx, session)
	return s.storage.SessionDetail(ctx, sessionID, continuity)
}

func (s *Server) sessionContinuity(ctx context.Context, session Session) SessionContinuity {
	row, err := s.storage.SessionContinuityRow(ctx, session.ID)
	if err != nil {
		return viewOnlyContinuity(viewOnlyReason(session.AgentName))
	}
	runtime, err := s.agents.runtimeForSession(ctx, session, false)
	if err != nil {
		return viewOnlyContinuity(viewOnlyReason(session.AgentName) + " " + err.Error())
	}
	status := runtime.status()
	if status.State != "ready" {
		if status.State == "idle" && firstStringPtr(session.ExternalSessionID, session.ACPSessionID) != nil {
			return SessionContinuity{State: continuityLoadable, Restorable: true, Reason: stringPtr("Restore this agent session to continue.")}
		}
		return viewOnlyContinuity(agentUnavailableReason(session.AgentName, status))
	}
	if runtime.hasRegisteredSession(session.ACPSessionID) {
		if row.State == continuityRestored {
			return row
		}
		return liveContinuity()
	}
	runtimeContinuity := runtime.runtimeSessionContinuity(session.ACPSessionID, firstStringPtr(session.ExternalSessionID, session.ACPSessionID))
	switch row.State {
	case continuityRestoring, continuityRestoreFailed:
		if row.State == continuityRestoreFailed && runtimeContinuity.Restorable {
			row.Restorable = true
		}
		return row
	default:
		return runtimeContinuity
	}
}

func (s *Server) applySessionListContinuity(items []SessionListItem) []SessionListItem {
	for i := range items {
		continuity := s.sessionContinuity(context.Background(), items[i].Session)
		items[i].Continuity = continuity
		items[i].Continuable = continuity.Continuable
		if !continuity.Continuable {
			items[i].ViewOnlyReason = continuity.Reason
		}
	}
	return items
}

func valueOr(value *string, fallback string) string {
	if value == nil || *value == "" {
		return fallback
	}
	return *value
}

func firstStringPtr(values ...*string) *string {
	for _, value := range values {
		if value != nil && *value != "" {
			return value
		}
	}
	return nil
}

func viewOnlyReason(agentName string) string {
	return fmt.Sprintf("This session history is available for review, but the live %s runtime context is not available. Start a new session to continue working.", agentName)
}

func agentUnavailableReason(agentName string, status ConnectionStatus) string {
	suffix := ""
	if status.Message != nil && *status.Message != "" {
		suffix = ": " + *status.Message
	}
	return fmt.Sprintf("%s is %s%s. This session history is available for review, but the live %s runtime context is not available. Prompts are disabled until the agent runtime is ready.", agentName, status.State, suffix, agentName)
}

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	ch := s.events.Subscribe()
	defer s.events.Unsubscribe(ch)
	for event := range ch {
		if err := conn.WriteJSON(event); err != nil {
			return
		}
	}
}

func (s *Server) handleFrontend(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "API route not found"})
		return
	}
	if hasEmbeddedFrontend {
		s.handleEmbeddedFrontend(w, r)
		return
	}
	cleanPath := strings.TrimPrefix(filepath.Clean(r.URL.Path), string(filepath.Separator))
	if cleanPath == "." || cleanPath == "" {
		cleanPath = "index.html"
	}
	path := filepath.Join(s.config.FrontendDist, cleanPath)
	if stat, err := os.Stat(path); err == nil && !stat.IsDir() {
		if contentType := mime.TypeByExtension(filepath.Ext(path)); contentType != "" {
			w.Header().Set("content-type", contentType)
		}
		http.ServeFile(w, r, path)
		return
	}
	index := filepath.Join(s.config.FrontendDist, "index.html")
	if _, err := os.Stat(index); err == nil {
		w.Header().Set("content-type", "text/html; charset=utf-8")
		http.ServeFile(w, r, index)
		return
	}
	w.Header().Set("content-type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte("<!doctype html><title>ACP Web UI</title><p>Frontend build not found. Run npm run build in frontend.</p>"))
}

func (s *Server) handleEmbeddedFrontend(w http.ResponseWriter, r *http.Request) {
	sub, err := fs.Sub(embeddedFrontend, "frontend/dist")
	if err != nil {
		writeError(w, err)
		return
	}
	cleanPath := strings.TrimPrefix(filepath.ToSlash(filepath.Clean(r.URL.Path)), "/")
	if cleanPath == "." || cleanPath == "" {
		cleanPath = "index.html"
	}
	if file, err := sub.Open(cleanPath); err == nil {
		_ = file.Close()
		if contentType := mime.TypeByExtension(filepath.Ext(cleanPath)); contentType != "" {
			w.Header().Set("content-type", contentType)
		}
		http.FileServer(http.FS(sub)).ServeHTTP(w, r)
		return
	}
	w.Header().Set("content-type", "text/html; charset=utf-8")
	http.ServeFileFS(w, r, sub, "index.html")
}

func discoverSkills() []SkillSummary {
	var roots []struct {
		path     string
		category string
	}
	if cwd, err := os.Getwd(); err == nil {
		roots = append(roots, struct {
			path     string
			category string
		}{filepath.Join(cwd, ".codex", "skills"), "workspace"})
	}
	if home := os.Getenv("CODEX_HOME"); home != "" {
		roots = append(roots, struct {
			path     string
			category string
		}{filepath.Join(home, "skills"), "codex_home"})
	}
	var skills []SkillSummary
	for _, root := range roots {
		_ = filepath.WalkDir(root.path, func(path string, d os.DirEntry, err error) error {
			if err != nil || !d.IsDir() {
				return nil
			}
			skillPath := filepath.Join(path, "SKILL.md")
			data, err := os.ReadFile(skillPath)
			if err != nil {
				return nil
			}
			name := filepath.Base(path)
			description := firstNonHeadingLine(string(data))
			skills = append(skills, SkillSummary{Name: name, Description: description, SourceCategory: root.category, Enabled: true})
			return nil
		})
	}
	counts := map[string]int{}
	for i := range skills {
		counts[skills[i].Name]++
		if counts[skills[i].Name] > 1 {
			value := counts[skills[i].Name]
			skills[i].DuplicateIndex = &value
		}
	}
	return skills
}

func firstNonHeadingLine(content string) *string {
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			return &line
		}
	}
	return nil
}
