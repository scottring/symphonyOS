// CallerIdTakeover — full-screen "Grandma is calling" overlay on the wall-v2
// kiosk, driven by the kid-phone bridge (Approach B) via useCurrentCall().
//
// Renders nothing when there is no live call. Inbound shows "{name} is calling";
// outbound shows "Calling {name}…". Blocked calls are never published upstream,
// so they never reach here. lucide-react icons only — no emoji (wall-v2 rule).

import { PhoneIncoming, PhoneOff, PhoneOutgoing } from 'lucide-react';
import { useCurrentCall, type CurrentCall } from '@/hooks/useCurrentCall';

/** Direction-aware headline. Exported for unit testing. */
export function callHeadline(call: Pick<CurrentCall, 'direction' | 'name'>): string {
  const who = call.name?.trim() || (call.direction === 'outbound' ? 'someone' : 'Someone');
  return call.direction === 'outbound' ? `Calling ${who}…` : `${who} is calling`;
}

function initialOf(name: string | null): string {
  return (name?.trim()?.charAt(0) || '?').toUpperCase();
}

export function CallerIdTakeover() {
  const { call, dismiss } = useCurrentCall();
  if (!call) return null;

  const outbound = call.direction === 'outbound';
  const Icon = outbound ? PhoneOutgoing : PhoneIncoming;

  return (
    <div
      role="dialog"
      aria-label={callHeadline(call)}
      className="fixed inset-0 z-[100] grid place-items-center bg-stone-900/95 backdrop-blur-sm animate-fade-in"
    >
      <div className="flex flex-col items-center gap-8 px-8 text-center">
        {/* Photo or beautiful gradient-initial placeholder */}
        <div className="relative">
          <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" aria-hidden="true" />
          {call.photo_url ? (
            <img
              src={call.photo_url}
              alt=""
              className="relative h-72 w-72 rounded-full border-4 border-white/80 object-cover shadow-2xl"
            />
          ) : (
            <span className="relative grid h-72 w-72 place-items-center rounded-full border-4 border-white/80 bg-gradient-to-br from-emerald-400 to-sky-500 font-display text-[7rem] font-bold text-white shadow-2xl">
              {initialOf(call.name)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-white">
          <Icon className="h-10 w-10 text-emerald-300" aria-hidden="true" />
          <h1 className="font-display text-6xl font-bold tracking-tight">{callHeadline(call)}</h1>
        </div>

        {call.number && (
          <p className="font-body text-2xl text-white/70">{call.number}</p>
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label="Hang up"
          className="mt-4 flex items-center gap-3 rounded-full bg-red-500/90 px-8 py-4 text-xl font-bold text-white shadow-xl hover:bg-red-500 transition-colors"
        >
          <PhoneOff className="h-6 w-6" aria-hidden="true" /> Hang up
        </button>
      </div>
    </div>
  );
}
