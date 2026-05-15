package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "mcp-display-image" {
		if err := runMCPDisplayImage(os.Stdin, os.Stdout); err != nil {
			log.Fatal(err)
		}
		return
	}

	config, err := parseConfig(os.Args[1:])
	if err != nil {
		log.Fatal(err)
	}
	addr, err := net.ResolveTCPAddr("tcp", config.bindAddr())
	if err != nil {
		log.Fatal(err)
	}
	if config.DisableAuth && !addr.IP.IsLoopback() {
		log.Fatal("--disable-auth is only allowed when binding to a loopback address")
	}
	if err := config.ensureWorkDir(); err != nil {
		log.Fatal(err)
	}
	storage, err := openStorage(config.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer storage.Close()
	ctx := context.Background()
	if err := storage.Migrate(ctx); err != nil {
		log.Fatal(err)
	}
	if expired, err := storage.expirePendingPermissionRequestsOnStartup(ctx); err == nil && expired > 0 {
		log.Printf("expired %d stale pending permission requests", expired)
	}
	if repaired, err := storage.repairRestoredRunningSessionsOnStartup(ctx); err == nil && repaired > 0 {
		log.Printf("reset %d restored sessions stuck in running state", repaired)
	}

	events := newEventHub()
	agents := newAgentRuntimeManager(config, storage, events)
	auth := newAuthService(config)
	server := newServer(config, storage, agents, auth, events)

	listener, err := net.Listen("tcp", config.bindAddr())
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("ACP Web UI listening on http://%s\n", listener.Addr())
	if token := auth.pairingTokenForStartupLog(); token != nil {
		fmt.Printf("Pairing token generated for this daemon session: token=%s\n", *token)
	} else {
		fmt.Println("Pairing token loaded from configuration")
	}
	if err := http.Serve(listener, server); err != nil {
		log.Fatal(err)
	}
}
