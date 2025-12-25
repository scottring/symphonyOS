#!/bin/bash

# Deploy Google Calendar Create Event function with authentication check
set -e

echo "🚀 Deploying google-calendar-create-event function..."
echo ""

# Check if logged in
if ! supabase projects list &>/dev/null; then
  echo "❌ Not authenticated with Supabase"
  echo ""
  echo "Please run: supabase login"
  echo "This will open a browser for authentication."
  exit 1
fi

# Check if project is linked
if [ ! -f .supabase/config.toml ]; then
  echo "📎 Linking to Supabase project..."
  supabase link --project-ref mwadppyrqzuzgstmwpuy
fi

# Show current branch and changes
echo "📋 Current branch: $(git branch --show-current)"
echo "📝 Function changes:"
git diff --stat supabase/functions/google-calendar-create-event/index.ts
echo ""

# Deploy the function
echo "📤 Deploying function..."
supabase functions deploy google-calendar-create-event

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Function deployed successfully!"
  echo ""
  echo "The deployed function now includes:"
  echo "  ✓ calendarId support (works with events from any calendar)"
  echo "  ✓ Better error handling (returns 200 with errors in body)"
  echo "  ✓ Proper URL encoding"
  echo "  ✓ Enhanced logging"
  echo ""
  echo "Try updating an event location now - it should work! 🎉"
else
  echo ""
  echo "❌ Deployment failed"
  exit 1
fi
