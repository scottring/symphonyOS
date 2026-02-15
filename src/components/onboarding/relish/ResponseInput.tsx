// ResponseInput — journal-style input for onboarding conversations
// Clean, minimal design that feels like writing in a journal, not sending a chat message.

import { useState, useRef, useEffect } from 'react'
import type { DomainId } from '@/types/manual'

const DEMO_ANSWERS: Partial<Record<DomainId, string[]>> = {
  values: [
    "When we're at our best, everyone's laughing at the dinner table. The kids are telling us about their day, nobody's on a phone, and there's this easy warmth.",
    "Kindness is huge for us. We always say 'be kind first.' Also curiosity — we want our kids to ask questions and not be afraid of not knowing things.",
    "We're the family that takes the long way home. We'd rather have an adventure than be efficient. We prioritize being together over activities.",
    "We never go to bed angry — that's non-negotiable. And we always show up for each other's things, even if it's inconvenient.",
    "Honestly there's a gap between what we say we value and how we actually spend our time. We say family first but work creeps in constantly.",
    "I think our kids are absorbing good values — they're kind to others, curious, empathetic. But I worry about screen time undermining the deeper stuff.",
    "Our non-negotiables: honesty, showing up, being kind. Everything else we can negotiate on.",
    "The value I most want to instill is resilience — that it's okay to fail, what matters is getting back up.",
  ],
  communication: [
    "We try to talk things through but honestly we sometimes avoid the hard conversations. When things blow up, I'm usually the one to come back and repair.",
    "The biggest challenge is we talk past each other when stressed. I want to fix it, my partner wants to be heard first. We're working on that.",
    "Our repair strategy is a cool-down period, then one of us comes back with 'can we try that again?' It works most of the time.",
    "We communicate pretty well about the kids but less well about our own relationship. That's something we want to get better at.",
    "Family meetings happen Sunday nights — 15 minutes to go over the week. It really helps everyone feel prepared.",
    "The kids are getting old enough now that we need to shift how we communicate. Less directing, more discussing.",
    "Digital communication is a mess — texts get lost, nobody checks the shared calendar. We need a better system.",
    "I think the foundation is strong but we need more practice at the hard stuff — money, intimacy, fears.",
  ],
  connection: [
    "Pizza Friday is sacred — every Friday we make pizza together from scratch. The kids each get to design their own. It's been going since our oldest was 3.",
    "Connection-wise, we're strong with family bonding but my partner and I need more couple time. Date nights happen maybe once a month.",
    "The biggest challenge is screen time eroding quality time. We'll be 'together' but everyone's on a device.",
    "Bedtime reading is another ritual we love. Each kid picks a book and we all pile into the big bed.",
    "We don't have enough one-on-one time with each kid. Group activities are easy but individual connection gets lost.",
    "Seasonal traditions matter a lot — apple picking in fall, beach week in summer. Those anchor our year.",
    "We're good at fun connection but not great at emotional connection. Surface level is easy, depth is harder.",
    "Extended family relationships are complicated. We want to be close but boundaries are fuzzy.",
  ],
  roles: [
    "I cook, she handles school logistics. Neither of us loves cleaning so we do that together on Saturdays. Finances are mostly me.",
    "The pain point is the mental load. Even though we split tasks, one person carries most of the planning and anticipating.",
    "Big decisions we make together — if one person feels strongly against something, we don't do it. Small stuff, whoever cares more decides.",
    "The roles are working okay overall, but we need to be more intentional about redistributing when things get unbalanced.",
    "Invisible labor is real — remembering appointments, buying gifts, planning meals, noticing when we're low on supplies. That all falls on one person.",
    "The kids have minimal responsibilities right now. We need to change that — they're old enough to contribute meaningfully.",
    "When one of us is sick or traveling, everything falls apart because the other person doesn't know the systems.",
    "We've never explicitly discussed who does what — it just evolved. Maybe it's time to be intentional about it.",
  ],
  organization: [
    "Our mornings are chaos. Everyone's stressed, things get forgotten, and by the time we're out the door we're already drained.",
    "The kitchen is well organized — we have systems for meal planning and groceries. But the mudroom, garage, kids' rooms? Disaster zones.",
    "We've tried chore charts, apps, all of it. Nothing sticks for more than two weeks.",
    "Our laundry system is nonexistent — clean clothes live in baskets, nobody puts anything away. It drives me crazy.",
    "The house itself could work for us if we set it up right. Right now it works against us — things don't have homes, papers pile up.",
    "Digital organization is actually worse than physical. Files everywhere, no naming convention, can never find anything.",
    "We need landing zones — a place for keys, mail, backpacks, shoes. Everything just gets dumped wherever.",
    "The car is another disaster zone. Crumbs, wrappers, random toys. We clean it once a month and it's trashed in two days.",
  ],
  adaptability: [
    "When things change — schedule disruption, unexpected event — I handle it fine but my partner gets really stressed.",
    "Our best coping strategy is humor. When everything's going wrong, someone cracks a joke and it diffuses tension.",
    "Transitions are hard — Sunday to Monday, summer to school, any big change really. We need better bridges.",
    "We're not great at proactively planning for stress. We're reactive, and by then it's too late.",
    "COVID actually taught us we're more resilient than we thought. But it also showed our weak spots.",
    "The kids handle change differently — one rolls with it, the other melts down. We need different strategies for each.",
    "We don't have a crisis plan. When something big happens, we improvise. Sometimes that works, sometimes it doesn't.",
    "Energy management is something we've never discussed. By Friday we're running on fumes and that's when conflicts happen.",
  ],
  problemSolving: [
    "We tend to talk about problems endlessly. We're good at discussing but slow to actually decide and act.",
    "Conflict follows a pattern: tension builds, someone snaps, retreat to corners, then an olive branch. We rarely address root causes.",
    "We avoid talking about money until it becomes an emergency. That's our biggest blind spot.",
    "I think we need a better system for making decisions. Right now it's ad hoc and whoever pushes hardest wins.",
    "We're good at solving kid problems together but terrible at solving our own relationship problems.",
    "When we disagree on parenting, it turns into a bigger fight about respect and authority. Those escalate fast.",
    "We don't debrief after problems are solved. Same issues keep coming back because we never learn from them.",
    "The hardest problems to solve are the ones where there's no clear right answer — just trade-offs.",
  ],
  resources: [
    "Time is our scarcest resource. Both of us work, kids have activities, and there's never enough margin.",
    "We invest in experiences over things — that's a core principle. But we haven't protected family time from work creep.",
    "Our financial principle is save first, but in practice we're not doing that. There's a gap between values and spending.",
    "Energy management is something we've never really discussed. But it matters — it affects everything else.",
    "We say yes to too many things. Every weekend is packed and we never have downtime as a family.",
    "Childcare costs are crushing us right now. It's temporary but it's straining everything.",
    "We haven't aligned on financial goals beyond 'save more.' What are we saving for? We need to decide.",
    "I think we actually have enough resources — we just allocate them poorly. Time especially.",
  ],
}

interface ResponseInputProps {
  onSend: (message: string) => Promise<void> | void
  disabled?: boolean
  placeholder?: string
  domainId?: DomainId
  turnCount?: number
}

export function ResponseInput({ onSend, disabled, placeholder = 'Share your thoughts...', domainId, turnCount = 0 }: ResponseInputProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isDisabled = disabled || sending

  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
    }
  }, [text])

  useEffect(() => {
    if (!isDisabled) {
      textareaRef.current?.focus()
    }
  }, [isDisabled])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || isDisabled) return
    const message = text.trim()
    setSending(true)
    try {
      await onSend(message)
      setText('') // Only clear after successful send
    } catch {
      // Keep text in input so user doesn't lose their work
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleDemoFill = async () => {
    if (!domainId) return
    const answers = DEMO_ANSWERS[domainId]
    if (!answers) return
    const userTurnIndex = Math.floor(turnCount / 2)
    const answer = answers[userTurnIndex % answers.length]
    setSending(true)
    try {
      await onSend(answer)
    } catch {
      // Demo fill failure is non-critical
    } finally {
      setSending(false)
    }
  }

  const isDev = import.meta.env.DEV
  const hasText = text.trim().length > 0

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className={`relative rounded-xl border transition-colors ${
        isDisabled
          ? 'border-stone-100 bg-stone-50'
          : hasText
            ? 'border-stone-300 bg-white'
            : 'border-stone-200 bg-white'
      }`}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          placeholder={placeholder}
          rows={1}
          className="w-full px-4 py-3 pr-20 text-base md:text-lg leading-relaxed bg-transparent resize-none focus:outline-none disabled:opacity-40 placeholder:text-stone-300"
        />

        {/* Action buttons — inside the input, right-aligned */}
        <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
          {isDev && domainId && (
            <button
              type="button"
              onClick={handleDemoFill}
              disabled={isDisabled}
              className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-amber-600 bg-amber-50 rounded-md hover:bg-amber-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Fill demo answer"
            >
              Demo
            </button>
          )}
          <button
            type="submit"
            disabled={!hasText || isDisabled}
            className={`p-2 rounded-lg transition-all ${
              hasText && !isDisabled
                ? 'bg-stone-900 text-white hover:bg-stone-800'
                : 'bg-stone-100 text-stone-300 cursor-not-allowed'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      <p className="mt-1.5 text-[11px] text-stone-300 px-1">
        Press Enter to send, Shift+Enter for new line
      </p>
    </form>
  )
}
