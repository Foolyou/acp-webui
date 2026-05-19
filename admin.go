package main

import (
	"context"
	"fmt"
	"io"
	"strings"
)

func runAdminCommand(ctx context.Context, stdout io.Writer, args []string) (bool, error) {
	if len(args) == 0 {
		return false, nil
	}
	switch args[0] {
	case "devices":
		if len(args) < 2 || args[1] != "pending" {
			return false, nil
		}
		config, storage, err := openAdminStorage(ctx, args[2:])
		if err != nil {
			return true, err
		}
		defer storage.Close()
		auth := newAuthService(config, storage)
		requests, err := auth.listPendingDevicePairingRequests(ctx)
		if err != nil {
			return true, err
		}
		if len(requests) == 0 {
			fmt.Fprintln(stdout, "No pending device pairing requests.")
			return true, nil
		}
		for _, request := range requests {
			fmt.Fprintf(stdout, "%s expires=%s", formatDevicePairingCode(request.Code), request.ExpiresAt)
			if request.ClientIP != nil && *request.ClientIP != "" {
				fmt.Fprintf(stdout, " client=%s", *request.ClientIP)
			}
			if request.UserAgent != nil && *request.UserAgent != "" {
				fmt.Fprintf(stdout, " user_agent=%q", compactUserAgent(*request.UserAgent))
			}
			fmt.Fprintln(stdout)
		}
		return true, nil
	case "approve":
		if len(args) < 2 || strings.HasPrefix(args[1], "--") {
			return true, fmt.Errorf("usage: approve <device-code> [options]")
		}
		code := args[1]
		config, storage, err := openAdminStorage(ctx, args[2:])
		if err != nil {
			return true, err
		}
		defer storage.Close()
		auth := newAuthService(config, storage)
		request, err := auth.approveDevicePairingRequest(ctx, code)
		if err != nil {
			return true, err
		}
		fmt.Fprintf(stdout, "Approved device pairing request %s. Browser access will be granted when the pairing page polls again.\n", formatDevicePairingCode(request.Code))
		return true, nil
	default:
		return false, nil
	}
}

func openAdminStorage(ctx context.Context, args []string) (Config, *Storage, error) {
	config, err := parseConfig(args)
	if err != nil {
		return Config{}, nil, err
	}
	if err := config.ensureWorkDir(); err != nil {
		return Config{}, nil, err
	}
	storage, err := openStorage(config.DatabaseURL)
	if err != nil {
		return Config{}, nil, err
	}
	if err := storage.Migrate(ctx); err != nil {
		_ = storage.Close()
		return Config{}, nil, err
	}
	return config, storage, nil
}

func compactUserAgent(value string) string {
	value = strings.Join(strings.Fields(value), " ")
	if len(value) <= 80 {
		return value
	}
	return value[:77] + "..."
}
