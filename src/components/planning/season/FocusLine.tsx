export function FocusLine({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] tracking-wide uppercase text-neutral-400">This season is about</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="one sentence — what makes this season a good one"
        className="mt-1 w-full bg-transparent font-display text-lg text-neutral-800 placeholder:text-neutral-300 border-b border-neutral-200 focus:border-primary-400 focus:outline-none pb-1"
      />
    </label>
  )
}
