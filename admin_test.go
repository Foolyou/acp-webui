package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAdminCommandsListAndApproveDeviceRequest(t *testing.T) {
	now := time.Date(2026, 5, 19, 8, 0, 0, 0, time.UTC)
	withAuthClock(t, now)
	ctx := context.Background()
	databaseURL := "sqlite://" + filepath.Join(t.TempDir(), "admin.db")
	storage, err := openStorage(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	if err := storage.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	auth := newAuthService(Config{}, storage)
	challenge, err := auth.createDevicePairingChallenge(ctx, requestWithRemoteAddr("127.0.0.1:12345"))
	if err != nil {
		t.Fatal(err)
	}
	if err := storage.Close(); err != nil {
		t.Fatal(err)
	}

	var out bytes.Buffer
	handled, err := runAdminCommand(ctx, &out, []string{"devices", "pending", "--database-url", databaseURL})
	if err != nil {
		t.Fatal(err)
	}
	if !handled {
		t.Fatal("devices pending command was not handled")
	}
	if !strings.Contains(out.String(), formatDevicePairingCode(challenge.Code)) {
		t.Fatalf("pending output = %q, want code %s", out.String(), challenge.Code)
	}

	out.Reset()
	handled, err = runAdminCommand(ctx, &out, []string{"approve", formatDevicePairingCode(challenge.Code), "--database-url", databaseURL})
	if err != nil {
		t.Fatal(err)
	}
	if !handled {
		t.Fatal("approve command was not handled")
	}
	if !strings.Contains(out.String(), "Approved device pairing request") {
		t.Fatalf("approve output = %q", out.String())
	}

	storage, err = openStorage(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	request, err := storage.GetDevicePairingRequest(ctx, challenge.Code)
	if err != nil {
		t.Fatal(err)
	}
	if request.ApprovedAt == nil {
		t.Fatalf("request was not approved: %#v", request)
	}
}

func requestWithRemoteAddr(remoteAddr string) *http.Request {
	request := httptest.NewRequest("POST", "/api/auth/device-requests", nil)
	request.RemoteAddr = remoteAddr
	return request
}
