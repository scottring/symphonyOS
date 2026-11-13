// src/lib/today/itemIcon.ts
//
// One small ink icon per row on Today, saying what kind of thing it is
// (Scott, 2026-11-13: "more visually engaging", with the rule that a picture
// must tell you something). Fixed rules over the title; nothing generated.
// No rule matches: no icon, rather than a generic one on every row.
import type { LucideIcon } from 'lucide-react'
import {
  Banknote, Briefcase, Cake, Car, Dumbbell, FileText, Hammer, Heart, Moon, PackageOpen,
  Phone, Plane, School, ShoppingBasket, Stethoscope, Truck, UtensilsCrossed, Users,
} from 'lucide-react'

const RULES: [RegExp, LucideIcon][] = [
  [/\breturns?\b/i, PackageOpen],
  [/\b(deliver|delivery|arriv(es|ing)|package)\b/i, Truck],
  [/\b(pay|deposit|invoice|bill|tax(es)?)\b|\$\d/i, Banknote],
  [/\b(doctor|dentist|neuro\w*|appointment|clinic|therapy|physio|med(s|ication)?)\b/i, Stethoscope],
  [/\b(call|zoom|teams|meet|phone)\b/i, Phone],
  [/\b(pick ?up|drop[- ]?off|school|class|test|homework|slip)\b/i, School],
  [/\b(drive|carpool)\b/i, Car],
  [/\b(dinner|lunch|breakfast|meal|feed|cook)\b/i, UtensilsCrossed],
  [/\b(grocer(y|ies)|shop(ping)?)\b/i, ShoppingBasket],
  [/\b(bed ?time|sleep)\b/i, Moon],
  [/\b(boxing|gym|workout|run|swim|yoga|strength|training)\b/i, Dumbbell],
  [/\b(renovat\w*|contractor|repair|fix|project|bath(room)?|install)\b/i, Hammer],
  [/\b(birthday|party)\b/i, Cake],
  [/\b(flight|trip|travel|airport)\b/i, Plane],
  [/\b(application|apply|send|email|draft|report|proposal)\b/i, FileText],
  [/\b(grand(ma|pa|pappa|mother|father)|grampappa|visit|family)\b/i, Heart],
  [/\b(sappi|stacks|client|work)\b/i, Briefcase],
  [/\b(meeting|sync|standup|1:1)\b/i, Users],
]

export function itemIcon(title: string): LucideIcon | null {
  for (const [re, icon] of RULES) if (re.test(title)) return icon
  return null
}
