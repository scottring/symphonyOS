import type { Medication, MedicationLog } from '@/types/medication'

interface Props {
  medications: Medication[]
  logs: MedicationLog[]
}

export function TimingView({ logs }: Props) {
  return <p className="text-neutral-500">{logs.length} logged doses — timing view coming in Task 8.</p>
}
