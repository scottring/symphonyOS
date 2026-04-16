import { useCallback, useEffect, useRef, useState } from 'react'
import {
    getDinnerPrompt,
    swapDinnerPrompt,
    reportDinnerPrompt,
    isRelishConfigured,
    type DinnerPrompt,
} from '@/lib/relish'

/**
 * Dinner-prompt card for the wall kiosk. Fetches one prompt per day from
 * the Relish API. Tap ↻ to swap. Long-press ↻ (1.2s) to report as
 * inappropriate.
 *
 * Keeps its own minimal state — no external store. Failures degrade calmly
 * (shows nothing; never blocks the wall).
 */

const LONG_PRESS_MS = 1200
const REFRESH_INTERVAL_MS = 30 * 60 * 1000 // re-check every 30 min

export function WallDinnerPromptWidget() {
    const [prompt, setPrompt] = useState<DinnerPrompt | null>(null)
    const [loading, setLoading] = useState(true)
    const [showReportConfirm, setShowReportConfirm] = useState(false)
    const longPressTimer = useRef<number | null>(null)
    const longPressFiredRef = useRef(false)

    const load = useCallback(async () => {
        if (!isRelishConfigured) {
            setLoading(false)
            return
        }
        const p = await getDinnerPrompt()
        setPrompt(p)
        setLoading(false)
    }, [])

    useEffect(() => {
        void load()
        const id = window.setInterval(() => void load(), REFRESH_INTERVAL_MS)
        const onVisibility = () => {
            if (document.visibilityState === 'visible') void load()
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
            window.clearInterval(id)
            document.removeEventListener('visibilitychange', onVisibility)
        }
    }, [load])

    const handleSwap = useCallback(async () => {
        const p = await swapDinnerPrompt()
        if (p) setPrompt(p)
    }, [])

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault()
        longPressFiredRef.current = false
        longPressTimer.current = window.setTimeout(() => {
            longPressFiredRef.current = true
            setShowReportConfirm(true)
        }, LONG_PRESS_MS)
    }, [])

    const clearLongPress = useCallback(() => {
        if (longPressTimer.current !== null) {
            window.clearTimeout(longPressTimer.current)
            longPressTimer.current = null
        }
    }, [])

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        e.preventDefault()
        clearLongPress()
        if (!longPressFiredRef.current) void handleSwap()
    }, [clearLongPress, handleSwap])

    const confirmReport = useCallback(async () => {
        setShowReportConfirm(false)
        await reportDinnerPrompt('kiosk long-press')
        // Server records the report + flags the library prompt; force a swap
        // to get something fresh on the wall.
        const p = await swapDinnerPrompt()
        if (p) setPrompt(p)
    }, [])

    const cancelReport = useCallback(() => {
        setShowReportConfirm(false)
    }, [])

    if (!isRelishConfigured) return null
    if (loading) {
        return (
            <div className="flex flex-col flex-1 opacity-50">
                <div className="text-[0.7rem] font-black uppercase tracking-widest text-white mb-1 font-display">
                    Tonight at dinner
                </div>
                <div className="text-white/40 text-xs">loading…</div>
            </div>
        )
    }
    if (!prompt) return null

    const isAdult = prompt.audience === 'adult'

    return (
        <div className="flex flex-col flex-1 relative">
            <div
                className="text-[0.7rem] font-black uppercase tracking-widest mb-1 font-display"
                style={{ color: isAdult ? '#F4C27A' : 'white' }}
            >
                {isAdult ? 'Tonight — just the two of you' : 'Tonight at dinner'}
            </div>

            <div className="flex items-center gap-3">
                <p
                    className="flex-1 font-display text-white/95 leading-snug"
                    style={{ fontSize: '1.1rem', fontStyle: 'italic' }}
                >
                    {prompt.text}
                </p>
                <button
                    type="button"
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={clearLongPress}
                    onPointerCancel={clearLongPress}
                    className="shrink-0 w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center text-white/70 text-base select-none"
                    style={{ touchAction: 'none' }}
                    aria-label="Swap prompt (long-press to report)"
                >
                    ↻
                </button>
            </div>

            <div className="mt-1 text-[0.55rem] uppercase tracking-wider text-white/30">
                {prompt.theme.replace(/-/g, ' ')}{prompt.source === 'synthesized' ? ' · personal' : ''}
            </div>

            {showReportConfirm && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl gap-4 z-20">
                    <p className="text-white text-lg font-display italic">Report this prompt as inappropriate?</p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={cancelReport}
                            className="px-5 py-2 rounded-full border border-white/20 text-white/80 text-sm hover:bg-white/5"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => void confirmReport()}
                            className="px-5 py-2 rounded-full bg-[#F26E63] text-white text-sm font-semibold hover:bg-[#e85c50]"
                        >
                            Report
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
