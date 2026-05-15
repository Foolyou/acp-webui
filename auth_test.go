package main

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPairSetsLocalHTTPUsableCookie(t *testing.T) {
	auth := newAuthService(Config{PairingToken: "test-token"})
	request := httptest.NewRequest("POST", "/api/auth/pair", strings.NewReader(`{"token":"test-token"}`))
	request.RemoteAddr = "127.0.0.1:12345"
	response := httptest.NewRecorder()
	status, err := auth.pair(response, request, "test-token")
	if err != nil {
		t.Fatal(err)
	}
	if status.Access != "paired_session" || status.PairingRequired {
		t.Fatalf("unexpected status: %#v", status)
	}
	cookie := response.Header().Get("Set-Cookie")
	if !strings.Contains(cookie, "HttpOnly") {
		t.Fatalf("cookie missing HttpOnly: %s", cookie)
	}
	if !strings.Contains(cookie, "SameSite=Lax") {
		t.Fatalf("cookie missing SameSite=Lax: %s", cookie)
	}
	if strings.Contains(cookie, "Secure") {
		t.Fatalf("local cookie should not require Secure: %s", cookie)
	}
}

func TestPairRejectsInvalidToken(t *testing.T) {
	auth := newAuthService(Config{PairingToken: "test-token"})
	request := httptest.NewRequest("POST", "/api/auth/pair", nil)
	request.RemoteAddr = "127.0.0.1:12345"
	if _, err := auth.pair(httptest.NewRecorder(), request, "wrong"); err == nil {
		t.Fatal("expected invalid token to fail")
	}
}
