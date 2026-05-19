#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy-linux.sh --target USER@HOST [options] [-- extra acp-webui args...]

Builds the embedded single-binary Linux release, copies it to a Linux host over
SSH, stops the previous listener on the selected port, and starts acp-webui in
the background with nohup.

Defaults:
  Remote URL: http://127.0.0.1:7635
  Remote dir: .local/share/acp-webui relative to the remote login directory

Options:
  --target USER@HOST             SSH target. Required.
  --remote-dir DIR               Remote deployment directory.
  --binary-name NAME             Remote binary name. Default: acp-webui.
  --bind-host HOST               Bind to 127.0.0.1 or an explicit Tailscale IPv4.
  --tailscale                    Detect and bind to the remote Tailscale IPv4.
  --tailscale-ip IP              Bind to this explicit remote Tailscale IPv4.
  --bind-port PORT               Backend port. Default: 7635.
  --release-timeout SECONDS      Wait for stopped ports to clear. Default: 30.
  --startup-timeout SECONDS      Wait for the remote server. Default: 90.
  --skip-build                   Reuse an existing local release binary.
  --local-binary PATH            Copy this binary instead of target/release/acp-webui.
  --install-frontend-deps        Run npm install before frontend build.
  --no-run                       Build and copy only.
  --no-stop-existing             Fail instead of stopping an occupied remote port.
  --skip-health-check            Do not wait for /api/auth/status after startup.
  --work-dir DIR                 Pass --work-dir to the remote binary.
  --codex-acp-command COMMAND    Codex ACP command. Default: codex-acp.
  --codex-acp-arg ARG            Repeatable Codex ACP argument.
  --claude-acp-command COMMAND   Claude ACP command. Default: npx.
  --claude-acp-arg ARG           Repeatable Claude ACP argument.
  --opencode-acp-enabled BOOL    Pass --opencode-acp-enabled. Example: true.
  --opencode-acp-command COMMAND OpenCode ACP command. Default: opencode.
  --opencode-acp-arg ARG         Repeatable OpenCode ACP argument.
  --disable-auth                 Only allowed with loopback bind hosts.
  --ssh-command COMMAND          SSH command. Default: ssh.
  --scp-command COMMAND          SCP command. Default: scp.
  -h, --help                     Show this help.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
frontend_dir="$repo_root/frontend"
default_local_binary="$repo_root/target/release/acp-webui"

target=""
remote_dir=".local/share/acp-webui"
binary_name="acp-webui"
bind_host="127.0.0.1"
use_tailscale=0
tailscale_ip=""
bind_port=7635
release_timeout=30
startup_timeout=90
skip_build=0
local_binary=""
install_frontend_deps=0
no_run=0
no_stop_existing=0
skip_health_check=0
work_dir=""
codex_acp_command="codex-acp"
claude_acp_command="npx"
opencode_acp_enabled=""
opencode_acp_command="opencode"
disable_auth=0
ssh_command="ssh"
scp_command="scp"
codex_acp_args=()
claude_acp_args=()
opencode_acp_args=()
extra_args=()

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
  local value="$1"
  is_uint "$value" || die "--bind-port must be a number."
  ((value > 0 && value <= 65535)) || die "--bind-port must be between 1 and 65535."
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
      --target)
        (($# >= 2)) || die "--target requires a value."
        target="$2"
        shift 2
        ;;
      --remote-dir)
        (($# >= 2)) || die "--remote-dir requires a value."
        remote_dir="$2"
        shift 2
        ;;
      --binary-name)
        (($# >= 2)) || die "--binary-name requires a value."
        binary_name="$2"
        shift 2
        ;;
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
      --bind-port)
        (($# >= 2)) || die "--bind-port requires a value."
        bind_port="$2"
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
      --local-binary)
        (($# >= 2)) || die "--local-binary requires a value."
        local_binary="$2"
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
      --no-stop-existing)
        no_stop_existing=1
        shift
        ;;
      --skip-health-check)
        skip_health_check=1
        shift
        ;;
      --work-dir)
        (($# >= 2)) || die "--work-dir requires a value."
        work_dir="$2"
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
      --opencode-acp-enabled)
        (($# >= 2)) || die "--opencode-acp-enabled requires a value."
        opencode_acp_enabled="$2"
        shift 2
        ;;
      --opencode-acp-command)
        (($# >= 2)) || die "--opencode-acp-command requires a value."
        opencode_acp_command="$2"
        shift 2
        ;;
      --opencode-acp-arg)
        (($# >= 2)) || die "--opencode-acp-arg requires a value."
        opencode_acp_args+=("$2")
        shift 2
        ;;
      --disable-auth)
        disable_auth=1
        shift
        ;;
      --ssh-command)
        (($# >= 2)) || die "--ssh-command requires a value."
        ssh_command="$2"
        shift 2
        ;;
      --scp-command)
        (($# >= 2)) || die "--scp-command requires a value."
        scp_command="$2"
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

append_arg() {
  remote_args+=("$1")
}

append_arg_pair() {
  remote_args+=("$1" "$2")
}

parse_args "$@"

[[ -n "$target" ]] || die "--target is required."
[[ "$binary_name" != */* && -n "$binary_name" ]] || die "--binary-name must be a file name, not a path."
validate_port "$bind_port"
is_uint "$release_timeout" || die "--release-timeout must be a number."
is_uint "$startup_timeout" || die "--startup-timeout must be a number."
((release_timeout > 0)) || die "--release-timeout must be greater than 0."
((startup_timeout > 0)) || die "--startup-timeout must be greater than 0."

if ((use_tailscale)); then
  if [[ -n "$tailscale_ip" ]] && ! is_tailscale_ipv4 "$tailscale_ip"; then
    die "$tailscale_ip is not in the Tailscale IPv4 range 100.64.0.0/10."
  fi
elif is_wildcard_host "$bind_host"; then
  die "Refusing to bind to all interfaces ($bind_host). Use 127.0.0.1, --tailscale, or --tailscale-ip."
elif ! is_loopback_host "$bind_host" && ! is_tailscale_ipv4 "$bind_host"; then
  die "Refusing to bind to $bind_host. Project services may bind only to 127.0.0.1 or an explicit Tailscale IPv4 address."
fi

if ((disable_auth)) && ! is_loopback_host "$bind_host"; then
  if ! ((use_tailscale)); then
    die "--disable-auth is only allowed when binding to a loopback address."
  fi
  die "--disable-auth cannot be used with Tailscale binding."
fi

require_command "$ssh_command"
require_command "$scp_command"

if ((skip_build)); then
  binary="${local_binary:-$default_local_binary}"
else
  require_command go
  require_command npm

  if ((install_frontend_deps)) || [[ ! -d "$frontend_dir/node_modules" ]]; then
    echo "Installing frontend dependencies..."
    (cd "$frontend_dir" && npm install)
  fi

  echo "Building frontend..."
  (cd "$frontend_dir" && npm run build)

  echo "Building embedded release binary..."
  (cd "$repo_root" && go build -tags embedded_frontend -o "$default_local_binary" .)

  binary="${local_binary:-$default_local_binary}"
fi

[[ -f "$binary" ]] || die "Release binary not found at $binary."
[[ -x "$binary" ]] || chmod +x "$binary"

remote_args=(
  --bind-host "__ACP_WEBUI_BIND_HOST__"
  --bind-port "$bind_port"
  --codex-acp-command "$codex_acp_command"
)

for arg in "${codex_acp_args[@]}"; do
  append_arg_pair --codex-acp-arg "$arg"
done

append_arg_pair --claude-acp-command "$claude_acp_command"
for arg in "${claude_acp_args[@]}"; do
  append_arg_pair --claude-acp-arg "$arg"
done

if [[ -n "$opencode_acp_enabled" ]]; then
  append_arg_pair --opencode-acp-enabled "$opencode_acp_enabled"
fi
append_arg_pair --opencode-acp-command "$opencode_acp_command"
for arg in "${opencode_acp_args[@]}"; do
  append_arg_pair --opencode-acp-arg "$arg"
done

if [[ -n "$work_dir" ]]; then
  append_arg_pair --work-dir "$work_dir"
fi
if ((disable_auth)); then
  append_arg --disable-auth
fi
for arg in "${extra_args[@]}"; do
  append_arg "$arg"
done

remote_upload="$remote_dir/$binary_name.new"
echo "Preparing remote directory..."
"$ssh_command" "$target" "mkdir -p -- '$remote_dir'"

echo "Copying binary to $target:$remote_upload..."
"$scp_command" "$binary" "${target}:$remote_upload"

echo "Installing and starting remote release..."
"$ssh_command" "$target" bash -s -- \
  "$remote_dir" \
  "$binary_name" \
  "$bind_host" \
  "$use_tailscale" \
  "$tailscale_ip" \
  "$bind_port" \
  "$release_timeout" \
  "$startup_timeout" \
  "$no_run" \
  "$no_stop_existing" \
  "$skip_health_check" \
  "${remote_args[@]}" <<'REMOTE_SCRIPT'
set -euo pipefail

remote_dir="$1"
binary_name="$2"
bind_host="$3"
use_tailscale="$4"
tailscale_ip="$5"
bind_port="$6"
release_timeout="$7"
startup_timeout="$8"
no_run="$9"
no_stop_existing="${10}"
skip_health_check="${11}"
shift 11
run_args=("$@")

die() {
  echo "error: $*" >&2
  exit 1
}

is_tailscale_ipv4() {
  local address="$1"
  [[ "$address" =~ ^100\.([6-9][0-9]|1[01][0-9]|12[0-7])\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  local third="${BASH_REMATCH[2]}"
  local fourth="${BASH_REMATCH[3]}"
  ((third <= 255 && fourth <= 255))
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

  die "Could not find a remote Tailscale IPv4 address. Start Tailscale or pass --tailscale-ip 100.x.y.z."
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

  if command -v ss >/dev/null 2>&1; then
    ss -H -ltnp "sport = :$port" 2>/dev/null | while IFS= read -r line; do
      [[ -n "$line" ]] || continue
      local local_address
      local_address="$(awk '{ print $4 }' <<<"$line")"
      if local_address_matches "$local_address" "$port" "$host"; then
        sed -n 's/.*pid=\([0-9]\+\).*/\1/p' <<<"$line"
      fi
    done | sort -n -u
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | sort -n -u
    return
  fi

  die "Remote host needs ss or lsof to inspect port listeners."
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

  die "Port $host:$port is still listening after $timeout seconds."
}

wait_for_http_ok() {
  local url="$1"
  local timeout="$2"
  local deadline=$((SECONDS + timeout))

  while ((SECONDS < deadline)); do
    local status=""
    if command -v curl >/dev/null 2>&1; then
      status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "$url" 2>/dev/null || true)"
    elif command -v wget >/dev/null 2>&1; then
      if wget -q --timeout=2 --spider "$url" 2>/dev/null; then
        status="200"
      fi
    else
      die "Remote host needs curl or wget for the startup health check, or pass --skip-health-check."
    fi

    if [[ "$status" =~ ^[234][0-9][0-9]$ ]]; then
      return
    fi
    sleep 0.5
  done

  die "Timed out waiting for $url."
}

resolved_bind_host="$bind_host"
if [[ "$use_tailscale" == "1" ]]; then
  resolved_bind_host="$(detect_tailscale_ipv4)"
fi

binary="$remote_dir/$binary_name"
upload="$remote_dir/$binary_name.new"
log_dir="$remote_dir/logs"
stdout_log="$log_dir/acp-webui.out.log"
stderr_log="$log_dir/acp-webui.err.log"
mkdir -p "$remote_dir" "$log_dir"
chmod +x "$upload"

if [[ "$no_stop_existing" == "1" ]]; then
  if [[ -n "$(list_port_pids "$bind_port" "$resolved_bind_host")" ]]; then
    die "Port $resolved_bind_host:$bind_port is already in use. Remove --no-stop-existing to stop it first."
  fi
else
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && stop_process_tree "$pid"
  done < <(list_port_pids "$bind_port" "$resolved_bind_host")
  wait_for_port_release "$bind_port" "$resolved_bind_host" "$release_timeout"
fi

mv -f "$upload" "$binary"

for index in "${!run_args[@]}"; do
  if [[ "${run_args[$index]}" == "__ACP_WEBUI_BIND_HOST__" ]]; then
    run_args[$index]="$resolved_bind_host"
  fi
done

url="http://$resolved_bind_host:$bind_port"
echo "Remote binary: $binary"
echo "Serving URL: $url"

if [[ "$no_run" == "1" ]]; then
  echo "NoRun set; binary copied but not started."
  exit 0
fi

(
  cd "$remote_dir"
  nohup "$binary" "${run_args[@]}" >"$stdout_log" 2>"$stderr_log" </dev/null &
  printf '%s\n' "$!" >"$remote_dir/acp-webui.pid"
)

if [[ "$skip_health_check" != "1" ]]; then
  wait_for_http_ok "$url/api/auth/status" "$startup_timeout"
fi

echo "Remote PID: $(cat "$remote_dir/acp-webui.pid")"
echo "Logs:"
echo "  stdout: $stdout_log"
echo "  stderr: $stderr_log"
REMOTE_SCRIPT

echo "Deploy complete."
if ! ((disable_auth)); then
  echo "Device approval:"
  echo "  On the remote host, list pending devices: acp-webui devices pending"
  echo "  On the remote host, approve a device:     acp-webui approve <CODE>"
fi
