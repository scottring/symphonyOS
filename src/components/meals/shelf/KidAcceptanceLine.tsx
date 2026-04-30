interface Props {
  sentence?: string
}

export function KidAcceptanceLine({ sentence }: Props) {
  if (!sentence) return null
  return (
    <p className="font-display italic text-[15px] text-sage-500 leading-snug">
      {sentence}
    </p>
  )
}
