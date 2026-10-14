// The wall page's side of the Pi's listener (infra/wall-listener): a local
// WebSocket. The listener owns the microphone and the speaker; the page gets
// only the words said after "Hey Symphony" or a tap, and sends back what to
// say. Elsewhere (no listener running) it stays quietly disconnected and the
// wall works as before.

import { useCallback, useEffect, useRef, useState } from 'react'

export type ListenerState = 'starting' | 'ready' | 'listening' | 'thinking' | 'speaking' | 'muted' | 'quiet'
export interface Heard { id: string; text: string; via: 'wake' | 'tap' }

export interface WallListener {
  connected: boolean
  state: ListenerState
  muted: boolean
  quiet: boolean
  /** The wake phrase it answers to ("Hey Symphony"), or null for tap only. */
  wake: string | null
  listen: () => void
  /** A tap while listening: done, send what was said now. */
  finish: () => void
  /** Drop what is being heard. */
  cancel: () => void
  mute: (on: boolean) => void
  say: (text: string) => void
  /** Speech audio made by the app (a natural voice), played by the listener. */
  play: (wavBase64: string) => void
  done: () => void
}

export const LISTENER_URL = 'ws://127.0.0.1:8765'

export function useWallListener(onHeard: (h: Heard) => void, onNothing?: (reason: string) => void, url = LISTENER_URL): WallListener {
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<{ state: ListenerState; muted: boolean; quiet: boolean; wake: string | null }>({ state: 'starting', muted: false, quiet: false, wake: null })
  const ws = useRef<WebSocket | null>(null)
  const heard = useRef(onHeard)
  const nothing = useRef(onNothing)
  useEffect(() => { heard.current = onHeard; nothing.current = onNothing }, [onHeard, onNothing])

  useEffect(() => {
    if (typeof WebSocket === 'undefined') return
    let stopped = false
    let wait = 1000
    let timer: ReturnType<typeof setTimeout> | undefined
    const connect = () => {
      if (stopped) return
      let sock: WebSocket
      try { sock = new WebSocket(url) } catch { timer = setTimeout(connect, wait); return }
      ws.current = sock
      sock.onopen = () => { wait = 1000; setConnected(true) }
      sock.onmessage = (e) => {
        let m: Record<string, unknown>
        try { m = JSON.parse(String(e.data)) } catch { return }
        if (m.type === 'state') {
          setStatus({ state: (m.state as ListenerState) ?? 'ready', muted: !!m.muted, quiet: !!m.quiet, wake: (m.wake as string | null) ?? null })
        } else if (m.type === 'heard' && typeof m.text === 'string') {
          heard.current({ id: String(m.id ?? ''), text: m.text, via: m.via === 'tap' ? 'tap' : 'wake' })
        } else if (m.type === 'nothing') {
          nothing.current?.(String(m.reason ?? 'silence'))
        }
      }
      sock.onclose = () => {
        ws.current = null
        setConnected(false)
        if (stopped) return
        timer = setTimeout(connect, wait)
        wait = Math.min(wait * 2, 30_000)
      }
      sock.onerror = () => { /* onclose follows */ }
    }
    connect()
    return () => { stopped = true; clearTimeout(timer); ws.current?.close() }
  }, [url])

  const send = useCallback((m: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m))
  }, [])

  return {
    connected, ...status,
    listen: useCallback(() => send({ type: 'listen' }), [send]),
    finish: useCallback(() => send({ type: 'finish' }), [send]),
    cancel: useCallback(() => send({ type: 'cancel' }), [send]),
    mute: useCallback((on: boolean) => send({ type: 'mute', on }), [send]),
    say: useCallback((text: string) => send({ type: 'say', text }), [send]),
    play: useCallback((wav: string) => send({ type: 'play', wav }), [send]),
    done: useCallback(() => send({ type: 'done' }), [send]),
  }
}
