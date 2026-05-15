//go:build !embedded_frontend

package main

import "io/fs"

var embeddedFrontend fs.FS
var hasEmbeddedFrontend = false
