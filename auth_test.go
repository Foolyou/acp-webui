package main

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func withAuthClock(t *testing.T, now time.Time) {
	t.Helper()
	previous := authNow
	authNow = func() time.Time { return now.UTC() }
	t.Cleanup(func() { authNow = previous })
}

func TestDeviceApprovalSetsOneWeekHTTPOnlyCookie(t *testing.T) {
	now := time.Date(2026, 5, 19, 8, 0, 0, 0, time.UTC)
	withAuthClock(t, now)
	ctx := context.Background()
	storage := testStorage(t)
	auth := newAuthService(Config{}, storage)
	request := httptest.NewRequest("POST", "/api/auth/device-requests", nil)
	request.RemoteAddr = "127.0.0.1:12345"

	challenge, err := auth.createDevicePairingChallenge(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	if challenge.Status != devicePairingPollPending || challenge.ExpiresAt != formatAuthTime(now.Add(devicePairingRequestTTL)) {
		t.Fatalf("challenge = %#v", challenge)
	}
	if _, err := auth.approveDevicePairingRequest(ctx, challenge.Code); err != nil {
		t.Fatal(err)
	}

	response := httptest.NewRecorder()
	status, err := auth.pollDevicePairingRequest(response, request, challenge.Code)
	if err != nil {
		t.Fatal(err)
	}
	if status.Status != devicePairingPollApproved || status.Auth == nil || status.Auth.Access != authAccessApprovedDevice {
		t.Fatalf("unexpected status: %#v", status)
	}
	cookie := response.Header().Get("Set-Cookie")
	if !strings.Contains(cookie, "HttpOnly") {
		t.Fatalf("cookie missing HttpOnly: %s", cookie)
	}
	if !strings.Contains(cookie, "SameSite=Lax") {
		t.Fatalf("cookie missing SameSite=Lax: %s", cookie)
	}
	if !strings.Contains(cookie, "Max-Age=604800") {
		t.Fatalf("cookie missing one-week max age: %s", cookie)
	}
	if strings.Contains(cookie, "Secure") {
		t.Fatalf("local cookie should not require Secure: %s", cookie)
	}
	if storage.count(ctx, `SELECT COUNT(*) FROM approved_devices WHERE token_hash != ''`) != 1 {
		t.Fatal("approved device hash was not stored")
	}
}

func TestExpiredDevicePairingRequestCannotBeApproved(t *testing.T) {
	start := time.Date(2026, 5, 19, 8, 0, 0, 0, time.UTC)
	withAuthClock(t, start)
	ctx := context.Background()
	storage := testStorage(t)
	auth := newAuthService(Config{}, storage)
	request := httptest.NewRequest("POST", "/api/auth/device-requests", nil)
	challenge, err := auth.createDevicePairingChallenge(ctx, request)
	if err != nil {
		t.Fatal(err)
	}

	withAuthClock(t, start.Add(devicePairingRequestTTL+time.Second))
	if _, err := auth.approveDevicePairingRequest(ctx, challenge.Code); err == nil {
		t.Fatal("expected expired request approval to fail")
	}
	status, err := auth.pollDevicePairingRequest(httptest.NewRecorder(), request, challenge.Code)
	if err != nil {
		t.Fatal(err)
	}
	if status.Status != devicePairingPollExpired {
		t.Fatalf("status = %#v, want expired", status)
	}
}

func TestApprovedDeviceCookieAuthorizesStatus(t *testing.T) {
	now := time.Date(2026, 5, 19, 8, 0, 0, 0, time.UTC)
	withAuthClock(t, now)
	ctx := context.Background()
	storage := testStorage(t)
	auth := newAuthService(Config{}, storage)
	request := httptest.NewRequest("POST", "/api/auth/device-requests", nil)
	challenge, err := auth.createDevicePairingChallenge(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := auth.approveDevicePairingRequest(ctx, challenge.Code); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	if _, err := auth.pollDevicePairingRequest(response, request, challenge.Code); err != nil {
		t.Fatal(err)
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookies = %#v", cookies)
	}
	next := httptest.NewRequest("GET", "/api/auth/status", nil)
	next.AddCookie(cookies[0])
	if status := auth.status(next); status.Access != authAccessApprovedDevice || status.PairingRequired {
		t.Fatalf("status = %#v", status)
	}
}
