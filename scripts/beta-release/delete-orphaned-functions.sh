#!/usr/bin/env bash
# Deletes the deployed edge functions that no longer exist in the repository
# (inventory of 2026-10-14, project mwadppyrqzuzgstmwpuy). They are unguarded
# paid or data routes reachable by any signed-in user (or by anyone, where
# verify_jwt is NO). RUN ONLY WITH SCOTT'S APPROVAL. Re-list first:
#   supabase functions list --project-ref mwadppyrqzuzgstmwpuy
# and remove from this list anything that has since been added to the repo.
set -euo pipefail
supabase functions delete agent-proxy --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete ai-parse-action --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete chat-message --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete coaching-block-generate --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=NO
supabase functions delete conduct-onboarding-conversation --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=NO
supabase functions delete copilot-runtime --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete find-charging-stations --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=NO
supabase functions delete find-charging-stations-nrel --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete generate-cascading-goals --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete generate-coherence-observations --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete generate-daily-brief --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=NO
supabase functions delete generate-packing-list --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete generate-weekly-playbook --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete generate-yearbook-content --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete get-context-snapshot --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=NO
supabase functions delete google-calendar-update-event --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete google-gmail-scan --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=NO
supabase functions delete parse-plan --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete rapid-processor --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete scan-to-task --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete send-email --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete send-sms --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete suggest-rules-from-research --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=NO
supabase functions delete symphony-agent-v2 --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete symphony-agent-wall-test --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
supabase functions delete symphony-chat --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=NO
supabase functions delete workspace-voice-v2 --project-ref mwadppyrqzuzgstmwpuy   # verify_jwt=yes
