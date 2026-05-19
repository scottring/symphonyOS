/** Time-of-day greeting. `name` may be a full name; only the first token is used. */
export function greetingForHour(hour: number, name: string): string {
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = (name || '').trim().split(' ')[0]
  return firstName ? `${part}, ${firstName}` : part
}
