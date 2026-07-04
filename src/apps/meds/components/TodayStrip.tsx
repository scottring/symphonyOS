import type { Medication, MedicationLog } from '@/types/medication'

interface Props {
  medications: Medication[]
  logs: MedicationLog[]
  onLogDose: (medicationId: string, takenAt?: Date, note?: string) => void
}

export function TodayStrip({ medications }: Props) {
  return <p className="text-neutral-500">{medications.length} medications — today view coming in Task 7.</p>
}
