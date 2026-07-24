// src/components/planning/guided/stepTypes/index.ts
// Side-effect module: registers every step type with the shell.
import { registerStepType } from '../GuidedSession'
import { NarrationStep } from './NarrationStep'
import { ReflectStep } from './ReflectStep'
import { ReviewStep } from './ReviewStep'
import { LookAboveStep } from './LookAboveStep'
import { ProjectsStep } from './ProjectsStep'
import { CalendarStep } from './CalendarStep'
import { WriteListStep } from './WriteListStep'
import { InboxStep } from './InboxStep'
import { ScheduleGridStep } from './ScheduleGridStep'
import { DomainsGoalsStep } from './DomainsGoalsStep'
import { BookNextStep } from './BookNextStep'
import { WinsStep } from './WinsStep'
import { MaintenanceStep } from './MaintenanceStep'
import { PickByGoalStep } from './PickByGoalStep'

registerStepType('narration', NarrationStep)
registerStepType('reflect', ReflectStep)
registerStepType('review', ReviewStep)
registerStepType('look-above', LookAboveStep)
registerStepType('projects', ProjectsStep)
registerStepType('calendar', CalendarStep)
registerStepType('write-list', WriteListStep)
registerStepType('inbox', InboxStep)
registerStepType('schedule-grid', ScheduleGridStep)
registerStepType('domains-goals', DomainsGoalsStep)
registerStepType('book-next', BookNextStep)
registerStepType('wins', WinsStep)
registerStepType('maintenance', MaintenanceStep)
registerStepType('pick-by-goal', PickByGoalStep)
