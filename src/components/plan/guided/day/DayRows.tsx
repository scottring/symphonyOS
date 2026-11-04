// The Day session's picture of the day, as the page shows it under its
// filters: the count the guide is told (dayCount). The look back's rows that
// stood here went with "From yesterday" (Task 4, 2026-11-04): yesterday's
// unfinished tasks are back on the week sheet beside the day.

export interface DayPictureItem { key: string; time?: string; title: string; kind: 'event' | 'task' | 'routine' }
