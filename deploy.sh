#!/bin/bash
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
CONVEX_URL="${CONVEX_URL:?Set CONVEX_URL}"

echo "=== Deploying Extended Play Agent ==="
cd agent
gcloud run deploy extended-play-agent \
  --source . \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,GOOGLE_GENAI_USE_VERTEXAI=True,CONVEX_URL=$CONVEX_URL" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=5 \
  --session-affinity
cd ..

# Get the agent URL
AGENT_URL=$(gcloud run services describe extended-play-agent \
  --region "$REGION" --project "$PROJECT_ID" \
  --format='value(status.url)')
AGENT_WS_URL="wss://$(echo $AGENT_URL | sed 's|https://||')/ws"

echo "=== Deploying Extended Play Frontend ==="
gcloud run deploy extended-play-web \
  --source . \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --set-env-vars="NEXT_PUBLIC_CONVEX_URL=$CONVEX_URL,NEXT_PUBLIC_AGENT_WS_URL=$AGENT_WS_URL" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=5

echo "=== Deployment Complete ==="
gcloud run services describe extended-play-web \
  --region "$REGION" --project "$PROJECT_ID" \
  --format='value(status.url)'
