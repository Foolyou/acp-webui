#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/run-linux-dev.sh [options]

Starts or restarts ACP Web UI development services on Linux.

Defaults:
  Backend:  http://127.0.0.1:7635
  Frontend: http://127.0.0.1:5777

Options:
  --bind-host HOST              Bind to 127.0.0.1 or an explicit Tailscale IPv4.
  --tailscale                   Detect and bind to the local Tailscale IPv4.
  --tailscale-ip IP             Bind to this explicit Tailscale IPv4.
  --frontend-port PORT          Frontend Vite port. Default: 5777.
  --backend-port PORT           Backend port. Default: 7635.
  --release-timeout SECONDS     Wait for stopped ports to clear. Default: 20.
  --startup-timeout SECONDS     Wait for services to become reachable. Default: 180.
  --install-frontend-deps       Run npm install before startup.
  --no-run                      Stop existing listeners and exit.
  --work-dir DIR                Pass --work-dir to the backend.
  --pairing-token TOKEN         Pass --pairing-token to the backend.
  --codex-acp-command COMMAND   Codex ACP command. Default: codex-acp.
  --codex-acp-arg ARG           Repeatable Codex ACP argument.
  --claude-acp-command COMMAND  Claude ACP command. Default: npx.
  --claude-acp-arg ARG          Repeatable Claude ACP argument.
  --claude-code-executable PATH Set CLAUDE_CODE_EXECUTABLE for backend startup.
  --trusted-client CIDR         Repeatable trusted client CIDR.
  -h, --help                    Show this help.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
frontend_dir="$repo_root/frontend"
log_dir="$repo_root/.data/dev-linux"
backend_out="$log_dir/backend.out.log"
backend_err="$log_dir/backend.err.log"
frontend_out="$log_dir/frontend.out.log"
frontend_err="$log_dir/frontend.err.log"

bind_host="127.0.0.1"
use_tailscale=0
tailscale_ip=""
frontend_port=5777
backend_port=7635
release_timeout=20
startup_timeout=180
install_frontend_deps=0
no_run=0
work_dir=""
pairing_token=""
codex_acp_command="codex-acp"
claude_acp_command="npx"
claude_code_executable=""
codex_acp_args=()
claude_acp_args=()
trusted_clients=()

if [[ -f "$HOME/.cargo/env" ]]; then
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi
if [[ -f "$HOME/.local/bin/env" ]]; then
  # shellcheck disable=SC1091
  . "$HOME/.local/bin/env"
fi

die() {
  echo "error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required but was not found on PATH."
}

is_uint() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

validate_port() {
  local name="$1"
  local value="$2"
  is_uint "$value" || die "$name must be a number."
  ((value > 0 && value <= 65535)) || die "$name must be between 1 and 65535."
}

is_tailscale_ipv4() {
  local address="$1"
  [[ "$address" =~ ^100\.([6-9][0-9]|1[01][0-9]|12[0-7])\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  local third="${BASH_REMATCH[2]}"
  local fourth="${BASH_REMATCH[3]}"
  ((third <= 255 && fourth <= 255))
}

is_loopback_host() {
  [[ "$1" == "127.0.0.1" || "$1" == "::1" ]]
}

is_wildcard_host() {
  [[ "$1" == "0.0.0.0" || "$1" == "::" || "$1" == "[::]" || "$1" == "*" ]]
}

detect_tailscale_ipv4() {
  if [[ -n "$tailscale_ip" ]]; then
    is_tailscale_ipv4 "$tailscale_ip" || die "$tailscale_ip is not in the Tailscale IPv4 range 100.64.0.0/10."
    printf '%s\n' "$tailscale_ip"
    return
  fi

  if command -v tailscale >/dev/null 2>&1; then
    local ip
    while IFS= read -r ip; do
      ip="${ip%%[$'\r\n']*}"
      if is_tailscale_ipv4 "$ip"; then
        printf '%s\n' "$ip"
        return
      fi
    done < <(tailscale ip -4 2>/dev/null || true)
  fi

  if command -v ip >/dev/null 2>&1; then
    local candidate
    while IFS= read -r candidate; do
      if is_tailscale_ipv4 "$candidate"; then
        printf '%s\n' "$candidate"
        return
      fi
    done < <(ip -o -4 addr show 2>/dev/null | awk '{ split($4, a, "/"); print a[1] }')
  fi

  die "Could not find a local Tailscale IPv4 address. Start Tailscale or pass --tailscale-ip 100.x.y.z."
}

format_command() {
  local out=()
  local arg
  for arg in "$@"; do
    printf -v arg '%q' "$arg"
    out+=("$arg")
  done
  printf '%s\n' "${out[*]}"
}

parse_args() {
  while (($# > 0)); do
    case "$1" in
      --bind-host)
        (($# >= 2)) || die "--bind-host requires a value."
        bind_host="$2"
        shift 2
        ;;
      --tailscale)
        use_tailscale=1
        shift
        ;;
      --tailscale-ip)
        (($# >= 2)) || die "--tailscale-ip requires a value."
        use_tailscale=1
        tailscale_ip="$2"
        shift 2
        ;;
      --frontend-port)
        (($# >= 2)) || die "--frontend-port requires a value."
        frontend_port="$2"
        shift 2
        ;;
      --backend-port)
        (($# >= 2)) || die "--backend-port requires a value."
        backend_port="$2"
        shift 2
        ;;
      --release-timeout)
        (($# >= 2)) || die "--release-timeout requires a value."
        release_timeout="$2"
        shift 2
        ;;
      --startup-timeout)
        (($# >= 2)) || die "--startup-timeout requires a value."
        startup_timeout="$2"
        shift 2
        ;;
      --install-frontend-deps)
        install_frontend_deps=1
        shift
        ;;
      --no-run)
        no_run=1
        shift
        ;;
      --work-dir)
        (($# >= 2)) || die "--work-dir requires a value."
        work_dir="$2"
        shift 2
        ;;
      --pairing-token)
        (($# >= 2)) || die "--pairing-token requires a value."
        pairing_token="$2"
        shift 2
        ;;
      --codex-acp-command)
        (($# >= 2)) || die "--codex-acp-command requires a value."
        codex_acp_command="$2"
        shift 2
        ;;
      --codex-acp-arg)
        (($# >= 2)) || die "--codex-acp-arg requires a value."
        codex_acp_args+=("$2")
        shift 2
        ;;
      --claude-acp-command)
        (($# >= 2)) || die "--claude-acp-command requires a value."
        claude_acp_command="$2"
        shift 2
        ;;
      --claude-acp-arg)
        (($# >= 2)) || die "--claude-acp-arg requires a value."
        claude_acp_args+=("$2")
        shift 2
        ;;
      --claude-code-executable)
        (($# >= 2)) || die "--claude-code-executable requires a value."
        claude_code_executable="$2"
        shift 2
        ;;
      --trusted-client)
        (($# >= 2)) || die "--trusted-client requires a value."
        trusted_clients+=("$2")
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "unknown option: $1"
        ;;
    esac
  done
}

local_address_matches() {
  local local_address="$1"
  local port="$2"
  local host="$3"

  case "$local_address" in
    "0.0.0.0:$port"|"*:$port"|"[::]:$port"|":::$port")
      return 0
      ;;
  esac

  [[ "$local_address" == "$host:$port" || "$local_address" == "[$host]:$port" ]]
}

list_port_pids() {
  local port="$1"
  local host="$2"
  require_command ss

  ss -H -ltnp "sport = :$port" 2>/dev/null | while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    local local_address
    local_address="$(awk '{ print $4 }' <<<"$line")"
    if local_address_matches "$local_address" "$port" "$host"; then
      sed -n 's/.*pid=\([0-9]\+\).*/\1/p' <<<"$line"
    fi
  done | sort -n -u
}

format_port_listeners() {
  local port="$1"
  local host="$2"
  local lines=()
  local line

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    local local_address
    local_address="$(awk '{ print $4 }' <<<"$line")"
    if local_address_matches "$local_address" "$port" "$host"; then
      lines+=("$line")
    fi
  done < <(ss -H -ltnp "sport = :$port" 2>/dev/null || true)

  if ((${#lines[@]} == 0)); then
    printf 'none\n'
  else
    printf '%s\n' "${lines[@]}" | paste -sd ';' -
  fi
}

collect_descendants() {
  local pid="$1"
  local child

  while IFS= read -r child; do
    [[ -n "$child" ]] || continue
    collect_descendants "$child"
    printf '%s\n' "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
}

stop_process_tree() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] || return
  kill -0 "$pid" 2>/dev/null || return

  echo "Stopping process $pid..."
  local targets=()
  local child
  while IFS= read -r child; do
    [[ -n "$child" ]] && targets+=("$child")
  done < <(collect_descendants "$pid")
  targets+=("$pid")

  local target
  for target in "${targets[@]}"; do
    kill "$target" 2>/dev/null || true
  done

  local deadline=$((SECONDS + 10))
  while ((SECONDS < deadline)); do
    local any_alive=0
    for target in "${targets[@]}"; do
      if kill -0 "$target" 2>/dev/null; then
        any_alive=1
        break
      fi
    done
    ((any_alive == 0)) && return
    sleep 0.2
  done

  for target in "${targets[@]}"; do
    kill -9 "$target" 2>/dev/null || true
  done
}

stop_port_listeners() {
  local port="$1"
  local host="$2"
  local pid

  while IFS= read -r pid; do
    [[ -n "$pid" ]] && stop_process_tree "$pid"
  done < <(list_port_pids "$port" "$host")
}

wait_for_port_release() {
  local port="$1"
  local host="$2"
  local timeout="$3"
  local deadline=$((SECONDS + timeout))

  while ((SECONDS < deadline)); do
    if [[ -z "$(list_port_pids "$port" "$host")" ]]; then
      return
    fi
    sleep 0.5
  done

  die "Port $host:$port is still listening after $timeout seconds ($(format_port_listeners "$port" "$host"))."
}

wait_for_http_ok() {
  local url="$1"
  local timeout="$2"
  local deadline=$((SECONDS + timeout))

  while ((SECONDS < deadline)); do
    local status
    status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "$url" 2>/dev/null || true)"
    if [[ "$status" =~ ^[234][0-9][0-9]$ ]]; then
      return
    fi
    sleep 0.5
  done

  die "Timed out waiting for $url."
}

start_background() {
  local cwd="$1"
  local stdout_path="$2"
  local stderr_path="$3"
  shift 3

  (
    cd "$cwd"
    if command -v setsid >/dev/null 2>&1; then
      setsid nohup "$@" >"$stdout_path" 2>"$stderr_path" </dev/null &
    else
      nohup "$@" >"$stdout_path" 2>"$stderr_path" </dev/null &
    fi
    printf '%s\n' "$!"
  )
}

print_pairing_token() {
  if [[ -n "$pairing_token" ]]; then
    echo "Pairing token: $pairing_token"
    return
  fi
  if [[ -n "${ACP_WEBUI_PAIRING_TOKEN-}" ]]; then
    echo "Pairing token: $ACP_WEBUI_PAIRING_TOKEN"
    return
  fi

  local generated_token=""
  local log_path
  for log_path in "$backend_out" "$backend_err"; do
    if [[ -f "$log_path" ]]; then
      generated_token="$(
        sed -E $'s/\x1B\\[[0-9;]*[[:alpha:]]//g' "$log_path" |
          sed -n 's/.*Pairing token generated for this daemon session .*token=\([^ ]*\).*/\1/p' |
          tail -n 1
      )"
      [[ -n "$generated_token" ]] && break
    fi
  done

  if [[ -z "$generated_token" && -f "$backend_out" ]]; then
    generated_token="$(sed -n 's/.*token=\([0-9a-fA-F]\{32\}\).*/\1/p' "$backend_out" | tail -n 1)"
  fi

  if [[ -n "$generated_token" ]]; then
    echo "Pairing token: $generated_token"
  else
    echo "Pairing token: unavailable; see backend logs: $backend_out and $backend_err"
  fi
}

parse_args "$@"

validate_port "--frontend-port" "$frontend_port"
validate_port "--backend-port" "$backend_port"
is_uint "$release_timeout" || die "--release-timeout must be a number."
is_uint "$startup_timeout" || die "--startup-timeout must be a number."
((release_timeout > 0)) || die "--release-timeout must be greater than 0."
((startup_timeout > 0)) || die "--startup-timeout must be greater than 0."

if ((use_tailscale)); then
  bind_host="$(detect_tailscale_ipv4)"
elif is_wildcard_host "$bind_host"; then
  die "Refusing to bind to all interfaces ($bind_host). Use 127.0.0.1 or an explicit Tailscale IPv4."
elif ! is_loopback_host "$bind_host" && ! is_tailscale_ipv4 "$bind_host"; then
  die "Refusing to bind to $bind_host. Project services may bind only to 127.0.0.1 or an explicit Tailscale IPv4 address."
fi

if [[ -n "$claude_code_executable" && ! -f "$claude_code_executable" ]]; then
  die "--claude-code-executable does not point to an accessible file."
fi

require_command cargo
require_command npm
require_command curl
require_command ss

mkdir -p "$log_dir"

backend_url="http://$bind_host:$backend_port"
frontend_url="http://$bind_host:$frontend_port"

echo "Bind address: $bind_host"
echo "Restarting dev services..."

stop_port_listeners "$frontend_port" "$bind_host"
stop_port_listeners "$backend_port" "$bind_host"
wait_for_port_release "$frontend_port" "$bind_host" "$release_timeout"
wait_for_port_release "$backend_port" "$bind_host" "$release_timeout"

if ((no_run)); then
  echo "NoRun set; ports are free."
  exit 0
fi

if ((install_frontend_deps)) || [[ ! -d "$frontend_dir/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  (cd "$frontend_dir" && npm install)
fi

backend_args=(
  run --
  --bind-host "$bind_host"
  --bind-port "$backend_port"
  --codex-acp-command "$codex_acp_command"
)

if [[ -n "$work_dir" ]]; then
  backend_args+=(--work-dir "$work_dir")
fi

for arg in "${codex_acp_args[@]}"; do
  backend_args+=(--codex-acp-arg "$arg")
done

backend_args+=(--claude-acp-command "$claude_acp_command")
for arg in "${claude_acp_args[@]}"; do
  backend_args+=(--claude-acp-arg "$arg")
done

if [[ -n "$pairing_token" ]]; then
  backend_args+=(--pairing-token "$pairing_token")
fi

for client in "${trusted_clients[@]}"; do
  backend_args+=(--trusted-client "$client")
done

frontend_args=(run dev -- --host "$bind_host" --port "$frontend_port" --strictPort)

echo "Backend command:"
echo "  $(format_command cargo "${backend_args[@]}")"
echo "Frontend command:"
echo "  ACP_WEBUI_BACKEND_URL=$(printf '%q' "$backend_url") $(format_command npm "${frontend_args[@]}")"

previous_claude_code_executable="${CLAUDE_CODE_EXECUTABLE-}"
if [[ -n "$claude_code_executable" ]]; then
  export CLAUDE_CODE_EXECUTABLE="$claude_code_executable"
elif [[ -z "${CLAUDE_CODE_EXECUTABLE-}" ]] && command -v claude >/dev/null 2>&1; then
  export CLAUDE_CODE_EXECUTABLE="$(command -v claude)"
fi

backend_pid="$(start_background "$repo_root" "$backend_out" "$backend_err" cargo "${backend_args[@]}")"
if [[ -n "$previous_claude_code_executable" ]]; then
  export CLAUDE_CODE_EXECUTABLE="$previous_claude_code_executable"
else
  unset CLAUDE_CODE_EXECUTABLE
fi

frontend_pid="$(start_background "$frontend_dir" "$frontend_out" "$frontend_err" env "ACP_WEBUI_BACKEND_URL=$backend_url" npm "${frontend_args[@]}")"

wait_for_http_ok "$backend_url/api/auth/status" "$startup_timeout"
wait_for_http_ok "$frontend_url" "$startup_timeout"

print_pairing_token
echo "Backend dev server:  $backend_url"
echo "Frontend dev server: $frontend_url"
echo "Backend PID:  $backend_pid"
echo "Frontend PID: $frontend_pid"
echo "Logs:"
echo "  Backend stdout:  $backend_out"
echo "  Backend stderr:  $backend_err"
echo "  Frontend stdout: $frontend_out"
echo "  Frontend stderr: $frontend_err"
