// Ambient declaration for the `virtual:vault-applications` module exposed by
// the `vaultApplicationsPlugin` Vite plugin. We re-state the relevant type
// shape inline (rather than re-importing `ParsedApplication`) because the
// TypeScript bundler resolver skips `virtual:` URI-style specifiers and only
// consults this ambient declaration when the file remains a script.
declare module 'virtual:vault-applications' {
  export interface VaultApplication {
    slug: string;
    type: 'task';
    domain: 'job-search';
    status: 'looking-at' | 'applied' | 'interviewing' | 'decided';
    decision?: 'rejected' | 'accepted' | 'withdrawn';
    company: string;
    role: string;
    comp_low: number | null;
    comp_high: number | null;
    location: string | null;
    remote: 'onsite' | 'hybrid' | 'remote' | null;
    applied: string | null;
    next_step: string | null;
    next_step_due: string | null;
    created: string;
    tags: string[];
    linked: string[];
    filename: string;
    body: string;
    isStalled: boolean;
  }
  export const applications: VaultApplication[];
}
