const isDev = import.meta.env.DEV

export const logger = {
  debug(...args: unknown[]) {
    if (isDev) console.log(...args) // eslint-disable-line no-console
  },
  warn(...args: unknown[]) {
    console.warn(...args)
  },
  error(...args: unknown[]) {
    console.error(...args)
  },
}
