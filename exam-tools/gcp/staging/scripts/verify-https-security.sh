#!/bin/bash
# Verify HTTPS headers/cert coverage for monitoring staging hosts.

set -euo pipefail

FRONTEND_HOST="${FRONTEND_HOST:-monitoring.jamesyin.com}"
API_HOST="${API_HOST:-monitoring-api.jamesyin.com}"
DASHBOARD_HOST="${DASHBOARD_HOST:-traefik-monitoring-staging.jamesyin.com}"

check_host() {
  local host="$1"
  local path="${2:-/}"
  echo "== ${host}${path} =="
  curl -k -sSI "https://${host}${path}" | awk '
    BEGIN{IGNORECASE=1}
    /HTTP\// || /content-security-policy:/ || /strict-transport-security:/ || /location:/ || /server:/
  '
  echo ""
}

echo "Verifying HTTPS security headers and redirect behavior..."
echo ""

check_host "$FRONTEND_HOST" "/"
check_host "$API_HOST" "/health"
check_host "$DASHBOARD_HOST" "/"

echo "== HTTP -> HTTPS redirect checks =="
for host in "$FRONTEND_HOST" "$API_HOST" "$DASHBOARD_HOST"; do
  echo "-- http://${host}/"
  curl -sSI "http://${host}/" | awk 'BEGIN{IGNORECASE=1} /HTTP\// || /location:/'
done
echo ""

echo "== Certificate subject/issuer (frontend) =="
echo | openssl s_client -servername "$FRONTEND_HOST" -connect "${FRONTEND_HOST}:443" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
echo ""

echo "Done. If CSP or HSTS headers are missing, redeploy Traefik and re-run."
