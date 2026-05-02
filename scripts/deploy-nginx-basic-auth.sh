#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy-nginx-basic-auth.sh --server-name NAME --basic-user USER [options]

Deploys the local ACP Web UI single-binary release behind Nginx with Basic Auth.
The ACP Web UI daemon is always started on loopback, and Nginx is the external
entrypoint for browser access.

Options:
  --server-name NAME             Nginx server_name value. Required.
  --domain NAME                  Alias for --server-name.
  --basic-user USER              Basic Auth username. Required.
  --basic-password PASSWORD      Basic Auth password. Generated when omitted.
  --auth-realm REALM             Basic Auth realm. Default: ACP Web UI.
  --nginx-conf PATH              Nginx config path. Default: /etc/nginx/conf.d/acp-webui.conf.
  --htpasswd-file PATH           htpasswd path. Default: /etc/nginx/acp-webui.htpasswd.
  --template PATH                Template path. Default: scripts/nginx/acp-webui-basic-auth.conf.template.
  --upstream-port PORT           Local ACP Web UI port. Default: 7635.
  --http-port PORT               Nginx HTTP port. Default: 80.
  --client-max-body-size SIZE    Nginx client_max_body_size. Default: 20m.
  --proxy-timeout DURATION       Nginx proxy read/send timeout. Default: 3600s.
  --install-packages             Install nginx/htpasswd/certbot packages when supported.
  --certbot-email EMAIL          Request/activate Let's Encrypt cert with certbot --nginx.
  --certbot-staging              Use Let's Encrypt staging when requesting a cert.
  --skip-release-start           Do not run scripts/build-run-release.sh.
  --release-skip-build           Pass --skip-build to scripts/build-run-release.sh.
  --install-frontend-deps        Pass --install-frontend-deps to scripts/build-run-release.sh.
  --release-extra-arg ARG        Repeatable extra argument for build-run-release.sh.
  --dry-run                      Render config and htpasswd into a temp dir; do not change system state.
  -h, --help                     Show this help.

Examples:
  sudo ./scripts/deploy-nginx-basic-auth.sh \
    --server-name acp.example.com \
    --basic-user alice \
    --certbot-email alice@example.com

  ./scripts/deploy-nginx-basic-auth.sh \
    --server-name acp.local \
    --basic-user alice \
    --dry-run
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
release_script="$repo_root/scripts/build-run-release.sh"
default_template="$repo_root/scripts/nginx/acp-webui-basic-auth.conf.template"

server_name=""
basic_user=""
basic_password=""
generated_password=0
auth_realm="ACP Web UI"
nginx_conf="/etc/nginx/conf.d/acp-webui.conf"
htpasswd_file="/etc/nginx/acp-webui.htpasswd"
template="$default_template"
upstream_host="127.0.0.1"
upstream_port=7635
http_port=80
client_max_body_size="20m"
proxy_timeout="3600s"
install_packages=0
certbot_email=""
certbot_staging=0
skip_release_start=0
release_skip_build=0
install_frontend_deps=0
dry_run=0
release_extra_args=()

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

reject_shell_unsafe_value() {
  local name="$1"
  local value="$2"
  [[ -n "$value" ]] || die "$name must not be empty."
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "$name must be a single-line value."
}

reject_whitespace_path() {
  local name="$1"
  local value="$2"
  reject_shell_unsafe_value "$name" "$value"
  [[ "$value" != *[[:space:]]* ]] || die "$name must not contain whitespace."
}

parse_args() {
  while (($# > 0)); do
    case "$1" in
      --server-name|--domain)
        (($# >= 2)) || die "$1 requires a value."
        server_name="$2"
        shift 2
        ;;
      --basic-user)
        (($# >= 2)) || die "--basic-user requires a value."
        basic_user="$2"
        shift 2
        ;;
      --basic-password)
        (($# >= 2)) || die "--basic-password requires a value."
        basic_password="$2"
        shift 2
        ;;
      --auth-realm)
        (($# >= 2)) || die "--auth-realm requires a value."
        auth_realm="$2"
        shift 2
        ;;
      --nginx-conf)
        (($# >= 2)) || die "--nginx-conf requires a value."
        nginx_conf="$2"
        shift 2
        ;;
      --htpasswd-file)
        (($# >= 2)) || die "--htpasswd-file requires a value."
        htpasswd_file="$2"
        shift 2
        ;;
      --template)
        (($# >= 2)) || die "--template requires a value."
        template="$2"
        shift 2
        ;;
      --upstream-port)
        (($# >= 2)) || die "--upstream-port requires a value."
        upstream_port="$2"
        shift 2
        ;;
      --http-port)
        (($# >= 2)) || die "--http-port requires a value."
        http_port="$2"
        shift 2
        ;;
      --client-max-body-size)
        (($# >= 2)) || die "--client-max-body-size requires a value."
        client_max_body_size="$2"
        shift 2
        ;;
      --proxy-timeout)
        (($# >= 2)) || die "--proxy-timeout requires a value."
        proxy_timeout="$2"
        shift 2
        ;;
      --install-packages)
        install_packages=1
        shift
        ;;
      --certbot-email)
        (($# >= 2)) || die "--certbot-email requires a value."
        certbot_email="$2"
        shift 2
        ;;
      --certbot-staging)
        certbot_staging=1
        shift
        ;;
      --skip-release-start)
        skip_release_start=1
        shift
        ;;
      --release-skip-build)
        release_skip_build=1
        shift
        ;;
      --install-frontend-deps)
        install_frontend_deps=1
        shift
        ;;
      --release-extra-arg)
        (($# >= 2)) || die "--release-extra-arg requires a value."
        release_extra_args+=("$2")
        shift 2
        ;;
      --dry-run)
        dry_run=1
        shift
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

generate_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 24 | tr -d '\n'
    return
  fi

  od -An -N24 -tx1 /dev/urandom | tr -d ' \n'
}

install_supported_packages() {
  if ! ((install_packages)); then
    return 0
  fi
  if ((dry_run)); then
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y nginx apache2-utils certbot python3-certbot-nginx
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y nginx httpd-tools certbot python3-certbot-nginx
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    yum install -y nginx httpd-tools certbot python3-certbot-nginx
    return
  fi

  die "--install-packages is not supported on this distribution. Install nginx, htpasswd, and certbot manually."
}

run_as_project_user() {
  if ((EUID == 0)) && [[ -n "${SUDO_USER-}" && "$SUDO_USER" != "root" ]] && command -v sudo >/dev/null 2>&1; then
    sudo -u "$SUDO_USER" -H env "PATH=$PATH" "$@"
  else
    "$@"
  fi
}

render_template() {
  local content
  content="$(<"$template")"
  content="${content//\{\{SERVER_NAME\}\}/$server_name}"
  content="${content//\{\{HTTP_PORT\}\}/$http_port}"
  content="${content//\{\{AUTH_REALM\}\}/$auth_realm}"
  content="${content//\{\{HTPASSWD_FILE\}\}/$htpasswd_file}"
  content="${content//\{\{CLIENT_MAX_BODY_SIZE\}\}/$client_max_body_size}"
  content="${content//\{\{UPSTREAM_HOST\}\}/$upstream_host}"
  content="${content//\{\{UPSTREAM_PORT\}\}/$upstream_port}"
  content="${content//\{\{PROXY_TIMEOUT\}\}/$proxy_timeout}"
  printf '%s\n' "$content"
}

write_htpasswd() {
  local target="$1"
  local dir
  dir="$(dirname "$target")"
  mkdir -p "$dir"

  local create_flag=()
  [[ ! -f "$target" ]] && create_flag=(-c)

  if htpasswd -B -b "${create_flag[@]}" "$target" "$basic_user" "$basic_password" >/dev/null 2>&1; then
    return
  fi

  htpasswd -b "${create_flag[@]}" "$target" "$basic_user" "$basic_password" >/dev/null
}

secure_htpasswd_file() {
  local target="$1"
  if getent group www-data >/dev/null 2>&1; then
    chgrp www-data "$target"
    chmod 640 "$target"
    return
  fi

  chmod 644 "$target"
}

start_release() {
  ((skip_release_start)) && return
  [[ -x "$release_script" ]] || die "Release script is not executable: $release_script"

  local args=(
    --bind-host "$upstream_host"
    --bind-port "$upstream_port"
  )
  ((release_skip_build)) && args+=(--skip-build)
  ((install_frontend_deps)) && args+=(--install-frontend-deps)
  for arg in "${release_extra_args[@]}"; do
    args+=("$arg")
  done

  echo "Starting local ACP Web UI release on http://$upstream_host:$upstream_port..."
  run_as_project_user "$release_script" "${args[@]}"
}

reload_nginx() {
  nginx -t

  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files nginx.service >/dev/null 2>&1; then
    systemctl reload nginx 2>/dev/null || systemctl restart nginx
    return
  fi

  nginx -s reload 2>/dev/null || nginx
}

run_certbot() {
  if [[ -z "$certbot_email" ]]; then
    return 0
  fi
  require_command certbot

  local args=(
    --nginx
    -d "$server_name"
    --non-interactive
    --agree-tos
    --email "$certbot_email"
    --redirect
  )
  ((certbot_staging)) && args+=(--staging)

  certbot "${args[@]}"
}

parse_args "$@"

[[ -n "$server_name" ]] || die "--server-name is required."
[[ -n "$basic_user" ]] || die "--basic-user is required."
reject_shell_unsafe_value "--server-name" "$server_name"
reject_shell_unsafe_value "--basic-user" "$basic_user"
reject_shell_unsafe_value "--auth-realm" "$auth_realm"
[[ "$server_name" =~ ^[A-Za-z0-9._*-]+$ ]] || die "--server-name may only contain letters, numbers, dots, underscores, hyphens, and wildcard asterisks."
[[ "$basic_user" != *:* ]] || die "--basic-user must not contain ':'."
case "$auth_realm" in
  *\'*|*\"*|*";"*|*"{"*|*"}"*|*"\\"*)
    die "--auth-realm must not contain quotes, semicolons, braces, or backslashes."
    ;;
esac
reject_whitespace_path "--nginx-conf" "$nginx_conf"
reject_whitespace_path "--htpasswd-file" "$htpasswd_file"
reject_whitespace_path "--template" "$template"
validate_port "--upstream-port" "$upstream_port"
validate_port "--http-port" "$http_port"
[[ -f "$template" ]] || die "Template not found: $template"
[[ "$upstream_host" == "127.0.0.1" ]] || die "Nginx deployment only supports loopback upstreams."

if [[ -z "$basic_password" ]]; then
  basic_password="$(generate_password)"
  generated_password=1
fi
reject_shell_unsafe_value "--basic-password" "$basic_password"

if ((dry_run)); then
  tmp_dir="$(mktemp -d)"
  rendered_conf="$tmp_dir/$(basename "$nginx_conf")"
  rendered_htpasswd="$tmp_dir/$(basename "$htpasswd_file")"
  render_template >"$rendered_conf"
  if command -v htpasswd >/dev/null 2>&1; then
    write_htpasswd "$rendered_htpasswd"
  else
    printf '%s:%s\n' "$basic_user" "DRY_RUN_HTPASSWD_PLACEHOLDER" >"$rendered_htpasswd"
    echo "warning: htpasswd not found; wrote a placeholder dry-run password file." >&2
  fi

  echo "Dry run complete; no system files were changed."
  echo "Rendered Nginx config: $rendered_conf"
  echo "Rendered htpasswd file: $rendered_htpasswd"
  if ((generated_password)); then
    echo "Generated Basic Auth password: $basic_password"
  fi
  exit 0
fi

((EUID == 0)) || die "Run this script with sudo/root, or pass --dry-run to preview generated files."
install_supported_packages
require_command nginx
require_command htpasswd

start_release

mkdir -p "$(dirname "$nginx_conf")"
render_template >"$nginx_conf"
write_htpasswd "$htpasswd_file"
secure_htpasswd_file "$htpasswd_file"

reload_nginx
run_certbot

scheme="http"
[[ -n "$certbot_email" ]] && scheme="https"

echo "Nginx Basic Auth deployment complete."
echo "Public URL: $scheme://$server_name/"
echo "Basic Auth user: $basic_user"
if ((generated_password)); then
  echo "Generated Basic Auth password: $basic_password"
fi
echo "Local upstream: http://$upstream_host:$upstream_port"
echo "Nginx config: $nginx_conf"
echo "htpasswd file: $htpasswd_file"
