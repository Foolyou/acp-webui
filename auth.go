package main

import (
	"crypto/subtle"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	sessionCookieName = "acp_webui_session"
	maxFailedAttempts = 5
	pairingBackoff    = 30 * time.Second
)

type AuthService struct {
	token          string
	generatedToken bool
	disabled       bool
	mu             sync.Mutex
	sessions       map[string]struct{}
	failures       map[string]failedPairing
}

type failedPairing struct {
	count        int
	lastFailedAt time.Time
}

type AuthStatus struct {
	Access          string  `json:"access"`
	PairingRequired bool    `json:"pairingRequired"`
	ClientIP        *string `json:"clientIp"`
}

func newAuthService(config Config) *AuthService {
	token := strings.TrimSpace(config.PairingToken)
	generated := token == ""
	if generated {
		token = uuid.NewString()
		token = strings.ReplaceAll(token, "-", "")
	}
	return &AuthService{
		token:          token,
		generatedToken: generated,
		disabled:       config.DisableAuth,
		sessions:       map[string]struct{}{},
		failures:       map[string]failedPairing{},
	}
}

func (a *AuthService) pairingTokenForStartupLog() *string {
	if !a.generatedToken {
		return nil
	}
	return &a.token
}

func (a *AuthService) status(r *http.Request) AuthStatus {
	ip := clientIP(r)
	access := "anonymous"
	if a.disabled {
		access = "auth_disabled"
	} else if a.hasSession(r) {
		access = "paired_session"
	}
	return AuthStatus{
		Access:          access,
		PairingRequired: access == "anonymous",
		ClientIP:        ip,
	}
}

func (a *AuthService) requireAccess(r *http.Request) error {
	if a.status(r).Access == "anonymous" {
		return unauthorized("Pairing required")
	}
	return nil
}

func (a *AuthService) pair(w http.ResponseWriter, r *http.Request, token string) (AuthStatus, error) {
	ip := "unknown"
	if parsed := clientIP(r); parsed != nil {
		ip = *parsed
	}
	if err := a.checkBackoff(ip); err != nil {
		return AuthStatus{}, err
	}
	if subtle.ConstantTimeCompare([]byte(strings.TrimSpace(token)), []byte(a.token)) != 1 {
		a.recordFailure(ip)
		return AuthStatus{}, unauthorized("Invalid pairing token")
	}

	a.clearFailures(ip)
	sessionID := strings.ReplaceAll(uuid.NewString(), "-", "")
	a.mu.Lock()
	a.sessions[sessionID] = struct{}{}
	a.mu.Unlock()
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	return AuthStatus{Access: "paired_session", PairingRequired: false, ClientIP: &ip}, nil
}

func (a *AuthService) hasSession(r *http.Request) bool {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	_, ok := a.sessions[cookie.Value]
	return ok
}

func (a *AuthService) checkBackoff(ip string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	failure, ok := a.failures[ip]
	if ok && failure.count >= maxFailedAttempts && time.Since(failure.lastFailedAt) < pairingBackoff {
		return unauthorized("Pairing temporarily locked")
	}
	return nil
}

func (a *AuthService) recordFailure(ip string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	failure := a.failures[ip]
	failure.count++
	failure.lastFailedAt = time.Now()
	a.failures[ip] = failure
}

func (a *AuthService) clearFailures(ip string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.failures, ip)
}

func clientIP(r *http.Request) *string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		if r.RemoteAddr == "" {
			return nil
		}
		host = r.RemoteAddr
	}
	return &host
}
