import { MorningPage } from '@/pages/MorningPage'

/** Morning ritual launch surface, mounted by the Shell at /morning.
 * Single self-contained page (uses useWallData + useNavigate, no App providers). */
export function MorningApp() {
  return <MorningPage />
}
