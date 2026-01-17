#!/bin/bash
# Script to create secrets in GCP Secret Manager for registration portal staging
# Run this script to set up secrets before deployment

set -e

PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"

echo "Creating secrets in GCP Secret Manager for project: $PROJECT_ID"
echo "Note: This script creates secrets interactively. You will be prompted for values."

# Function to create or update secret
create_secret() {
    local secret_name=$1
    local description=$2

    # Check if secret exists
    if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" > /dev/null 2>&1; then
        echo "Secret $secret_name already exists. Updating..."
        echo -n "Enter new value for $secret_name (or press Enter to skip): "
        read -s secret_value
        if [ -n "$secret_value" ]; then
            echo "$secret_value" | gcloud secrets versions add "$secret_name" --project="$PROJECT_ID" --data-file=-
            echo "Secret $secret_name updated"
        else
            echo "Skipped updating $secret_name"
        fi
    else
        echo "Creating secret: $secret_name"
        echo -n "Enter value for $secret_name: "
        read -s secret_value
        if [ -n "$secret_value" ]; then
            echo "$secret_value" | gcloud secrets create "$secret_name" --project="$PROJECT_ID" --data-file=- --replication-policy="automatic"
            echo "Secret $secret_name created"
        else
            echo "Warning: Empty value for $secret_name, skipping"
        fi
    fi
}

# Create secrets
echo ""
echo "Creating database credentials..."
create_secret "registration-portal-db-password" "PostgreSQL password for registration portal"
create_secret "registration-portal-db-user" "PostgreSQL user for registration portal"

echo ""
echo "Creating authentication secrets..."
create_secret "registration-portal-secret-key" "JWT secret key for authentication"

echo ""
echo "Creating Paystack secrets..."
create_secret "registration-portal-paystack-secret-key" "Paystack secret key"
create_secret "registration-portal-paystack-public-key" "Paystack public key"
create_secret "registration-portal-paystack-webhook-secret" "Paystack webhook verification secret"

echo ""
echo "Creating system admin credentials..."
create_secret "registration-portal-system-admin-password" "System administrator password"

echo ""
echo "Creating Cloud SQL connection name (if using Cloud SQL)..."
create_secret "registration-portal-cloud-sql-connection-name" "Cloud SQL connection name (format: project:region:instance)"

echo ""
echo "Secrets setup complete!"
echo ""
echo "Next steps:"
echo "1. Grant the service account access to these secrets:"
echo "   gcloud secrets add-iam-policy-binding SECRET_NAME \\"
echo "     --member='serviceAccount:SERVICE_ACCOUNT@PROJECT_ID.iam.gserviceaccount.com' \\"
echo "     --role='roles/secretmanager.secretAccessor' \\"
echo "     --project=$PROJECT_ID"
echo ""
echo "2. Update .env.staging.gcp to load secrets from Secret Manager"
echo "3. Run deployment script: ./gcp/staging/scripts/deploy.sh"
