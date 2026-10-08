/* eslint-disable react-refresh/only-export-components -- dev-only fixture fakes */
export * from '@real/contexts/GoalsContext'
import type { ReactNode } from 'react'
export const GoalsProvider = ({ children }: { children: ReactNode }) => <>{children}</>
export const useGoalsContext = () => ({ goals: [], loading: false })
