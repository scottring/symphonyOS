// A picture for each routine step on a kid's tablet (2026-10-22), so a kid
// who can't read yet can still follow the list. Read from the step's name;
// nothing is stored. First match wins, so the more specific words come first
// ("Dirty clothes in the hamper" is the hamper, not getting dressed; "Pull-up
// in the downstairs trash" is the trash; "Feed Jax dinner" is the dog).

export type StepIcon =
  | 'trash' | 'pullup' | 'hamper' | 'towel' | 'floor' | 'shower' | 'teeth' | 'toilet' | 'wash'
  | 'dressed' | 'shoes' | 'bag' | 'bed' | 'breakfast' | 'dishes' | 'read' | 'music' | 'lights'
  | 'pet' | 'math' | 'homework' | 'medicine' | 'tidy' | 'puzzle' | 'water' | 'step'

/** Whole words only (with an optional plural or -ed/-ing), so "cat" is not
 *  "vacation" and "eat" is not "repeat". */
const words = (...ws: string[]) => new RegExp(`\\b(?:${ws.join('|')})(?:s|es|ed|ing)?\\b`, 'i')

const RULES: [RegExp, StepIcon][] = [
  [words('trash', 'garbage', 'throw it away', 'throw away'), 'trash'],
  [words('pull-?up'), 'pullup'],
  [words('hamper', 'dirty clothes', 'laundry'), 'hamper'],
  [words('towel'), 'towel'],
  [words('floor', 'dry off', 'dry up'), 'floor'],
  [words('shower', 'bath'), 'shower'],
  [words('teeth', 'tooth', 'floss'), 'teeth'],
  [words('potty', 'toilet', 'bathroom'), 'toilet'],
  [words('wash', 'hands', 'face'), 'wash'],
  [words('shoe', 'jacket', 'coat', 'boot'), 'shoes'],
  [words('dress', 'get dressed', 'clothes', 'pajamas', 'pjs', 'underwear', 'sock'), 'dressed'],
  [words('bag', 'backpack', 'folder', 'pack'), 'bag'],
  [words('bed', 'make your bed'), 'bed'],
  [words('jax', 'dog', 'cat', 'feed', 'pet'), 'pet'],
  [words('breakfast', 'lunch', 'dinner', 'snack', 'eat'), 'breakfast'],
  [words('dish', 'plate', 'clean up your place', 'table'), 'dishes'],
  [words('read', 'reading', 'book', 'story', 'library'), 'read'],
  [words('yoto', 'music', 'piano', 'practice'), 'music'],
  [words('lights out', 'light out', 'sleep', 'good ?night'), 'lights'],
  [words('math'), 'math'],
  [words('homework', 'spelling', 'worksheet'), 'homework'],
  [words('vitamin', 'medicine', 'pill'), 'medicine'],
  [words('tidy', 'clean', 'straighten', 'toy'), 'tidy'],
  [words('puzzle'), 'puzzle'],
  [words('water', 'drink'), 'water'],
]

export function stepIcon(title: string): StepIcon {
  return RULES.find(([re]) => re.test(title))?.[1] ?? 'step'
}
