// src/apps/job-pipeline/data/useApplications.ts
import { useMemo } from 'react';
import { applications } from 'virtual:vault-applications';
import type { ParsedApplication } from '../../../../vite/parse-application-file';

export function useApplications(): {
  applications: ParsedApplication[];
  byStatus: Record<ParsedApplication['status'], ParsedApplication[]>;
  stalled: ParsedApplication[];
} {
  return useMemo(() => {
    const byStatus = {
      'looking-at': [] as ParsedApplication[],
      applied: [] as ParsedApplication[],
      interviewing: [] as ParsedApplication[],
      decided: [] as ParsedApplication[],
    };
    const stalled: ParsedApplication[] = [];
    for (const app of applications) {
      byStatus[app.status].push(app);
      if (app.isStalled) stalled.push(app);
    }
    // Sort
    byStatus['looking-at'].sort((a, b) =>
      (a.next_step_due ?? '￿').localeCompare(b.next_step_due ?? '￿'),
    );
    byStatus.applied.sort((a, b) =>
      (b.applied ?? '').localeCompare(a.applied ?? ''),
    );
    byStatus.interviewing.sort((a, b) =>
      (a.next_step_due ?? '￿').localeCompare(b.next_step_due ?? '￿'),
    );
    byStatus.decided.sort((a, b) => b.created.localeCompare(a.created));
    stalled.sort((a, b) =>
      (a.next_step_due ?? '').localeCompare(b.next_step_due ?? ''),
    );
    return { applications, byStatus, stalled };
  }, []);
}
