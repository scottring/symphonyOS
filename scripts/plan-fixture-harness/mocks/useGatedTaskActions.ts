export * from '@real/hooks/useGatedTaskActions.ts'
export const useGatedTaskActions = (raw: { updateTask: (id: string, u: unknown) => Promise<boolean> }) => ({ ...raw, pushTask: async () => true })
