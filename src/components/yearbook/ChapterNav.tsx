// ChapterNav — Sticky chapter navigation using IntersectionObserver
// Highlights the currently visible chapter as user scrolls

import { useEffect, useRef, useState } from 'react'
import type { YearbookChapter } from '@/types/yearbook'

interface ChapterNavProps {
  chapters: YearbookChapter[]
}

export function ChapterNav({ chapters }: ChapterNavProps) {
  const [activeId, setActiveId] = useState<string | null>(chapters[0]?.id ?? null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (chapters.length === 0) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the first intersecting entry (most visible chapter)
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace('chapter-', '')
            setActiveId(id)
            break
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    )

    // Observe all chapter sections
    for (const chapter of chapters) {
      const el = document.getElementById(`chapter-${chapter.id}`)
      if (el) observerRef.current.observe(el)
    }

    return () => observerRef.current?.disconnect()
  }, [chapters])

  const scrollToChapter = (chapterId: string) => {
    const el = document.getElementById(`chapter-${chapterId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (chapters.length <= 1) return null

  return (
    <nav className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-stone-100 -mx-4 px-4 md:-mx-8 md:px-8">
      <div className="flex gap-1 overflow-x-auto py-2.5 scrollbar-hide">
        {chapters.map(chapter => (
          <button
            key={chapter.id}
            onClick={() => scrollToChapter(chapter.id)}
            className={`text-sm px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
              activeId === chapter.id
                ? 'bg-stone-900 text-white font-medium'
                : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
            }`}
          >
            {chapter.title}
          </button>
        ))}
      </div>
    </nav>
  )
}
