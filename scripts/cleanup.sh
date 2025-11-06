#!/bin/bash
echo "🗑️  Destroying infrastructure..."
cdktf destroy --auto-approve
echo "✅ Cleanup complete"
