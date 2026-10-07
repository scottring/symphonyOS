// A task's icon, chosen from what it is (Scott, 2026-10-07: "smart icons for
// the regular cards — like having photos on dinner cards, but with icons that
// smartly match the task"). Rules, not a model: fast, free, the same icon for
// the same task every time, and offline.
//
// In order: the words of the title (the most specific signal — "Call", "Bank",
// "Dentist"), then what is attached (a phone number, an address, a link),
// then what kind of thing it is (an event, a routine, homework), then its
// life area. Every task gets one.
import {
  Phone, Landmark, Plane, BedDouble, CalendarDays, Package, Shirt, BookOpen, Calculator,
  Folder, Car, Droplets, Laptop, LineChart, House, Pill, Users, Leaf, Mail, Wrench,
  ShoppingBag, Utensils, Snowflake, Dumbbell, Stethoscope, Scissors, GraduationCap,
  Baby, Dog, Gift, Receipt, CreditCard, ShoppingCart, ChefHat, Music, Palette, Trophy,
  MapPin, Link2, Repeat, Briefcase, User, Sparkles, Trash2, WashingMachine, Shovel,
  Wifi, FileText, PenLine, MessageCircle, Camera, Heart, PartyPopper, Bike, Plug,
  type LucideIcon,
} from 'lucide-react'

/** First match wins, so the more specific rules come first. */
const TITLE_RULES: [RegExp, LucideIcon][] = [
  [/\b(call|phone|ring|voicemail)\b/i, Phone],
  [/\b(text|message|whats ?app|dm)\b/i, MessageCircle],
  [/\b(e-?mail|inbox|reply)\b/i, Mail],
  // A form to sign, a slip to send back: paperwork — not shopping, and not the trip it is for ("sign and
  // return the field trip form" wore a shopping bag — 2026-10-07).
  [/\b(sign|signed|permission slip|slip|forms?)\b/i, Folder],
  [/\b(bank|cashier'?s check|deposit|atm|loan|mortgage)\b/i, Landmark],
  [/\b(pay|bill|invoice|venmo|tuition)\b/i, CreditCard],
  [/\b(tax|taxes|receipt|reimburse|budget|financial|finances?)\b/i, Receipt],
  [/\b(doctor|dr\.?|pediatrician|sleep study|clinic|appointment|checkup|physical)\b/i, Stethoscope],
  [/\b(pharmacy|walgreens|cvs|prescription|meds?|medicine|pill)\b/i, Pill],
  [/\b(dentist|orthodont)/i, Stethoscope],
  [/\b(haircut|barber|salon)\b/i, Scissors],
  [/\b(therapist|therapy|counsel|couples)\b/i, Users],
  [/\b(flight|fly|trip|vacation|travel|hotel|airbnb|passport)\b/i, Plane],
  [/\b(winter break|december|christmas|snow|ski)\b/i, Snowflake],
  [/\b(thanksgiving|dinner|lunch|breakfast|meal|cook|recipe|bake)\b/i, Utensils],
  [/\b(groceries|grocery|costco|trader joe'?s?|market)\b/i, ShoppingCart],
  [/\b(buy|order|amazon|shop|returns?)\b/i, ShoppingBag],
  [/\b(fedex|ups|usps|package|delivery|ship)\b/i, Package],
  [/\b(laundry|clothes|closet|shirt|uniform|outfit|wear)\b/i, Shirt],
  [/\b(tidy|clean|declutter|organi[sz]e|vacuum|dust)\b/i, Sparkles],
  [/\b(trash|garbage|recycling|compost)\b/i, Trash2],
  [/\b(washer|dryer|dishwasher)\b/i, WashingMachine],
  [/\b(bed|bedroom|bedtime|sleep|nap)\b/i, BedDouble],
  [/\b(shower|bath)\b/i, Droplets],
  [/\b(fix|repair|hang|install|holes?|paint(?!ing class)|drill|assemble)\b/i, Wrench],
  [/\b(garden|plants?|yard|lawn|mow|weed|rake|leaves)\b/i, Leaf],
  [/\b(shovel|gutter)\b/i, Shovel],
  [/\b(car|drive|pick ?up|drop ?off|carpool|oil change|tires?)\b/i, Car],
  [/\b(bike|cycling)\b/i, Bike],
  [/\b(math|maths|calculat)/i, Calculator],
  [/\b(read|reading|book|library|spelling|study|homework|worksheet)\b/i, BookOpen],
  [/\b(school|teacher|class|campus|pta|pto|enroll)\b/i, GraduationCap],
  [/\b(folder|file|paper|papers|forms?|sign up|signup|register|application|apply)\b/i, Folder],
  [/\b(write|draft|letter|essay|journal)\b/i, PenLine],
  [/\b(laptop|computer|website|account|password|setup|set up|login)\b/i, Laptop],
  [/\b(wifi|router|internet)\b/i, Wifi],
  [/\b(charger|battery|plug)\b/i, Plug],
  [/\b(boxing|gym|workout|run|running|yoga|exercise|swim|practice)\b/i, Dumbbell],
  [/\b(baseball|soccer|game|match|tournament)\b/i, Trophy],
  [/\b(music|piano|guitar|violin|concert)\b/i, Music],
  [/\b(art|draw|craft)\b/i, Palette],
  [/\b(birthday|bday|party|celebrat)/i, PartyPopper],
  [/\b(gift|present)\b/i, Gift],
  [/\b(photo|picture|camera)\b/i, Camera],
  [/\b(baby|babysit|sitter|nanny)\b/i, Baby],
  [/\b(dog|cat|vet|walk the)\b/i, Dog],
  [/\b(date night|anniversary|connect)\b/i, Heart],
  [/\b(mail|paper mail|post office)\b/i, Mail],
  [/\b(document|doc|notes?|report|review|plan)\b/i, FileText],
  [/\b(house|home|move|moving)\b/i, House],
  [/\b(chart|metrics|numbers|spreadsheet)\b/i, LineChart],
  [/\b(chef|kitchen)\b/i, ChefHat],
]

export interface TaskIconInput {
  title: string
  /** 'task' | 'event' | 'routine' | 'routine-collection' */
  type?: string
  category?: string | null
  phoneNumber?: string | null
  location?: string | null
  links?: readonly unknown[] | null
  context?: string | null
}

export function taskIconFor(t: TaskIconInput): LucideIcon {
  for (const [re, icon] of TITLE_RULES) if (re.test(t.title)) return icon
  if (t.phoneNumber) return Phone
  if (t.location) return MapPin
  if (t.links && t.links.length) return Link2
  if (t.type === 'event' || t.category === 'event') return CalendarDays
  if (t.category === 'homework') return BookOpen
  if (t.category === 'errand') return Car
  if (t.category === 'chore') return Sparkles
  if (t.type === 'routine' || t.type === 'routine-collection') return Repeat
  if (t.context === 'work') return Briefcase
  if (t.context === 'personal') return User
  return t.context === 'family' ? House : Folder
}
