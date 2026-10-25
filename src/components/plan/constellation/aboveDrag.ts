// A goal of the level above in flight, from the strip to this period's list.

/** Carries the dragged goal's node key. */
export const ABOVE_MIME = 'application/x-symphony-above-goal'
export const isAboveDrag = (dt: DataTransfer | null) => !!dt && Array.from(dt.types).includes(ABOVE_MIME)
