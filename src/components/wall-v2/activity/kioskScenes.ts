// The kiosk fixture's scenes — one per approved kiosk board.
export type KioskScene =
  | 'home-morning' | 'home-afternoon' | 'home-evening' | 'quiet'
  | 'dinner' | 'groceries' | 'cooking' | 'held' | 'departure' | 'bedtime' | 'call'

export const KIOSK_SCENES: KioskScene[] = ['home-morning', 'home-afternoon', 'home-evening', 'quiet', 'dinner', 'groceries', 'cooking', 'held', 'departure', 'bedtime', 'call']
