export * from '@real/hooks/usePlanningSession.ts'
export const usePlanningSession = () => ({ saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: () => {}, save: async () => true })
