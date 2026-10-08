export * from '@real/hooks/useHouseholdSeasons'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'
export const useHouseholdSeasons = () => ({ seasons: DEFAULT_SEASONS, loading: false, canEdit: false })
