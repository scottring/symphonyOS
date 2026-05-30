// Whether planned meals (synthesized from the meal planner as `meal:` events)
// surface on the timeline surfaces — Today / Week / Month and the wall.
//
// Temporarily OFF: meals are hidden from those views until the meal planner is
// set up properly. This does NOT disable the Meals planner page — you can still
// plan meals; they just don't appear on the schedule/today/wall until this is
// flipped back to `true`.
// Typed as `boolean` (not the literal `false`) so flipping the flag doesn't make
// the guarded branches read as unreachable code to the compiler.
export const SHOW_PLANNED_MEALS_ON_TIMELINE: boolean = false
