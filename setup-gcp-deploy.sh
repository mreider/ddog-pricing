#!/bin/bash
# Setup script for GitHub Actions -> Cloud Run deployment

set -e

# ============================================
# CONFIGURE THESE VALUES
# ============================================
PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_ACCOUNT_NAME="ddog-pricing-deploy"

# ============================================
SA_EMAIL="$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com"

echo "==> Setting project to $PROJECT_ID"
gcloud config set project $PROJECT_ID

echo "==> Enabling required APIs"
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable iam.googleapis.com
gcloud services enable artifactregistry.googleapis.com

echo "==> Creating service account: $SERVICE_ACCOUNT_NAME"
if gcloud iam service-accounts describe $SA_EMAIL >/dev/null 2>&1; then
  echo "    Service account already exists"
else
  gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
    --display-name="DDOG Pricing Calculator Deployer"

  echo "    Waiting for service account to propagate..."
  sleep 10

  if ! gcloud iam service-accounts describe $SA_EMAIL >/dev/null 2>&1; then
    echo "ERROR: Service account creation failed."
    exit 1
  fi
fi

echo "==> Granting IAM permissions"
for ROLE in roles/run.admin roles/storage.admin roles/iam.serviceAccountUser roles/cloudbuild.builds.editor roles/artifactregistry.writer; do
  echo "    Adding $ROLE..."
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --quiet
done

echo "==> Creating service account key"
if [ -f gcp-key.json ]; then
  echo "    gcp-key.json already exists, skipping"
else
  gcloud iam service-accounts keys create gcp-key.json \
    --iam-account=$SA_EMAIL
  echo "    Key created: gcp-key.json"
fi

echo ""
echo "============================================"
echo "SETUP COMPLETE!"
echo "============================================"
echo ""
echo "Add these secrets to GitHub:"
echo ""
echo "  gh secret set GCP_PROJECT_ID --body \"$PROJECT_ID\" --repo mreider/ddog-pricing"
echo "  gh secret set GCP_REGION --body \"$REGION\" --repo mreider/ddog-pricing"
echo "  gh secret set GCP_SA_KEY --body \"\$(cat gcp-key.json | base64)\" --repo mreider/ddog-pricing"
echo ""
echo "IMPORTANT: Delete gcp-key.json after adding to GitHub!"
echo "  rm gcp-key.json"
echo ""
