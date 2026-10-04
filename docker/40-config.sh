#!/bin/sh
set -eu
OUT=/tmp/runtime
mkdir -p "$OUT"
RAW="${API_BASE_URL:-}"

# JSON-escape backslashes and quotes.
API_BASE_URL_JSON=$(printf '%s' "$RAW" | sed -e 's#\\#\\\\#g' -e 's#"#\\"#g')
export API_BASE_URL_JSON
envsubst '${API_BASE_URL_JSON}' < /etc/nginx/runtime/config.json.template > "$OUT/config.json"

# Origin for connect-src: scheme://host[:port] only, strict charset, else none.
ORIGIN=$(printf '%s' "$RAW" | sed -nE 's#^(https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?)(/.*)?$#\1#p')
CONNECT="'self'"
[ -n "$ORIGIN" ] && CONNECT="'self' $ORIGIN"

CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${CONNECT}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
printf 'add_header Content-Security-Policy "%s" always;\n' "$CSP" > "$OUT/csp.conf"
echo "config: apiBaseUrl='${RAW}' connect-src=${CONNECT}"
