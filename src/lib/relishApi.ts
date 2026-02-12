import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, collection, query, where, orderBy, getDocs } from 'firebase/firestore'

// Relish Firebase config — uses separate env vars so it doesn't conflict with the main Supabase config
const relishConfig = {
  apiKey: import.meta.env.VITE_RELISH_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_RELISH_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_RELISH_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_RELISH_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_RELISH_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_RELISH_FIREBASE_APP_ID,
}

export const isRelishConfigured = () =>
  Boolean(relishConfig.apiKey && relishConfig.projectId)

// Initialize as a named app so it doesn't conflict with any other Firebase instances
const relishApp = isRelishConfigured()
  ? getApps().find(a => a.name === 'relish') ?? initializeApp(relishConfig, 'relish')
  : null

const relishDb = relishApp ? getFirestore(relishApp) : null

export interface RelishPlan {
  planId: string
  title: string
  description: string
  status: 'active' | 'pending_approval' | 'completed' | 'paused' | 'cancelled'
  duration: number // days
  targetChallenge: string
  childId?: string
  phases: Array<{
    phaseId: string
    title: string
    focus: string
    weekStart: number
    weekEnd: number
  }>
  milestones: Array<{
    milestoneId: string
    title: string
    targetWeek: number
    achieved: boolean
  }>
  startDate?: { toDate: () => Date }
  generatedAt?: { toDate: () => Date }
}

/**
 * Fetch active strategic plans from Relish Firestore.
 * Returns an empty array if Relish is not configured.
 */
export async function getActiveRelishPlans(familyId: string): Promise<RelishPlan[]> {
  if (!relishDb) return []

  try {
    const q = query(
      collection(relishDb, 'strategic_plans'),
      where('familyId', '==', familyId),
      where('status', '==', 'active'),
      orderBy('generatedAt', 'desc')
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({
      planId: doc.id,
      ...doc.data(),
    })) as RelishPlan[]
  } catch (err) {
    console.error('[Relish] Error fetching plans:', err)
    return []
  }
}
