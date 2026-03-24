import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Clock, Users, Save, Loader2, Phone, Mail, FileText, CheckSquare, User, Mic, RefreshCw, AlertCircle } from 'lucide-react'
import type { MeetingState, AttendeeContext } from '@/hooks/useMeetingNotes'
import { useGranolaSync } from '@/hooks/useGranolaSync'
import { getCategoryLabel } from '@/types/contact'

// ============================================================================
// Sub-components
// ============================================================================

function AttendeeCard({ ctx }: { ctx: AttendeeContext }) {
  const [expanded, setExpanded] = useState(true)
  const { attendee, contact, recentNotes, recentTasks } = ctx

  const displayName = contact?.name || attendee.displayName || attendee.email
  const hasContext = recentNotes.length > 0 || recentTasks.length > 0

  return (
    <div className="border border-neutral-200 rounded-xl bg-bg-elevated overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-medium shrink-0">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-neutral-800 truncate">{displayName}</div>
          {contact?.category && (
            <div className="text-xs text-neutral-500">{getCategoryLabel(contact.category)}</div>
          )}
          {!contact && (
            <div className="text-xs text-neutral-400">{attendee.email}</div>
          )}
        </div>
        {attendee.responseStatus && attendee.responseStatus !== 'needsAction' && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            attendee.responseStatus === 'accepted'
              ? 'bg-green-50 text-green-600'
              : attendee.responseStatus === 'declined'
                ? 'bg-red-50 text-red-600'
                : 'bg-amber-50 text-amber-600'
          }`}>
            {attendee.responseStatus === 'accepted' ? 'Accepted'
              : attendee.responseStatus === 'declined' ? 'Declined'
              : 'Tentative'}
          </span>
        )}
        <svg
          className={`w-4 h-4 text-neutral-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-neutral-100">
          {contact && (
            <div className="pt-3 space-y-1.5">
              {contact.phone && (
                <div className="flex items-center gap-2 text-sm text-neutral-600">
                  <Phone className="w-3.5 h-3.5 text-neutral-400" />
                  <a href={`tel:${contact.phone}`} className="hover:text-primary-600 transition-colors">{contact.phone}</a>
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-2 text-sm text-neutral-600">
                  <Mail className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="truncate">{contact.email}</span>
                </div>
              )}
              {contact.notes && (
                <div className="text-sm text-neutral-500 mt-2 pl-5.5">{contact.notes}</div>
              )}
            </div>
          )}
          {!contact && (
            <div className="pt-3 text-sm text-neutral-400 italic">No matching contact found in Symphony</div>
          )}
          {recentNotes.length > 0 && (
            <div className="pt-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                <FileText className="w-3 h-3" /> Recent Notes
              </div>
              <div className="space-y-1.5">
                {recentNotes.map((note) => (
                  <div key={note.id} className="text-sm text-neutral-600 bg-neutral-50 rounded-lg px-3 py-2 line-clamp-3">
                    {note.title && <div className="font-medium text-neutral-700 mb-0.5">{note.title}</div>}
                    <div className="text-neutral-500">{note.content}</div>
                    <div className="text-xs text-neutral-400 mt-1">{note.updatedAt.toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {recentTasks.length > 0 && (
            <div className="pt-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                <CheckSquare className="w-3 h-3" /> Open Tasks
              </div>
              <div className="space-y-1">
                {recentTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 text-sm text-neutral-600 bg-neutral-50 rounded-lg px-3 py-2">
                    <div className={`w-3.5 h-3.5 rounded border ${task.completed ? 'bg-primary-500 border-primary-500' : 'border-neutral-300'}`} />
                    <span className="truncate">{task.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {contact && !hasContext && (
            <div className="pt-2 text-sm text-neutral-400 italic">No notes or tasks found for this contact</div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Granola Transcript Panel
// ============================================================================

function GranolaTranscriptPanel({
  transcript,
  granolaNotesMarkdown,
  granolaSummary,
}: {
  transcript: string[]
  granolaNotesMarkdown: string | null
  granolaSummary: string | null
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcript.length])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Granola AI summary */}
      {granolaSummary && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            AI Summary
          </div>
          <div className="text-sm text-neutral-700 leading-relaxed bg-primary-50/50 rounded-xl p-4 border border-primary-100">
            {granolaSummary}
          </div>
        </div>
      )}

      {/* Granola notes */}
      {granolaNotesMarkdown && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Granola Notes
          </div>
          <div className="text-sm text-neutral-700 leading-relaxed bg-neutral-50 rounded-xl p-4 whitespace-pre-wrap">
            {granolaNotesMarkdown}
          </div>
        </div>
      )}

      {/* Transcript */}
      {transcript.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Transcript ({transcript.length} lines)
          </div>
          <div className="space-y-1">
            {transcript.map((line, i) => {
              // Parse "Speaker: text" format
              const colonIdx = line.indexOf(':')
              const speaker = colonIdx > 0 ? line.slice(0, colonIdx) : null
              const text = colonIdx > 0 ? line.slice(colonIdx + 1).trim() : line

              return (
                <div key={i} className="text-sm leading-relaxed py-1">
                  {speaker && (
                    <span className="font-medium text-neutral-600 mr-1.5">{speaker}:</span>
                  )}
                  <span className="text-neutral-700">{text}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {transcript.length === 0 && !granolaNotesMarkdown && !granolaSummary && (
        <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm italic py-8">
          Waiting for Granola transcript...
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Granola Status Badge
// ============================================================================

function GranolaStatus({
  available,
  loading,
  hasMatch,
  onRetry,
}: {
  available: boolean | null
  loading: boolean
  hasMatch: boolean
  onRetry: () => void
}) {
  if (available === null || loading) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-100 text-neutral-500 text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Connecting to Granola...</span>
      </div>
    )
  }

  if (!available) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-600 text-xs">
        <AlertCircle className="w-3 h-3" />
        <span>Open Brain not running</span>
      </div>
    )
  }

  if (hasMatch) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-600 text-xs">
        <Mic className="w-3.5 h-3.5" />
        <span>Granola connected</span>
      </div>
    )
  }

  return (
    <button
      onClick={onRetry}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-600 text-xs hover:bg-amber-100 transition-colors"
    >
      <RefreshCw className="w-3 h-3" />
      <span>No Granola match — retry</span>
    </button>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface MeetingNotesViewProps {
  meeting: MeetingState
  onSaveNote: (content: string) => void
  onEndMeeting: () => void
}

export function MeetingNotesView({ meeting, onSaveNote, onEndMeeting }: MeetingNotesViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [localContent, setLocalContent] = useState(meeting.noteContent)
  const [activeTab, setActiveTab] = useState<'notes' | 'granola'>('notes')

  // Granola sync
  const granola = useGranolaSync(
    meeting.title,
    meeting.startTime,
  )

  // Auto-switch to Granola tab when a match is found
  useEffect(() => {
    if (granola.granolaMatch && activeTab === 'notes') {
      setActiveTab('granola')
    }
  // Only trigger when match first appears
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!granola.granolaMatch])

  // Sync content from meeting state when it changes externally
  useEffect(() => {
    if (meeting.noteContent !== localContent && !meeting.saving) {
      setLocalContent(meeting.noteContent)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.noteId])

  // Auto-focus textarea
  useEffect(() => {
    if (!meeting.loading && textareaRef.current && activeTab === 'notes') {
      textareaRef.current.focus()
    }
  }, [meeting.loading, activeTab])

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value
      setLocalContent(newContent)
      onSaveNote(newContent)
    },
    [onSaveNote]
  )

  // Append Granola content to notes when ending meeting
  const handleEndMeeting = useCallback(() => {
    const gm = granola.granolaMatch
    if (gm) {
      const parts: string[] = []
      if (localContent) parts.push(localContent)

      if (gm.summary) {
        parts.push('## AI Summary\n\n' + gm.summary)
      }
      if (gm.notesMarkdown) {
        parts.push('## Granola Notes\n\n' + gm.notesMarkdown)
      }
      if (gm.transcript.length > 0) {
        parts.push('## Transcript\n\n' + gm.transcript.join('\n'))
      }

      if (parts.length > (localContent ? 1 : 0)) {
        const newContent = parts.join('\n\n---\n\n')
        onSaveNote(newContent)
      }
    }

    onEndMeeting()
  }, [granola.granolaMatch, localContent, onSaveNote, onEndMeeting])

  const formatTime = (date?: Date) => {
    if (!date) return ''
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const formatDate = (date?: Date) => {
    if (!date) return ''
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  }

  const externalAttendees = meeting.attendeeContexts

  if (meeting.loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-3" />
          <p className="text-neutral-500">Preparing meeting context...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-bg-base">
      {/* Header */}
      <div className="border-b border-neutral-200 bg-bg-elevated px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleEndMeeting}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              title="End meeting"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-display font-semibold text-neutral-800">
                {meeting.title}
              </h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-neutral-500">
                {meeting.startTime && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {formatDate(meeting.startTime)} {formatTime(meeting.startTime)}
                      {meeting.endTime && ` - ${formatTime(meeting.endTime)}`}
                    </span>
                  </div>
                )}
                {externalAttendees.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>{externalAttendees.length} attendee{externalAttendees.length !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Granola status */}
            <GranolaStatus
              available={granola.available}
              loading={granola.loading}
              hasMatch={!!granola.granolaMatch}
              onRetry={granola.retryMatch}
            />

            {/* Save indicator */}
            {meeting.saving && (
              <div className="flex items-center gap-1.5 text-sm text-neutral-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </div>
            )}
            {!meeting.saving && meeting.noteId && localContent.length > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-neutral-400">
                <Save className="w-3.5 h-3.5" />
                <span>Saved</span>
              </div>
            )}

            {/* End meeting */}
            <button onClick={handleEndMeeting} className="btn-primary px-4 py-2 text-sm rounded-lg">
              End Meeting
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Context sidebar */}
        {externalAttendees.length > 0 && (
          <div className="w-[40%] min-w-[300px] max-w-[480px] border-r border-neutral-200 overflow-y-auto bg-bg-base">
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-600 mb-2">
                <User className="w-4 h-4" />
                <span>Meeting Context</span>
              </div>
              {externalAttendees.map((ctx, i) => (
                <AttendeeCard key={ctx.attendee.email || i} ctx={ctx} />
              ))}
            </div>
          </div>
        )}

        {/* Notes + Granola area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center border-b border-neutral-200 px-6 shrink-0">
            <button
              onClick={() => setActiveTab('notes')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'notes'
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              My Notes
            </button>
            <button
              onClick={() => setActiveTab('granola')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'granola'
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              Granola
              {granola.granolaMatch && (
                <span className="w-2 h-2 rounded-full bg-green-500" />
              )}
            </button>
          </div>

          {/* Tab content */}
          {activeTab === 'notes' ? (
            <div className="flex-1 p-6">
              <div className="max-w-3xl mx-auto h-full flex flex-col">
                <textarea
                  ref={textareaRef}
                  value={localContent}
                  onChange={handleContentChange}
                  placeholder="Start taking notes..."
                  className="
                    flex-1 w-full resize-none
                    input-base
                    text-base leading-relaxed
                    p-4 rounded-xl
                    border border-neutral-200
                    focus:border-primary-300 focus:ring-1 focus:ring-primary-200
                    placeholder:text-neutral-300
                  "
                />
              </div>
            </div>
          ) : granola.granolaMatch ? (
            <GranolaTranscriptPanel
              transcript={granola.granolaMatch.transcript}
              granolaNotesMarkdown={granola.granolaMatch.notesMarkdown || null}
              granolaSummary={granola.granolaMatch.summary}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-sm">
                {granola.available === false ? (
                  <>
                    <AlertCircle className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                    <p className="text-neutral-500 mb-1">Open Brain server not running</p>
                    <p className="text-sm text-neutral-400">
                      Start Open Brain locally (<code className="bg-neutral-100 px-1.5 py-0.5 rounded text-xs">npm run dev</code> in open-brain-ui) to connect Granola transcripts.
                    </p>
                  </>
                ) : granola.loading ? (
                  <>
                    <Loader2 className="w-8 h-8 text-neutral-400 animate-spin mx-auto mb-3" />
                    <p className="text-neutral-500">Looking for Granola meeting...</p>
                  </>
                ) : (
                  <>
                    <Mic className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                    <p className="text-neutral-500 mb-1">No Granola match found yet</p>
                    <p className="text-sm text-neutral-400 mb-4">
                      Make sure Granola is recording this meeting. It may take a moment to appear.
                    </p>
                    <button
                      onClick={granola.retryMatch}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 text-primary-600 text-sm font-medium hover:bg-primary-100 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
