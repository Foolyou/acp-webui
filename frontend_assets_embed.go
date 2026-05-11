//go:build embedded_frontend

package main

import (
	"embed"
	"io/fs"
)

//go:embed frontend/dist/* frontend/dist/assets/*
var embeddedFrontendRoot embed.FS

var embeddedFrontend fs.FS = embeddedFrontendRoot
var hasEmbeddedFrontend = true
