import { useNavigate } from 'react-router-dom'
import { SettingsPage } from '@/components/settings/SettingsPage'

/**
 * Settings surface, mounted by the Shell at /settings.
 *
 * SettingsPage is self-contained (uses context-based hooks internally). In the
 * legacy ViewRouter it received `onBack` (which refetched family members then
 * returned to Today) and `onFamilyMembersChanged`. The Shell has no shared
 * family-members refetch to hand down here, so `onBack` simply navigates to
 * Today; SettingsPage's own hooks own their data and refetch on mount/realtime.
 */
export function SettingsApp() {
  const navigate = useNavigate()
  return <SettingsPage onBack={() => navigate('/today')} />
}
