// src/components/planning/guided/stepTypes/index.ts
// Side-effect module: registers every step type with the shell.
import { registerStepType } from '../GuidedSession'
import { NarrationStep } from './NarrationStep'
import { ReflectStep } from './ReflectStep'
import { ReviewStep } from './ReviewStep'
import { LookAboveStep } from './LookAboveStep'
import { CalendarStep } from './CalendarStep'
import { WriteListStep } from './WriteListStep'
import { InboxStep } from './InboxStep'
import { ScheduleGridStep } from './ScheduleGridStep'
import { DomainsGoalsStep } from './DomainsGoalsStep'
import { BookNextStep } from './BookNextStep'

registerStepType('narration', NarrationStep)
registerStepType('reflect', ReflectStep)
registerStepType('review', ReviewStep)
registerStepType('look-above', LookAboveStep)
registerStepType('calendar', CalendarStep)
registerStepType('write-list', WriteListStep)
registerStepType('inbox', InboxStep)
registerStepType('schedule-grid', ScheduleGridStep)
registerStepType('domains-goals', DomainsGoalsStep)
registerStepType('book-next', BookNextStep)
