# BUG: Calendar Shows "Connected" But Events Don't Load

## Symptom
- App shows calendar as "connected" 
- But calendar events don't appear on the schedule
- User has to disconnect and reconnect (going through Google OAuth flow again)
- Happens after logging back into the app (session resumption)

## Likely Cause
OAuth access token expired, but:
1. Refresh token not being used automatically
2. OR refresh is failing silently without updating UI state
3. OR refresh token itself expired

## Expected Behavior
- If access token expired → automatically refresh using refresh token
- If refresh fails → update UI to show "Reconnect needed" (not "Connected")
- Never show "Connected" when API calls are actually failing

## Files to Investigate
- Google Calendar auth/token handling code
- Token refresh logic
- Calendar connection status check
- API error handling (is it swallowing auth errors?)

## Fix Requirements
1. Check token expiry before making calendar API calls
2. Implement automatic token refresh when expired
3. If refresh fails → clear "connected" state, prompt reconnect
4. Surface meaningful error to user instead of silent failure

## Priority
Medium - annoying UX but has workaround (manual reconnect)
