// YearbookSpine — Thinner booklet representing a person's yearbook

interface YearbookSpineProps {
  personName: string
  personInitial: string
  personColor: string
  year: number
  onClick: () => void
}

export function YearbookSpine({ personName, personInitial, personColor, year, onClick }: YearbookSpineProps) {
  return (
    <button
      onClick={onClick}
      className="group block shrink-0 snap-start"
      title={`${personName}'s Yearbook ${year}`}
    >
      <div
        className="w-[80px] h-[160px] rounded-lg relative overflow-hidden cursor-pointer
          shadow-[2px_3px_6px_rgba(0,0,0,0.15),1px_1px_2px_rgba(0,0,0,0.1)]
          group-hover:shadow-[3px_5px_10px_rgba(0,0,0,0.2)]
          group-hover:-translate-y-1 transition-all duration-200"
        style={{ backgroundColor: personColor + '18' }}
      >
        {/* Spine edge */}
        <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ backgroundColor: personColor + '30' }} />

        {/* Initial circle */}
        <div className="flex items-center justify-center pt-8">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-sm"
            style={{ backgroundColor: personColor }}
          >
            {personInitial}
          </div>
        </div>

        {/* Name + year */}
        <div className="px-2 pt-3 text-center">
          <p className="text-[10px] font-medium text-neutral-700 truncate leading-tight">
            {personName}
          </p>
          <p className="text-[9px] text-neutral-400 mt-0.5">{year}</p>
        </div>
      </div>
    </button>
  )
}
