package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	deviceCookieName           = "acp_webui_device"
	devicePairingCodeLength    = 12
	devicePairingCodeGroupSize = 4
	devicePairingRequestTTL    = 5 * time.Minute
	approvedDeviceTTL          = 7 * 24 * time.Hour
	devicePairingPollPending   = "pending"
	devicePairingPollApproved  = "approved"
	devicePairingPollExpired   = "expired"
	authAccessAnonymous        = "anonymous"
	authAccessApprovedDevice   = "approved_device"
	authAccessDisabled         = "auth_disabled"
)

var authNow = func() time.Time { return time.Now().UTC() }

type AuthService struct {
	disabled bool
	storage  *Storage
}

type AuthStatus struct {
	Access          string  `json:"access"`
	PairingRequired bool    `json:"pairingRequired"`
	ClientIP        *string `json:"clientIp"`
}

type DevicePairingChallenge struct {
	Code      string  `json:"code"`
	Status    string  `json:"status"`
	ExpiresAt string  `json:"expiresAt"`
	ClientIP  *string `json:"clientIp,omitempty"`
}

type DevicePairingPollStatus struct {
	Code      string      `json:"code"`
	Status    string      `json:"status"`
	ExpiresAt string      `json:"expiresAt"`
	Auth      *AuthStatus `json:"auth,omitempty"`
}

func newAuthService(config Config, storage ...*Storage) *AuthService {
	var backing *Storage
	if len(storage) > 0 {
		backing = storage[0]
	}
	return &AuthService{
		disabled: config.DisableAuth,
		storage:  backing,
	}
}

func (a *AuthService) attachStorage(storage *Storage) {
	if a.storage == nil {
		a.storage = storage
	}
}

func (a *AuthService) status(r *http.Request) AuthStatus {
	ip := clientIP(r)
	access := authAccessAnonymous
	if a.disabled {
		access = authAccessDisabled
	} else if a.hasApprovedDevice(r) {
		access = authAccessApprovedDevice
	}
	return AuthStatus{
		Access:          access,
		PairingRequired: access == authAccessAnonymous,
		ClientIP:        ip,
	}
}

func (a *AuthService) requireAccess(r *http.Request) error {
	if a.status(r).Access == authAccessAnonymous {
		return unauthorized("Device approval required")
	}
	return nil
}

func (a *AuthService) createDevicePairingChallenge(ctx context.Context, r *http.Request) (DevicePairingChallenge, error) {
	if a.disabled {
		return DevicePairingChallenge{}, forbidden("Authentication is disabled")
	}
	if a.storage == nil {
		return DevicePairingChallenge{}, fmt.Errorf("auth storage is not configured")
	}
	now := authNow()
	nowText := formatAuthTime(now)
	expiresAt := formatAuthTime(now.Add(devicePairingRequestTTL))
	client := clientIP(r)
	userAgent := strings.TrimSpace(r.UserAgent())
	var userAgentPtr *string
	if userAgent != "" {
		userAgentPtr = &userAgent
	}
	for attempt := 0; attempt < 8; attempt++ {
		code, err := generateDevicePairingCode()
		if err != nil {
			return DevicePairingChallenge{}, err
		}
		request, err := a.storage.CreateDevicePairingRequest(ctx, NewDevicePairingRequest{
			Code:      code,
			ClientIP:  client,
			UserAgent: userAgentPtr,
			CreatedAt: nowText,
			ExpiresAt: expiresAt,
		})
		if err == nil {
			return DevicePairingChallenge{
				Code:      request.Code,
				Status:    devicePairingPollPending,
				ExpiresAt: request.ExpiresAt,
				ClientIP:  request.ClientIP,
			}, nil
		}
		if !strings.Contains(strings.ToLower(err.Error()), "unique") {
			return DevicePairingChallenge{}, err
		}
	}
	return DevicePairingChallenge{}, fmt.Errorf("could not create unique device pairing code")
}

func (a *AuthService) pollDevicePairingRequest(w http.ResponseWriter, r *http.Request, code string) (DevicePairingPollStatus, error) {
	if a.disabled {
		status := a.status(r)
		return DevicePairingPollStatus{Code: normalizeDevicePairingCode(code), Status: devicePairingPollApproved, Auth: &status}, nil
	}
	if a.storage == nil {
		return DevicePairingPollStatus{}, fmt.Errorf("auth storage is not configured")
	}
	normalized := normalizeDevicePairingCode(code)
	if normalized == "" {
		return DevicePairingPollStatus{}, notFound("Device pairing request not found")
	}
	request, err := a.storage.GetDevicePairingRequest(r.Context(), normalized)
	if errors.Is(err, sql.ErrNoRows) {
		return DevicePairingPollStatus{}, notFound("Device pairing request not found")
	}
	if err != nil {
		return DevicePairingPollStatus{}, err
	}
	now := formatAuthTime(authNow())
	if request.ExpiresAt <= now {
		return DevicePairingPollStatus{Code: request.Code, Status: devicePairingPollExpired, ExpiresAt: request.ExpiresAt}, nil
	}
	if request.ApprovedAt == nil {
		return DevicePairingPollStatus{Code: request.Code, Status: devicePairingPollPending, ExpiresAt: request.ExpiresAt}, nil
	}
	deviceToken, err := generateDeviceToken()
	if err != nil {
		return DevicePairingPollStatus{}, err
	}
	issuedAt := authNow()
	expiresAt := issuedAt.Add(approvedDeviceTTL)
	pairingCode := request.Code
	if _, err := a.storage.ConsumeApprovedDevicePairingRequest(r.Context(), request.Code, NewApprovedDevice{
		ID:          strings.ReplaceAll(uuid.NewString(), "-", ""),
		TokenHash:   hashDeviceToken(deviceToken),
		PairingCode: &pairingCode,
		ClientIP:    clientIP(r),
		UserAgent:   userAgentPtr(r),
		CreatedAt:   formatAuthTime(issuedAt),
		ExpiresAt:   formatAuthTime(expiresAt),
	}, formatAuthTime(issuedAt)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			status := a.status(r)
			if status.Access == authAccessApprovedDevice {
				return DevicePairingPollStatus{Code: request.Code, Status: devicePairingPollApproved, ExpiresAt: request.ExpiresAt, Auth: &status}, nil
			}
			return DevicePairingPollStatus{Code: request.Code, Status: devicePairingPollExpired, ExpiresAt: request.ExpiresAt}, nil
		}
		return DevicePairingPollStatus{}, err
	}
	setDeviceCookie(w, r, deviceToken, expiresAt)
	status := a.status(r)
	status.Access = authAccessApprovedDevice
	status.PairingRequired = false
	return DevicePairingPollStatus{Code: request.Code, Status: devicePairingPollApproved, ExpiresAt: request.ExpiresAt, Auth: &status}, nil
}

func (a *AuthService) listPendingDevicePairingRequests(ctx context.Context) ([]DevicePairingRequest, error) {
	if a.storage == nil {
		return nil, fmt.Errorf("auth storage is not configured")
	}
	now := formatAuthTime(authNow())
	if err := a.storage.DeleteExpiredAuthRecords(ctx, now); err != nil {
		return nil, err
	}
	return a.storage.ListPendingDevicePairingRequests(ctx, now)
}

func (a *AuthService) approveDevicePairingRequest(ctx context.Context, code string) (DevicePairingRequest, error) {
	if a.storage == nil {
		return DevicePairingRequest{}, fmt.Errorf("auth storage is not configured")
	}
	normalized := normalizeDevicePairingCode(code)
	if normalized == "" {
		return DevicePairingRequest{}, fmt.Errorf("device pairing code is required")
	}
	request, err := a.storage.ApproveDevicePairingRequest(ctx, normalized, formatAuthTime(authNow()))
	if errors.Is(err, sql.ErrNoRows) {
		return DevicePairingRequest{}, fmt.Errorf("device pairing request %s was not found, already used, or expired", formatDevicePairingCode(normalized))
	}
	return request, err
}

func (a *AuthService) hasApprovedDevice(r *http.Request) bool {
	if a.storage == nil {
		return false
	}
	cookie, err := r.Cookie(deviceCookieName)
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return false
	}
	_, err = a.storage.ApprovedDeviceByTokenHash(r.Context(), hashDeviceToken(cookie.Value), formatAuthTime(authNow()))
	return err == nil
}

func setDeviceCookie(w http.ResponseWriter, r *http.Request, token string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     deviceCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   requestScheme(r) == "https",
		SameSite: http.SameSiteLaxMode,
		Expires:  expiresAt,
		MaxAge:   int(expiresAt.Sub(authNow()).Seconds()),
	})
}

func generateDevicePairingCode() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	bytes := make([]byte, devicePairingCodeLength)
	random := make([]byte, devicePairingCodeLength)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	for i, value := range random {
		bytes[i] = alphabet[int(value)%len(alphabet)]
	}
	return string(bytes), nil
}

func formatDevicePairingCode(code string) string {
	normalized := normalizeDevicePairingCode(code)
	if normalized == "" {
		return ""
	}
	var builder strings.Builder
	for i, r := range normalized {
		if i > 0 && i%devicePairingCodeGroupSize == 0 {
			builder.WriteByte('-')
		}
		builder.WriteRune(r)
	}
	return builder.String()
}

func normalizeDevicePairingCode(code string) string {
	code = strings.ToUpper(strings.TrimSpace(code))
	var builder strings.Builder
	for _, r := range code {
		if r == '-' || r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			continue
		}
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			builder.WriteRune(r)
		}
	}
	return builder.String()
}

func generateDeviceToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func hashDeviceToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func formatAuthTime(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.000000000Z")
}

func userAgentPtr(r *http.Request) *string {
	userAgent := strings.TrimSpace(r.UserAgent())
	if userAgent == "" {
		return nil
	}
	return &userAgent
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
