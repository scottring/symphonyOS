import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { mealHandoffRule } from "./mealHandoff.ts"

Deno.test("mealHandoffRule instructs the meal-request block + no refusal", () => {
  assertStringIncludes(mealHandoffRule, ":::meal-request")
  assertStringIncludes(mealHandoffRule, "do NOT answer it from notes")
  assert(!/I (don't|do not) have access/i.test(mealHandoffRule))
  // block delimiters must be on their own lines
  assert(/:::meal-request\s*\n[\s\S]*\n:::/.test(mealHandoffRule), "block delimiters must be on their own lines")
})
