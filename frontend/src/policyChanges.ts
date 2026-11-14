// Public /changes/ log. Only real Task 2 records belong here.
// Verdict-direction changes need elliotApproved before they may appear.
export interface PolicyChange {
  id: string;
  date: string; // YYYY-MM-DD (UTC)
  toolName: string;
  toolDomain: string;
  summary: string;
  sourceUrl: string;
  verdictDirectionChanged: boolean;
  elliotApproved?: boolean;
}

export function isPublishable(c: PolicyChange): boolean {
  if (c.verdictDirectionChanged && !c.elliotApproved) return false;
  return Boolean(c.date && c.toolDomain && c.summary && c.sourceUrl);
}

export function publishedChanges(rows: PolicyChange[]): PolicyChange[] {
  return rows.filter(isPublishable).sort((a, b) => b.date.localeCompare(a.date) || a.toolDomain.localeCompare(b.toolDomain));
}
