#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/restart-release-detached.sh [options] [build-run-release options...]

Starts a detached ACP Web UI release restart.

Use this wrapper when the browser or agent session may be served by the release
process being restarted. The wrapper starts scripts/build-run-release.sh in a
separate background process and returns immediately, so the restart can continue
after the current Web UI connection drops.

Options:
  --log-dir DIR   Directory for wrapper stdout/stderr logs.
                  Default: .data/release-restart
  --no-run        Print the detached command but do not start it.
  -h, --help      Show this help.

All other arguments are forwarded to scripts/build-run-release.sh.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_run_script="$repo_root/scripts/build-run-release.sh"
log_dir="$repo_root/.data/release-restart"
no_run=0
build_run_args=()

format_command() {
  local out=()
  local arg
  for arg in "$@"; do
    printf -v arg '%q' "$arg"
    out+=("$arg")
  done
  printf '%s\n' "${out[*]}"
}

while (($# > 0)); do
  case "$1" in
    --log-dir)
      (($# >= 2)) || {
        echo "error: --log-dir requires a value." >&2
        exit 1
      }
      log_dir="$2"
      shift 2
      ;;
    --no-run)
      no_run=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      build_run_args+=("$@")
      break
      ;;
    *)
      build_run_args+=("$1")
      shift
      ;;
  esac
done

if [[ ! -f "$build_run_script" ]]; then
  echo "error: release runner not found: $build_run_script" >&2
  exit 1
fi

mkdir -p "$log_dir"

timestamp="$(date +%Y%m%d-%H%M%S)"
worker_out="$log_dir/restart-$timestamp.out.log"
worker_err="$log_dir/restart-$timestamp.err.log"
worker_args=("$build_run_script" "${build_run_args[@]}")

echo "Detached restart command:"
echo "  $(format_command bash "${worker_args[@]}")"
echo "Logs:"
echo "  stdout: $worker_out"
echo "  stderr: $worker_err"

if ((no_run)); then
  echo "NoRun set; detached restart was not started."
  exit 0
fi

(
  cd "$repo_root"
  if command -v setsid >/dev/null 2>&1; then
    setsid nohup bash "${worker_args[@]}" >"$worker_out" 2>"$worker_err" </dev/null &
  else
    nohup bash "${worker_args[@]}" >"$worker_out" 2>"$worker_err" </dev/null &
  fi
  printf '%s\n' "$!" >"$log_dir/restart-$timestamp.pid"
)

echo "Detached restart PID: $(cat "$log_dir/restart-$timestamp.pid")"
