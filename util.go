package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"
)

type appError struct {
	Status  int
	Message string
}

func (e appError) Error() string {
	return e.Message
}

func badRequest(message string) appError {
	return appError{Status: http.StatusBadRequest, Message: message}
}

func unauthorized(message string) appError {
	return appError{Status: http.StatusUnauthorized, Message: message}
}

func forbidden(message string) appError {
	return appError{Status: http.StatusForbidden, Message: message}
}

func notFound(message string) appError {
	return appError{Status: http.StatusNotFound, Message: message}
}

func conflict(message string) appError {
	return appError{Status: http.StatusConflict, Message: message}
}

func unavailable(message string) appError {
	return appError{Status: http.StatusServiceUnavailable, Message: message}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, err error) {
	var appErr appError
	if errors.As(err, &appErr) {
		writeJSON(w, appErr.Status, map[string]string{"error": appErr.Message})
		return
	}
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
}

func decodeJSON(r *http.Request, target any) error {
	if r.Body == nil {
		return nil
	}
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		return badRequest("Invalid JSON request body")
	}
	return nil
}

func timeNowUnixNano() int64 {
	return time.Now().UnixNano()
}

func nativePathString(path string) string {
	if rest, ok := strings.CutPrefix(path, `\\?\UNC\`); ok {
		return `\\` + rest
	}
	if rest, ok := strings.CutPrefix(path, `\\?\`); ok {
		return rest
	}
	return path
}

func workspaceName(path string) string {
	cleaned := filepath.Clean(path)
	name := filepath.Base(cleaned)
	if name == "." || name == string(filepath.Separator) || name == "" {
		return cleaned
	}
	return name
}

func summarizeText(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	value = strings.ReplaceAll(value, "\r\n", "\n")
	if len(value) > 160 {
		return value[:160] + "..."
	}
	return value
}

func mustJSON(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(data)
}

func sqlitePathFromURL(databaseURL string) string {
	if databaseURL == "sqlite::memory:" || databaseURL == ":memory:" {
		return ":memory:"
	}
	if strings.HasPrefix(databaseURL, "sqlite://") {
		return strings.TrimPrefix(databaseURL, "sqlite://")
	}
	if strings.HasPrefix(databaseURL, "sqlite:") {
		return strings.TrimPrefix(databaseURL, "sqlite:")
	}
	return databaseURL
}

func formatCommand(name string, args []string) string {
	if len(args) == 0 {
		return name
	}
	return fmt.Sprintf("%s %s", name, strings.Join(args, " "))
}

func nonNilSlice[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	return items
}
