#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/build-run-release.sh [options] [-- extra acp-webui args...]

Builds and runs the local Linux single-binary release.

The script stops current ACP Web UI services from this project, builds the
frontend and embedded release binary, then starts the release binary in the
background on the local machine.

Defaults:
  Release server: http://127.0.0.1:7635
  Frontend dev port to clear: 5777

Options:
  --bind-host HOST              Bind to 127.0.0.1 or an explicit Tailscale IPv4.
  --tailscale                   Detect and bind to the local Tailscale IPv4.
  --tailscale-ip IP             Bind to this explicit Tailscale IPv4.
  --tailscale-serve             Bind to loopback and publish with tailscale serve --bg.
  --no-tailscale-serve-reset    Do not run tailscale serve reset first.
  --tailscale-serve-https-port PORT
                                Tailscale Serve HTTPS port. Default: 443.
  --bind-port PORT              Release server port. Default: 7635.
  --frontend-port PORT          Frontend dev port to stop. Default: 5777.
  --release-timeout SECONDS     Wait for stopped ports to clear. Default: 30.
  --startup-timeout SECONDS     Wait for the release server. Default: 180.
  --skip-build                  Reuse the existing release binary.
  --install-frontend-deps       Run npm install before frontend build.
  --no-run                      Stop existing listeners, build, and exit.
  --no-stop-existing            Fail instead of stopping occupied ports.
  --foreground                  Run the release binary in the foreground.
  --work-dir DIR                Pass --work-dir to the release binary.
  --pairing-token TOKEN         Pass --pairing-token to the release binary.
  --disable-auth                Only allowed with loopback bind hosts.
  --codex-acp-command COMMAND   Codex ACP command. Default: codex-acp.
  --codex-acp-arg ARG           Repeatable Codex ACP argument.
  --claude-acp-command COMMAND  Claude ACP command. Default: npx.
  --claude-acp-arg ARG          Repeatable Claude ACP argument.
  --trusted-client CIDR         Repeatable trusted client CIDR.
  -h, --help                    Show this help.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
frontend_dir="$repo_root/frontend"
log_dir="$repo_root/.data/release"
release_out="$log_dir/acp-webui.out.log"
release_err="$log_dir/acp-webui.err.log"
release_pid_file="$log_dir/acp-webui.pid"
binary="$repo_root/target/release/acp-webui"

bind_host="127.0.0.1"
use_tailscale=0
tailscale_serve=0
no_tailscale_serve_reset=0
tailscale_serve_https_port=443
tailscale_ip=""
bind_port=7635
frontend_port=5777
release_timeout=30
startup_timeout=180
skip_build=0
install_frontend_deps=0
no_run=0
no_stop_existing=0
foreground=0
work_dir=""
pairing_token=""
disable_auth=0
codex_acp_command="codex-acp"
claude_acp_command="npx"
codex_acp_args=()
claude_acp_args=()
trusted_clients=()
extra_args=()

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
      --tailscale-serve)
        tailscale_serve=1
        shift
        ;;
      --no-tailscale-serve-reset)
        no_tailscale_serve_reset=1
        shift
        ;;
      --tailscale-serve-https-port)
        (($# >= 2)) || die "--tailscale-serve-https-port requires a value."
        tailscale_serve_https_port="$2"
        shift 2
        ;;
      --bind-port)
        (($# >= 2)) || die "--bind-port requires a value."
        bind_port="$2"
        shift 2
        ;;
      --frontend-port)
        (($# >= 2)) || die "--frontend-port requires a value."
        frontend_port="$2"
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
      --skip-build)
        skip_build=1
        shift
        ;;
      --install-frontend-deps)
        install_frontend_deps=1
        shift
        ;;
      --no-run)
        no_run=1
        shift
        ;;
      --no-stop-existing)
        no_stop_existing=1
        shift
        ;;
      --foreground)
        foreground=1
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
      --disable-auth)
        disable_auth=1
        shift
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
      --trusted-client)
        (($# >= 2)) || die "--trusted-client requires a value."
        trusted_clients+=("$2")
        shift 2
        ;;
      --)
        shift
        extra_args+=("$@")
        break
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
  local all_addresses="$4"

  if [[ "$all_addresses" == "1" ]]; then
    case "$local_address" in
      *":$port"|*".$port")
        return 0
        ;;
    esac
  fi

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
  local all_addresses="${3:-0}"

  ss -H -ltnp "sport = :$port" 2>/dev/null | while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    local local_address
    local_address="$(awk '{ print $4 }' <<<"$line")"
    if local_address_matches "$local_address" "$port" "$host" "$all_addresses"; then
      sed -n 's/.*pid=\([0-9]\+\).*/\1/p' <<<"$line"
    fi
  done | sort -n -u
}

format_port_listeners() {
  local port="$1"
  local host="$2"
  local all_addresses="${3:-0}"
  local lines=()
  local line

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    local local_address
    local_address="$(awk '{ print $4 }' <<<"$line")"
    if local_address_matches "$local_address" "$port" "$host" "$all_addresses"; then
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
  ((pid != $$)) || return
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
    ((target != $$)) || continue
    kill "$target" 2>/dev/null || true
  done

  local deadline=$((SECONDS + 10))
  while ((SECONDS < deadline)); do
    local any_alive=0
    for target in "${targets[@]}"; do
      ((target != $$)) || continue
      if kill -0 "$target" 2>/dev/null; then
        any_alive=1
        break
      fi
    done
    ((any_alive == 0)) && return
    sleep 0.2
  done

  for target in "${targets[@]}"; do
    ((target != $$)) || continue
    kill -9 "$target" 2>/dev/null || true
  done
}

command_line_references_path() {
  local command_line="$1"
  local path="$2"
  [[ "$command_line" == *"$path"* ]]
}

get_project_process_pids() {
  local target_root="$repo_root/target"
  local pid
  local args

  while read -r pid args; do
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    ((pid != $$)) || continue

    if command_line_references_path "$args" "$repo_root" || command_line_references_path "$args" "$frontend_dir"; then
      case "$args" in
        *"cargo run"*|*"npm run dev"*|*" vite"*|*"node "*vite*|*"$target_root/release/acp-webui"*)
          printf '%s\n' "$pid"
          ;;
      esac
    fi
  done < <(ps -eo pid=,args=)
}

stop_port_listeners() {
  local port="$1"
  local host="$2"
  local all_addresses="${3:-0}"
  local pid

  while IFS= read -r pid; do
    [[ -n "$pid" ]] && stop_process_tree "$pid"
  done < <(list_port_pids "$port" "$host" "$all_addresses")
}

stop_project_services() {
  local host="$1"
  local pid
  local pids=()

  echo "Stopping current project services..."
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && pids+=("$pid")
  done < <(list_port_pids "$bind_port" "$host" 1)
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && pids+=("$pid")
  done < <(list_port_pids "$frontend_port" "$host" 1)
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && pids+=("$pid")
  done < <(get_project_process_pids)

  if ((${#pids[@]} == 0)); then
    echo "No current project services found."
    return
  fi

  printf '%s\n' "${pids[@]}" | sort -n -u | while IFS= read -r pid; do
    [[ -n "$pid" ]] && stop_process_tree "$pid"
  done
}

wait_for_port_release() {
  local port="$1"
  local host="$2"
  local timeout="$3"
  local all_addresses="${4:-0}"
  local deadline=$((SECONDS + timeout))

  while ((SECONDS < deadline)); do
    if [[ -z "$(list_port_pids "$port" "$host" "$all_addresses")" ]]; then
      return
    fi
    sleep 0.5
  done

  die "Port $host:$port is still listening after $timeout seconds ($(format_port_listeners "$port" "$host" "$all_addresses"))."
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

clear_tailscale_serve_config() {
  require_command tailscale

  if command -v pgrep >/dev/null 2>&1; then
    local pid
    while IFS= read -r pid; do
      [[ -n "$pid" ]] && stop_process_tree "$pid"
    done < <(pgrep -f '(^|/)tailscale .* serve($| )' 2>/dev/null || true)
  fi

  if ((no_tailscale_serve_reset)); then
    return
  fi

  echo "Resetting tailscale serve config..."
  tailscale serve reset >/dev/null
}

start_tailscale_serve() {
  local target_url="$1"
  require_command tailscale

  echo "Starting tailscale serve background proxy..."
  tailscale serve --bg "--https=$tailscale_serve_https_port" "$target_url"
  tailscale serve status || true
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
  for log_path in "$release_out" "$release_err"; do
    if [[ -f "$log_path" ]]; then
      generated_token="$(
        sed -E $'s/\x1B\\[[0-9;]*[[:alpha:]]//g' "$log_path" |
          sed -n 's/.*Pairing token generated for this daemon session .*token=\([^ ]*\).*/\1/p' |
          tail -n 1
      )"
      [[ -n "$generated_token" ]] && break
    fi
  done

  if [[ -n "$generated_token" ]]; then
    echo "Pairing token: $generated_token"
  else
    echo "Pairing token: unavailable; see logs: $release_out and $release_err"
  fi
}

parse_args "$@"

validate_port "--bind-port" "$bind_port"
validate_port "--frontend-port" "$frontend_port"
validate_port "--tailscale-serve-https-port" "$tailscale_serve_https_port"
is_uint "$release_timeout" || die "--release-timeout must be a number."
is_uint "$startup_timeout" || die "--startup-timeout must be a number."
((release_timeout > 0)) || die "--release-timeout must be greater than 0."
((startup_timeout > 0)) || die "--startup-timeout must be greater than 0."

if ((tailscale_serve)) && ((use_tailscale)); then
  die "Use --tailscale-serve by itself; it binds the release server to 127.0.0.1 and exposes it through tailscale serve."
fi
if ((tailscale_serve)) && [[ "$bind_host" != "127.0.0.1" ]]; then
  die "Use --tailscale-serve without --bind-host, or pass --bind-host 127.0.0.1."
fi
if ((tailscale_serve)) && ((foreground)); then
  die "--tailscale-serve requires background mode so the script can configure the tailscale serve proxy after startup."
fi

if ((tailscale_serve)); then
  bind_host="127.0.0.1"
elif ((use_tailscale)); then
  bind_host="$(detect_tailscale_ipv4)"
elif is_wildcard_host "$bind_host"; then
  die "Refusing to bind to all interfaces ($bind_host). Use 127.0.0.1, --tailscale-serve, --tailscale, or --tailscale-ip."
elif ! is_loopback_host "$bind_host" && ! is_tailscale_ipv4 "$bind_host"; then
  die "Refusing to bind to $bind_host. Project services may bind only to 127.0.0.1 or an explicit Tailscale IPv4 address."
fi

if ((disable_auth)) && ! is_loopback_host "$bind_host"; then
  die "--disable-auth is only allowed when binding to a loopback address."
fi

require_command ss
require_command curl
mkdir -p "$log_dir"

if ((no_stop_existing)); then
  if [[ -n "$(list_port_pids "$bind_port" "$bind_host")" ]]; then
    die "Port $bind_host:$bind_port is already in use ($(format_port_listeners "$bind_port" "$bind_host")). Remove --no-stop-existing to stop it first."
  fi
  if ((tailscale_serve)); then
    clear_tailscale_serve_config
  fi
else
  stop_project_services "$bind_host"
  wait_for_port_release "$bind_port" "$bind_host" "$release_timeout" 1
  wait_for_port_release "$frontend_port" "$bind_host" "$release_timeout" 1
  if ((tailscale_serve)); then
    clear_tailscale_serve_config
  fi
fi

if ! ((skip_build)); then
  require_command cargo
  require_command npm

  if ((install_frontend_deps)) || [[ ! -d "$frontend_dir/node_modules" ]]; then
    echo "Installing frontend dependencies..."
    (cd "$frontend_dir" && npm install)
  fi

  echo "Building frontend..."
  (cd "$frontend_dir" && npm run build)

  echo "Building embedded release binary..."
  (cd "$repo_root" && cargo build --release --features embedded-frontend)
fi

[[ -f "$binary" ]] || die "Release binary not found at $binary. Run without --skip-build first."
[[ -x "$binary" ]] || chmod +x "$binary"

run_args=(
  --bind-host "$bind_host"
  --bind-port "$bind_port"
  --codex-acp-command "$codex_acp_command"
)

if [[ -n "$work_dir" ]]; then
  run_args+=(--work-dir "$work_dir")
fi

for arg in "${codex_acp_args[@]}"; do
  run_args+=(--codex-acp-arg "$arg")
done

run_args+=(--claude-acp-command "$claude_acp_command")
for arg in "${claude_acp_args[@]}"; do
  run_args+=(--claude-acp-arg "$arg")
done

if [[ -n "$pairing_token" ]]; then
  run_args+=(--pairing-token "$pairing_token")
fi
if ((disable_auth)); then
  run_args+=(--disable-auth)
fi
for client in "${trusted_clients[@]}"; do
  run_args+=(--trusted-client "$client")
done
for arg in "${extra_args[@]}"; do
  run_args+=("$arg")
done

url="http://$bind_host:$bind_port"
if ((tailscale_serve)); then
  echo "Tailscale Serve mode: binding release server to loopback and publishing through tailscale serve."
elif ((use_tailscale)); then
  echo "Tailscale bind address: $bind_host"
else
  echo "Bind address: $bind_host"
fi
echo "Serving URL: $url"
echo "Command:"
echo "  $(format_command "$binary" "${run_args[@]}")"

if ((no_run)); then
  echo "NoRun set; build and command preparation complete."
  exit 0
fi

if ((foreground)); then
  echo "Starting acp-webui release in the foreground. Press Ctrl+C to stop."
  exec "$binary" "${run_args[@]}"
fi

echo "Starting acp-webui release in the background..."
release_pid="$(start_background "$repo_root" "$release_out" "$release_err" "$binary" "${run_args[@]}")"
printf '%s\n' "$release_pid" >"$release_pid_file"

wait_for_http_ok "$url/api/auth/status" "$startup_timeout"
print_pairing_token
echo "Release server: $url"
if ((tailscale_serve)); then
  start_tailscale_serve "$url"
fi
echo "Release PID: $release_pid"
echo "Logs:"
echo "  stdout: $release_out"
echo "  stderr: $release_err"
