#!/bin/bash

# Deploy Google Calendar Create Event function
# This function handles both creating and updating events

echo "Deploying google-calendar-create-event function..."
supabase functions deploy google-calendar-create-event

if [ $? -eq 0 ]; then
  echo "✅ Function deployed successfully!"
  echo "The function now handles both creating and updating calendar events."
else
  echo "❌ Deployment failed. Make sure you're logged in:"
  echo "   Run: supabase login"
fi
