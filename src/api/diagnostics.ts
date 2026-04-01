/**
 * Diagnostics API client. Base URL from env or default (local backend).
 */
import type { ActiveClaimRow } from "../types/diagnostics";

// Backend URL. Default: localhost:8001 (port 8000 reserved). Set VITE_API_URL to override.
const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL) ||
  "http://localhost:8001";

export { API_BASE };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  if (!contentType.includes("application/json") || text.trimStart().startsWith("<")) {
    const msg = text.trimStart().startsWith("<")
      ? "Backend not responding with JSON. Start it (e.g. run start_services.ps1 or: .\\venv\\Scripts\\Activate.ps1; python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001) then check http://localhost:8001/health"
      : `Unexpected response (${contentType})`;
    throw new Error(msg);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON from API");
  }

  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : body && typeof body === "object" && "detail" in body
          ? String((body as { detail: unknown }).detail)
          : res.statusText;
    throw new Error(msg);
  }
  return body as T;
}

/**
 * Incremental updates: FINAL records with endedAtMs > since. Sorted ascending.
 * If since is null/undefined, returns newest `limit` items.
 * Returns raw list items (use diagnosticToClaimRow for list display).
 */
export function fetchDiagnosticsUpdates(
  since: number | null | undefined,
  limit: number = 50
): Promise<RawListItem[]> {
  const params = new URLSearchParams();
  if (since != null) params.set("since", String(since));
  params.set("limit", String(limit));
  const url = `${API_BASE}/api/diagnostics/updates?${params}`;
  return getJson<RawListItem[]>(url);
}

/**
 * Full FINAL record for a ticket. GET /api/diagnostics/{ticketNo} only.
 * Returns the raw record dict (normalized Decimals); modal maps fields.
 */
export function fetchDiagnosticByTicket(ticketNo: string): Promise<Record<string, unknown>> {
  const url = `${API_BASE}/api/diagnostics/${encodeURIComponent(ticketNo)}`;
  return getJson<Record<string, unknown>>(url);
}

/** Raw list item from API — PLUMBING_DIAGNOSTIC record shape. */
type RawListItem = {
  ticketNo: string;
  savedAtMs?: number;
  callerNumber?: string;
  plumbingDiagnostic?: {
    description?: string;
    location?: string;
    change_task_status?: string;
  };
};

/**
 * Map API diagnostic record to list row.
 * coveredItem  ← plumbingDiagnostic.description
 * propertyAddress ← plumbingDiagnostic.location
 * ticketStatus ← plumbingDiagnostic.change_task_status
 * callerNumber ← callerNumber (Twilio E.164)
 */
export function diagnosticToClaimRow(item: RawListItem): ActiveClaimRow {
  const pd = item.plumbingDiagnostic;
  return {
    ticketNo: item.ticketNo,
    coveredItem: pd?.description ?? "",
    propertyAddress: pd?.location ?? "",
    ticketStatus: pd?.change_task_status,
    savedAtMs: item.savedAtMs,
    callerNumber: item.callerNumber,
  };
}
