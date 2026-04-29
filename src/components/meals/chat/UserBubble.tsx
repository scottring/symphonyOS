/** Right-aligned user message bubble.
 *  Asymmetric corners (sharper bottom-right) read as "from you". */
interface UserBubbleProps {
  text: string
}

export function UserBubble({ text }: UserBubbleProps) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[85%] rounded-[16px_16px_4px_16px] bg-neutral-800 px-4 py-2.5 text-sm leading-relaxed text-white"
      >
        {text}
      </div>
    </div>
  )
}
