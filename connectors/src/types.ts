/** One message from a watched source, normalized across connectors. */
export interface ConnectorMessage {
  timestamp: Date
  sender: string
  text: string
}

/** A thread the connector is allowed to read. Sourced from capture_sources —
 * anything absent from this list is never buffered, read, or transmitted. */
export interface WatchedSource {
  connector: 'whatsapp' | 'classdojo'
  sourceKey: string
  sourceLabel: string
}

/** The body posted to capture-to-inbox. Mirrors that function's CaptureBody. */
export interface FlushPayload {
  user_email: string
  kind: 'whatsapp_export' | 'classdojo_thread'
  source_key: string
  source_label: string
  text: string
}

export interface Config {
  supabaseUrl: string
  serviceRoleKey: string
  captureSecret: string
  userEmail: string
  /** The Supabase auth user id these feeds belong to. */
  userId: string
  /** IANA zone the household lives in. Rendered timestamps are naive local
   * time in this zone — extract-capture compares them as strings. */
  timezone: string
  /** Volume mount path for WhatsApp auth state and high-water marks. */
  stateDir: string
  /** Local hours at which a flush runs. */
  flushHoursLocal: number[]
  /** ClassDojo credentials. Optional: the worker must still boot with
   * WhatsApp alone if ClassDojo is unconfigured. */
  classdojoEmail?: string
  classdojoPassword?: string
  /** A ClassDojo session cookie captured from a logged-in browser.
   * ClassDojo refuses scripted password logins from a datacenter IP, so
   * this is the working path. Seeds the persisted session on first boot. */
  classdojoCookie?: string
}
