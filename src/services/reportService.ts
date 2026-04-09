import { API_BASE } from "../api/diagnostics";
import type { ReportData, AccuracySummary } from "../types/report";

/** POST /conversation-report/{conversationId} — generate (or retrieve cached) report from backend. */
export async function fetchConversationReport(conversationId: string): Promise<ReportData> {
  const url = `${API_BASE}/conversation-report/${encodeURIComponent(conversationId)}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to load report: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** GET /conversation-reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function fetchAccuracySummary(from: string, to: string): Promise<AccuracySummary> {
  const params = new URLSearchParams({ from, to });
  const url = `${API_BASE}/conversation-reports/summary?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to load accuracy summary: ${text.slice(0, 200)}`);
  }
  return res.json();
}
