import { lazy } from 'react'

// Project views
export const ProjectsList = lazy(() =>
  import('./project/ProjectsList').then(m => ({ default: m.ProjectsList }))
)
export const ProjectView = lazy(() =>
  import('./project/ProjectView').then(m => ({ default: m.ProjectView }))
)

// Routine views
export const RoutinesList = lazy(() =>
  import('./routine/RoutinesList').then(m => ({ default: m.RoutinesList }))
)
export const RoutineForm = lazy(() =>
  import('./routine/RoutineForm').then(m => ({ default: m.RoutineForm }))
)
export const RoutineInput = lazy(() =>
  import('./routine/RoutineInput').then(m => ({ default: m.RoutineInput }))
)

// Task view (desktop)
export const TaskView = lazy(() =>
  import('./task/TaskView').then(m => ({ default: m.TaskView }))
)

// Recipe viewer
export const RecipeViewer = lazy(() =>
  import('./recipe/RecipeViewer').then(m => ({ default: m.RecipeViewer }))
)

// Auth (only for logged-out state)
export const AuthForm = lazy(() =>
  import('./AuthForm').then(m => ({ default: m.AuthForm }))
)

// Calendar connect banner
export const CalendarConnect = lazy(() =>
  import('./CalendarConnect').then(m => ({ default: m.CalendarConnect }))
)
