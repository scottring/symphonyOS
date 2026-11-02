// One decided row's line (receipts.ts).

import { Check } from 'lucide-react'

/** "✓ Smaller step on this week: “buy frames”", and Change while the row is
 *  still on the list. */
export function ReceiptLine({ text, onChange }: { text: string; onChange?: () => void }) {
  return <p className="gw-receipt" role="status">
    <Check size={13} strokeWidth={2.5} aria-hidden="true" />
    <span>{text}</span>
    {onChange && <button type="button" className="gw-receipt-change" onClick={onChange}>Change</button>}
  </p>
}
