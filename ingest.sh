#!/usr/bin/env bash
# Usage: ./ingest.sh <URL> [tag1,tag2,...]
# Example: ./ingest.sh https://lucumr.pocoo.org/2026/1/31/pi/ python,packaging
#
# Requires: curl, jq  (brew install jq if not present)
# Reads AGENT_API_KEY from .env in the same directory

set -uo pipefail   # removed -e: silent exits from grep no-match were killing the script

URL="${1:-}"
TAGS="${2:-}"

if [[ -z "$URL" ]]; then
  echo "Usage: $0 <url> [tag1,tag2,...]"
  exit 1
fi

# Load AGENT_API_KEY from .env if not already set
if [[ -z "${AGENT_API_KEY:-}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ENV_FILE="$SCRIPT_DIR/.env"
  if [[ -f "$ENV_FILE" ]]; then
    export $(grep -v '^#' "$ENV_FILE" | grep 'AGENT_API_KEY' | xargs)
  fi
fi

if [[ -z "${AGENT_API_KEY:-}" ]]; then
  echo "❌ Error: AGENT_API_KEY not set. Add it to .env or export it."
  exit 1
fi

LEARNHUB_URL="${LEARNHUB_URL:-http://localhost:3000}"

# 1. Fetch
echo "📥 Fetching via Jina: $URL"
MD="$(curl -sL --max-time 30 --connect-timeout 10 "https://r.jina.ai/${URL}" 2>/dev/null || true)"

if [[ -z "$MD" ]]; then
  echo "⚠️  Jina timeout, trying direct fetch..."
  MD="$(curl -sL --max-time 30 --connect-timeout 10 \
    -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
    "$URL" 2>/dev/null || true)"
fi

if [[ -z "$MD" ]]; then
  echo "❌ Could not fetch content"
  exit 1
fi

echo "✓ Fetched $(echo "$MD" | wc -c | tr -d ' ') bytes"

# 2. Extract title — Jina puts "Title: ..." in the header, fallback to # heading, fallback to URL slug
TITLE="$(echo "$MD" | grep -m1 '^Title:' | sed 's/^Title: *//' || true)"
if [[ -z "$TITLE" ]]; then
  TITLE="$(echo "$MD" | grep -m1 '^# ' | sed 's/^# //' || true)"
fi
if [[ -z "$TITLE" ]]; then
  TITLE="$(echo "$URL" | sed 's|/$||; s|.*/||')"
fi
echo "📝 Title: $TITLE"

# 3. Summary — first non-empty, non-heading, non-metadata line
SUMMARY="$(echo "$MD" | grep -v '^#' | grep -v '^[A-Z][^:]*:' | grep -v '^$' | grep -v '^---' | head -3 | tr '\n' ' ' | cut -c1-200 || true)"
echo "📋 Summary: ${SUMMARY:0:80}..."

# 4. Tags JSON array
TAGS_JSON="[]"
if [[ -n "$TAGS" ]]; then
  TAGS_JSON="$(echo "$TAGS" | jq -Rc 'split(",")')"
fi
echo "🏷  Tags: ${TAGS:-none}"

# 5. POST to LearnHub
echo "🚀 Sending to $LEARNHUB_URL ..."

HTTP_STATUS="$(curl -s -o /tmp/learnhub_response.json -w "%{http_code}" \
  --max-time 15 \
  -X POST "$LEARNHUB_URL/api/v1/documents" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg title "$TITLE" \
    --arg content "$MD" \
    --arg source_url "$URL" \
    --argjson tags "$TAGS_JSON" \
    --arg summary "$SUMMARY" \
    '{title: $title, content: $content, source_url: $source_url, source_type: "blog", tags: $tags, summary: $summary}'
  )")"

BODY="$(cat /tmp/learnhub_response.json)"

if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "201" ]]; then
  DOC_ID="$(echo "$BODY" | jq -r '.id // empty')"
  echo "✅ Saved! ID: $DOC_ID"
  echo "🔗 Read at: $LEARNHUB_URL/$DOC_ID"
else
  echo "❌ Failed (HTTP $HTTP_STATUS)"
  echo "   Response: $BODY"
  exit 1
fi
