#!/bin/bash
set -e

echo "🚀 Deploying CDKTF Infrastructure"
echo "===================================="

# Check prerequisites
if ! command -v cdktf &> /dev/null; then
    echo "❌ CDKTF CLI not found. Install: npm install -g cdktf-cli"
    exit 1
fi

# Deploy
echo "🚀 Deploying infrastructure..."
cdktf deploy --auto-approve

echo ""
echo "✅ Deployment complete!"
