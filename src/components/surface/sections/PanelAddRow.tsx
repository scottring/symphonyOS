import { MapPin, FileText, Camera, ListChecks, Link as LinkIcon, User, Phone, Mail } from 'lucide-react'

/** The fields a task can carry that aren't set yet. */
export type AddableField =
  | 'phone' | 'email' | 'location' | 'notes' | 'photo' | 'subtask' | 'link' | 'person'

const FIELD_META: Record<AddableField, { label: string; icon: typeof MapPin }> = {
  phone: { label: 'Phone', icon: Phone },
  email: { label: 'Email', icon: Mail },
  location: { label: 'Location', icon: MapPin },
  notes: { label: 'Notes', icon: FileText },
  photo: { label: 'Photo', icon: Camera },
  subtask: { label: 'Subtask', icon: ListChecks },
  link: { label: 'Link', icon: LinkIcon },
  person: { label: 'Person', icon: User },
}

interface Props {
  fields: AddableField[]
  onReveal: (field: AddableField) => void
}

/**
 * One quiet row standing in for every field the task doesn't have.
 *
 * The panel used to render each of these as a full titled section with an empty
 * input — six headers and six prompts asking for data before it told you
 * anything. That inverted the panel's job: it interrogated you at the moment you
 * had least reason to answer, and had nothing to say at the moment you needed
 * something. Empty fields are now a single line you can ignore, and a section
 * appears only once it has something in it.
 */
export function PanelAddRow({ fields, onReveal }: Props) {
  if (fields.length === 0) return null

  return (
    <section>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-300 mr-1">
          Add
        </span>
        {fields.map((field) => {
          const { label, icon: Icon } = FIELD_META[field]
          return (
            <button
              key={field}
              type="button"
              onClick={() => onReveal(field)}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-[13px] text-neutral-500 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-700"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
