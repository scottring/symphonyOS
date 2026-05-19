// src/components/schedule/ScratchpadPane.tsx
//
// Persistent quick scratchpad that fills the right rail when no detail pane is
// open on the Today view. Autosaves to localStorage with a 500 ms debounce.
// No props required — fully self-contained.

import { useState, useEffect, useRef, useCallback } from 'react';
import { PanelRightClose } from 'lucide-react';
import { useScratchpadHidden } from '@/hooks/useScratchpadHidden';

const STORAGE_KEY = 'symphony-scratchpad';

type SaveStatus = 'saved' | 'saving';

export function ScratchpadPane() {
  const { setHidden } = useScratchpadHidden();
  const [text, setText] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  // pendingText holds the value that needs to be written to localStorage.
  // It is set synchronously in the onChange handler (not in an effect body)
  // and cleared after the debounced write completes.
  const pendingTextRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced localStorage write — triggered only when text changes
  useEffect(() => {
    if (pendingTextRef.current === null) return;
    const value = pendingTextRef.current;

    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, value);
      } catch {
        // Ignore storage errors (private browsing, quota exceeded)
      }
      setSaveStatus('saved');
      pendingTextRef.current = null;
      debounceRef.current = null;
    }, 500);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [text]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    pendingTextRef.current = value;
    setSaveStatus('saving');
    setText(value);
  }, []);

  return (
    <div className="bg-bg-elevated rounded-2xl p-6 h-full w-full flex flex-col transition-shadow duration-200 focus-within:shadow-[0_12px_36px_-10px_rgba(60,50,30,0.22)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2 className="font-display text-lg text-neutral-900">Scratchpad</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-400" aria-live="polite">
            {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
          </span>
          <button
            onClick={() => setHidden(true)}
            aria-label="Hide scratchpad"
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <PanelRightClose size={16} />
          </button>
        </div>
      </div>

      {/* Textarea */}
      <label className="sr-only" htmlFor="scratchpad-textarea">
        Scratchpad
      </label>
      <textarea
        id="scratchpad-textarea"
        aria-label="Scratchpad"
        className="flex-1 w-full resize-none bg-transparent text-[15px] text-neutral-800 leading-relaxed placeholder:text-neutral-400 focus:outline-none"
        placeholder="Jot anything down — saved automatically."
        value={text}
        onChange={handleChange}
      />
    </div>
  );
}
