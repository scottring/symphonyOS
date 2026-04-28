export function RationaleFooter() {
  return (
    <div className="mt-16 px-8 py-6 bg-review-50 border border-review-100 rounded-2xl max-w-2xl">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-review-600 mb-3">
        WHY LANGUAGE, NOT PILLS
      </div>
      <p className="font-display text-[1.5rem] leading-snug text-neutral-700">
        A pill says <span className="text-review-500 italic">"REJECTS"</span>.
        A sentence says <span className="text-sage-500 italic">"Kaleb negotiates."</span>
      </p>
      <p className="mt-3 text-[14px] text-neutral-600 leading-relaxed">
        Sentences carry information that pills can't — context, history, the way kids actually relate to food.
        We let you write what's true rather than picking from a fixed enum.
      </p>
    </div>
  )
}
