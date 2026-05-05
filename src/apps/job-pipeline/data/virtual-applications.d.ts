declare module 'virtual:vault-applications' {
  import type { ParsedApplication } from '../../../../vite/parse-application-file';
  export const applications: ParsedApplication[];
}
