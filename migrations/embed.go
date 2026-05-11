package migrations

import "embed"

// FS contains the SQL migration files used by the Go backend.
//
//go:embed *.sql
var FS embed.FS
