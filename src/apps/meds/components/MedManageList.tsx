import type { Medication, MedicationLog } from '@/types/medication'
import type { MedicationInput } from '@/hooks/useMedications'

interface Props {
  medications: Medication[]
  logs: MedicationLog[]
  onAdd: (input: MedicationInput) => Promise<Medication | null>
  onUpdate: (id: string, patch: Partial<MedicationInput>) => void
  onDelete: (id: string) => void
  onLogDose: (medicationId: string, takenAt?: Date, note?: string) => void
  onUpdateLog: (id: string, patch: { takenAt?: Date; note?: string }) => void
  onDeleteLog: (id: string) => void
}

export function MedManageList({ medications }: Props) {
  return <p className="text-neutral-500">{medications.length} medications — manage UI coming in Task 6.</p>
}
