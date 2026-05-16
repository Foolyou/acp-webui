package main

import (
	"encoding/json"
	"sync"
	"time"
)

const (
	defaultAgentID  = "codex"
	codexAgentID    = "codex"
	claudeAgentID   = "claude"
	opencodeAgentID = "opencode"

	permissionManual   = "manual"
	permissionFullAuto = "full_auto"
	permissionYolo     = "yolo"

	statusIdle            = "idle"
	statusRunning         = "running"
	statusStopping        = "stopping"
	statusStopped         = "stopped"
	statusWaitingApproval = "waiting_approval"
	statusFailed          = "failed"

	permissionPending   = "pending"
	permissionSelected  = "selected"
	permissionCancelled = "cancelled"
	permissionExpired   = "expired"

	queuedPromptQueued    = "queued"
	queuedPromptSubmitted = "submitted"
	queuedPromptFailed    = "failed"

	continuityLive          = "live"
	continuityLoadable      = "loadable"
	continuityResumable     = "resumable"
	continuityRestoring     = "restoring"
	continuityRestored      = "restored"
	continuityRestoreFailed = "restore_failed"
	continuityViewOnly      = "view_only"

	importSourceLocal          = "local"
	importSourceACPSessionList = "acp_session_list"

	roleUser      = "user"
	roleAssistant = "assistant"
	roleSystem    = "system"
)

type AgentControlValue struct {
	Value       string  `json:"value"`
	Label       string  `json:"label"`
	Description *string `json:"description"`
	RiskLevel   *string `json:"riskLevel"`
}

type AgentControl struct {
	ID           string              `json:"id"`
	Label        string              `json:"label"`
	Description  *string             `json:"description"`
	Category     string              `json:"category"`
	Scope        string              `json:"scope"`
	Type         string              `json:"type"`
	DefaultValue string              `json:"defaultValue"`
	Options      []AgentControlValue `json:"options"`
}

type AgentControlSelection struct {
	ID         string  `json:"id"`
	Label      string  `json:"label"`
	Value      string  `json:"value"`
	ValueLabel string  `json:"valueLabel"`
	Category   string  `json:"category"`
	Scope      string  `json:"scope"`
	RiskLevel  *string `json:"riskLevel"`
}

type AgentPermissionMode struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
	RiskLevel   string `json:"riskLevel"`
}

type AgentPermissionModeStatus struct {
	ID          string           `json:"id"`
	Label       string           `json:"label"`
	Description string           `json:"description"`
	RiskLevel   string           `json:"riskLevel"`
	Status      ConnectionStatus `json:"status"`
}

type AgentPromptCapabilities struct {
	Image           bool `json:"image"`
	Audio           bool `json:"audio"`
	EmbeddedContext bool `json:"embeddedContext"`
}

type AgentSessionCapabilities struct {
	LoadSession   bool `json:"loadSession"`
	ResumeSession bool `json:"resumeSession"`
	ListSessions  bool `json:"listSessions"`
	CloseSession  bool `json:"closeSession"`
}

type ConnectionStatus struct {
	State               string                   `json:"state"`
	Message             *string                  `json:"message"`
	AgentInfo           any                      `json:"agentInfo"`
	PromptCapabilities  AgentPromptCapabilities  `json:"promptCapabilities"`
	SessionCapabilities AgentSessionCapabilities `json:"sessionCapabilities"`
}

type AgentRuntimeStatus struct {
	ID              string                      `json:"id"`
	ProviderID      string                      `json:"providerId"`
	Title           string                      `json:"title"`
	Enabled         bool                        `json:"enabled"`
	Status          ConnectionStatus            `json:"status"`
	PermissionModes []AgentPermissionModeStatus `json:"permissionModes"`
	LaunchControls  []AgentControl              `json:"launchControls"`
}

type Workspace struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	CreatedAt string `json:"createdAt"`
}

type Session struct {
	ID                string  `json:"id"`
	WorkspaceID       string  `json:"workspaceId"`
	AgentID           string  `json:"agentId"`
	AgentName         string  `json:"agentName"`
	Title             *string `json:"title"`
	NativeTitle       *string `json:"nativeTitle"`
	NativeUpdatedAt   *string `json:"nativeUpdatedAt"`
	PermissionMode    string  `json:"permissionMode"`
	LaunchProfileID   string  `json:"launchProfileId"`
	LaunchProfileKey  string  `json:"launchProfileKey"`
	ACPSessionID      *string `json:"acpSessionId"`
	ExternalSessionID *string `json:"externalSessionId"`
	Status            string  `json:"status"`
	ImportSource      string  `json:"importSource"`
	ImportedAt        *string `json:"importedAt"`
	CreatedAt         string  `json:"createdAt"`
	UpdatedAt         string  `json:"updatedAt"`
}

type MessageContentBlock struct {
	Type     string  `json:"type"`
	Text     string  `json:"text,omitempty"`
	MimeType string  `json:"mimeType,omitempty"`
	Data     string  `json:"data,omitempty"`
	URI      *string `json:"uri,omitempty"`
	Name     *string `json:"name,omitempty"`
}

type Message struct {
	ID            string                `json:"id"`
	SessionID     string                `json:"sessionId"`
	Role          string                `json:"role"`
	Content       string                `json:"content"`
	ContentBlocks []MessageContentBlock `json:"contentBlocks"`
	Status        string                `json:"status"`
	CreatedAt     string                `json:"createdAt"`
}

type SessionContinuity struct {
	State              string  `json:"state"`
	Continuable        bool    `json:"continuable"`
	Restorable         bool    `json:"restorable"`
	Restoring          bool    `json:"restoring"`
	Reason             *string `json:"reason"`
	FailureMessage     *string `json:"failureMessage"`
	RestoreStartedAt   *string `json:"restoreStartedAt"`
	RestoreCompletedAt *string `json:"restoreCompletedAt"`
}

type SessionConfigOption struct {
	ID           string                     `json:"id"`
	Name         string                     `json:"name"`
	Description  *string                    `json:"description"`
	Category     *string                    `json:"category"`
	Type         string                     `json:"type"`
	CurrentValue *string                    `json:"currentValue"`
	Options      []SessionConfigOptionValue `json:"options"`
	Meta         map[string]any             `json:"_meta,omitempty"`
	Extra        map[string]any             `json:"-"`
}

type SessionConfigOptionValue struct {
	Value       string                     `json:"value,omitempty"`
	Name        string                     `json:"name"`
	Description *string                    `json:"description"`
	Options     []SessionConfigOptionValue `json:"options,omitempty"`
}

type SessionCurrentModel struct {
	ConfigID string  `json:"configId"`
	Value    string  `json:"value"`
	Name     *string `json:"name"`
}

type SessionConfigState struct {
	ConfigOptions []SessionConfigOption `json:"configOptions"`
	CurrentModel  *SessionCurrentModel  `json:"currentModel"`
}

type ReviewArtifactSummary struct {
	ID         string  `json:"id"`
	SessionID  string  `json:"sessionId"`
	ToolCallID *string `json:"toolCallId"`
	Kind       string  `json:"kind"`
	Title      string  `json:"title"`
	Summary    string  `json:"summary"`
	Preview    any     `json:"preview"`
	Source     string  `json:"source"`
	CreatedAt  string  `json:"createdAt"`
}

type ReviewArtifact struct {
	ID         string  `json:"id"`
	SessionID  string  `json:"sessionId"`
	ToolCallID *string `json:"toolCallId"`
	Kind       string  `json:"kind"`
	Title      string  `json:"title"`
	Summary    string  `json:"summary"`
	Payload    any     `json:"payload"`
	Source     string  `json:"source"`
	CreatedAt  string  `json:"createdAt"`
}

type ToolCall struct {
	ID                string   `json:"id"`
	SessionID         string   `json:"sessionId"`
	ACPToolCallID     *string  `json:"toolCallId"`
	Kind              string   `json:"toolKind"`
	Title             string   `json:"title"`
	Summary           string   `json:"summary"`
	Status            string   `json:"status"`
	InputJSON         string   `json:"-"`
	OutputJSON        *string  `json:"-"`
	CreatedAt         string   `json:"createdAt"`
	UpdatedAt         string   `json:"updatedAt"`
	CompletedAt       *string  `json:"completedAt"`
	ReviewArtifactIDs []string `json:"reviewArtifactIds"`
}

type PermissionOption struct {
	OptionID string `json:"optionId"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
}

type PermissionRequest struct {
	ID               string             `json:"id"`
	SessionID        string             `json:"sessionId"`
	ACPSessionID     string             `json:"acpSessionId"`
	ToolCallID       *string            `json:"toolCallId"`
	Title            string             `json:"title"`
	Kind             string             `json:"kind"`
	Status           string             `json:"status"`
	SelectedOptionID *string            `json:"selectedOptionId"`
	ToolCall         any                `json:"toolCall"`
	Options          []PermissionOption `json:"options"`
	FailureMessage   *string            `json:"failureMessage"`
	CreatedAt        string             `json:"createdAt"`
	ResolvedAt       *string            `json:"resolvedAt"`
}

type InboxItem struct {
	Session             Session           `json:"session"`
	Workspace           Workspace         `json:"workspace"`
	Permission          PermissionRequest `json:"permission"`
	QueuedApprovalCount int64             `json:"queuedApprovalCount"`
}

type SessionListPermission struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Kind      string `json:"kind"`
	CreatedAt string `json:"createdAt"`
}

type ActiveTurn struct {
	StartedAt       string  `json:"startedAt"`
	Status          string  `json:"status"`
	StopRequestedAt *string `json:"stopRequestedAt"`
}

type QueuedPrompt struct {
	ID            string                `json:"id"`
	SessionID     string                `json:"sessionId"`
	MessageID     string                `json:"messageId"`
	Prompt        string                `json:"prompt"`
	ContentBlocks []MessageContentBlock `json:"contentBlocks"`
	Status        string                `json:"status"`
	Position      int64                 `json:"position"`
	CreatedAt     string                `json:"createdAt"`
	SubmittedAt   *string               `json:"submittedAt"`
}

type PromptTemplate struct {
	ID          string   `json:"id"`
	WorkspaceID string   `json:"workspaceId"`
	AgentID     string   `json:"agentId"`
	Title       string   `json:"title"`
	Body        string   `json:"body"`
	Tags        []string `json:"tags"`
	Position    int64    `json:"position"`
	UseCount    int64    `json:"useCount"`
	LastUsedAt  *string  `json:"lastUsedAt"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
	ArchivedAt  *string  `json:"archivedAt"`
}

type TimelineItem map[string]any

type SessionDetail struct {
	Session              Session                 `json:"session"`
	Workspace            Workspace               `json:"workspace"`
	ConfigOptions        []SessionConfigOption   `json:"configOptions"`
	CurrentModel         *SessionCurrentModel    `json:"currentModel"`
	LaunchControlSummary []AgentControlSelection `json:"launchControlSummary"`
	Messages             []Message               `json:"messages"`
	QueuedPrompts        []QueuedPrompt          `json:"queuedPrompts"`
	ActiveTurn           *ActiveTurn             `json:"activeTurn"`
	ReviewArtifacts      []ReviewArtifactSummary `json:"reviewArtifacts"`
	Timeline             []TimelineItem          `json:"timeline"`
	PendingPermission    *PermissionRequest      `json:"pendingPermission"`
	PendingPermissions   []PermissionRequest     `json:"pendingPermissions"`
	PendingApprovalCount int64                   `json:"pendingApprovalCount"`
	QueuedApprovalCount  int64                   `json:"queuedApprovalCount"`
	FailureMessage       *string                 `json:"failureMessage"`
	Continuity           SessionContinuity       `json:"continuity"`
	Continuable          bool                    `json:"continuable"`
	ViewOnlyReason       *string                 `json:"viewOnlyReason"`
}

type SessionListItem struct {
	Session              Session                 `json:"session"`
	Workspace            Workspace               `json:"workspace"`
	LastActivityAt       string                  `json:"lastActivityAt"`
	CurrentModel         *SessionCurrentModel    `json:"currentModel"`
	LaunchControlSummary []AgentControlSelection `json:"launchControlSummary"`
	QueuedPromptCount    int64                   `json:"queuedPromptCount"`
	ActiveTurn           *ActiveTurn             `json:"activeTurn"`
	PendingPermission    *SessionListPermission  `json:"pendingPermission"`
	QueuedApprovalCount  int64                   `json:"queuedApprovalCount"`
	ReviewArtifactCount  int64                   `json:"reviewArtifactCount"`
	HasReviewArtifacts   bool                    `json:"hasReviewArtifacts"`
	Continuity           SessionContinuity       `json:"continuity"`
	Continuable          bool                    `json:"continuable"`
	ViewOnlyReason       *string                 `json:"viewOnlyReason"`
}

type SkillSummary struct {
	Name           string  `json:"name"`
	Description    *string `json:"description"`
	SourceCategory string  `json:"sourceCategory"`
	Enabled        bool    `json:"enabled"`
	DuplicateIndex *int    `json:"duplicateIndex"`
}

type AppData struct {
	Codex         ConnectionStatus        `json:"codex"`
	Agents        []AgentRuntimeStatus    `json:"agents"`
	Inbox         []InboxItem             `json:"inbox"`
	Transcription TranscriptionCapability `json:"transcription"`
}

type TranscriptionCapability struct {
	Available     bool  `json:"available"`
	MaxAudioBytes int64 `json:"maxAudioBytes"`
}

func stringPtr(value string) *string {
	return &value
}

var (
	nowStringMu       sync.Mutex
	nowStringClock    = func() time.Time { return time.Now().UTC() }
	lastNowStringTime time.Time
)

func nowString() string {
	nowStringMu.Lock()
	defer nowStringMu.Unlock()
	now := nowStringClock().UTC()
	if !now.After(lastNowStringTime) {
		now = lastNowStringTime.Add(time.Nanosecond)
	}
	lastNowStringTime = now
	return now.Format("2006-01-02T15:04:05.000000000Z")
}

func textBlock(text string) MessageContentBlock {
	return MessageContentBlock{Type: "text", Text: text}
}

func textFallbackFromBlocks(blocks []MessageContentBlock) string {
	var out string
	for _, block := range blocks {
		if block.Type != "text" || block.Text == "" {
			continue
		}
		if out != "" {
			out += "\n"
		}
		out += block.Text
	}
	return out
}

func parseJSONValue(raw string) any {
	var value any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return map[string]any{}
	}
	return value
}

func liveContinuity() SessionContinuity {
	return SessionContinuity{State: continuityLive, Continuable: true}
}

func viewOnlyContinuity(reason string) SessionContinuity {
	return SessionContinuity{State: continuityViewOnly, Reason: stringPtr(reason)}
}
