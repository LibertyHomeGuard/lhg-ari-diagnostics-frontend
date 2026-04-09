import { useState, useCallback, useEffect } from "react";
import { fetchAccuracySummary } from "../services/reportService";
import ReportModal from "./ReportModal";
import type { AccuracySummary, AccuracyCall, ReportStatus } from "../types/report";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDate(raw: string | number | null | undefined): string {
  if (raw == null) return "—";
  const d = typeof raw === "number" ? new Date(raw * 1000) : new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fmtDuration(secs: number | null | undefined): string {
  if (secs == null) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m === 0 ? `${s}s` : `${m}m ${s}s`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—%";
  return `${Math.round(n)}%`;
}

function scoreColor(score: number | null | undefined): string {
  const s = score ?? 0;
  return s >= 80 ? "text-emerald-400" : s >= 60 ? "text-amber-400" : "text-red-400";
}

function scoreToStatus(score: number | null | undefined): ReportStatus {
  if (score == null) return "fail";
  return score >= 80 ? "pass" : score >= 60 ? "warning" : "fail";
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-neutral-800 ${className}`} />;
}

function StatusPill({ status }: { status: ReportStatus }) {
  const cls =
    status === "pass"
      ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50"
      : status === "warning"
      ? "bg-amber-900/50 text-amber-300 border border-amber-700/50"
      : "bg-red-900/50 text-red-300 border border-red-700/50";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold capitalize ${cls}`}>
      {status}
    </span>
  );
}

type SeverityType = "CRITICAL" | "HIGH" | "MEDIUM";
function SeverityPill({ severity }: { severity: SeverityType }) {
  const cls =
    severity === "CRITICAL"
      ? "bg-red-900/70 text-red-300 border border-red-700/50"
      : severity === "HIGH"
      ? "bg-orange-900/60 text-orange-300 border border-orange-700/50"
      : "bg-amber-900/50 text-amber-300 border border-amber-700/50";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${cls}`}>
      {severity}
    </span>
  );
}

function StatCard({ label, value, valueClass = "text-white" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <p className="mb-1 text-xs text-neutral-500">{label}</p>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function BreakdownBar({ breakdown }: { breakdown: { pass: number; warning: number; fail: number } }) {
  const total = breakdown.pass + breakdown.warning + breakdown.fail;
  if (total === 0) return <div className="h-3 w-full rounded-full bg-neutral-800" />;
  return (
    <div className="space-y-1">
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        <div className="bg-emerald-500" style={{ width: `${(breakdown.pass / total) * 100}%` }} />
        <div className="bg-amber-500"   style={{ width: `${(breakdown.warning / total) * 100}%` }} />
        <div className="bg-red-500"     style={{ width: `${(breakdown.fail / total) * 100}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-neutral-500">
        <span className="text-emerald-500">{breakdown.pass}P</span>
        <span className="text-amber-500">{breakdown.warning}W</span>
        <span className="text-red-500">{breakdown.fail}F</span>
      </div>
    </div>
  );
}

function Skeletons() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0,1,2,3].map((i) => (
          <div key={i} className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
            <Sk className="mb-2 h-3 w-20" />
            <Sk className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
        <Sk className="mb-4 h-4 w-32" />
        {[0,1,2].map((i) => (
          <div key={i} className="mb-3 flex gap-4">
            <Sk className="h-4 w-24" /><Sk className="h-4 w-16" /><Sk className="h-4 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
        <Sk className="mb-4 h-4 w-40" />
        {[0,1,2,3,4].map((i) => (
          <div key={i} className="mb-3 flex items-center gap-3">
            <Sk className="h-4 flex-1" /><Sk className="h-4 w-12" /><Sk className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function AIAccuracyModal({ onClose }: { onClose: () => void }) {
  const now = new Date();
  const thirtyAgo = new Date(now);
  thirtyAgo.setDate(now.getDate() - 30);

  const [dateFrom, setDateFrom] = useState(toISODate(thirtyAgo));
  const [dateTo, setDateTo] = useState(toISODate(now));
  const [data, setData] = useState<AccuracySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportConvId, setReportConvId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAccuracySummary(dateFrom, dateTo);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  // Normalize backend shapes
  const agentBreakdown = (() => {
    const raw = data?.agent_breakdown;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as any[];
    const obj = raw as Record<string, { avg_score: number; pass_rate: string }>;
    return [
      { name: "Auth Agent",        ...obj.auth,        status: scoreToStatus(obj.auth?.avg_score) },
      { name: "Plumbing Agent",    ...obj.plumbing,    status: scoreToStatus(obj.plumbing?.avg_score) },
      { name: "Negotiation Agent", ...obj.negotiation, status: scoreToStatus(obj.negotiation?.avg_score) },
    ].filter((r) => r.avg_score != null);
  })();
  const topFlags = Array.isArray(data?.top_flags) ? data!.top_flags : [];
  const recentCalls = Array.isArray(data?.recent_calls) ? data!.recent_calls : [];
  const breakdown = data?.status_breakdown ?? { pass: 0, warning: 0, fail: 0 };
  const passRateNum = data
    ? (data.pass_rate ?? parseFloat(String(data.overall_pass_rate ?? "0")))
    : 0;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="flex min-h-full items-start justify-center p-4">
          <div
            className="relative w-full max-w-6xl rounded-xl border border-neutral-800 bg-[#0f0f0f] shadow-2xl"
            style={{ animation: "reportFadeIn 0.18s ease" }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-neutral-800 bg-[#0f0f0f] px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-white">AI Accuracy Dashboard</h2>
                <p className="text-xs text-neutral-500">Aggregate QA metrics across all calls</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-800 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">
              {/* Date range */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-500">From</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-500">To</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none" />
                </div>
                <button type="button" onClick={load} disabled={loading}
                  className="rounded-md bg-teal-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-50">
                  {loading ? "Loading…" : "Load"}
                </button>
              </div>

              {error && (
                <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>
              )}

              {loading && <Skeletons />}

              {!loading && !data && !error && (
                <div className="py-20 text-center text-sm text-neutral-500">Select a date range and click Load to view accuracy data.</div>
              )}

              {!loading && data && data.total_calls === 0 && (
                <div className="py-20 text-center text-sm text-neutral-500">No calls found for this date range.</div>
              )}

              {!loading && data && data.total_calls > 0 && (
                <div className="space-y-6">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <StatCard label="Total Calls" value={String(data.total_calls ?? 0)} />
                    <StatCard label="Average Score" value={String(data.average_score ?? 0)} valueClass={scoreColor(data.average_score)} />
                    <StatCard label="Pass Rate" value={fmtPct(passRateNum)}
                      valueClass={passRateNum >= 80 ? "text-emerald-400" : passRateNum >= 60 ? "text-amber-400" : "text-red-400"} />
                    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
                      <p className="mb-2 text-xs text-neutral-500">Status Breakdown</p>
                      <BreakdownBar breakdown={breakdown} />
                    </div>
                  </div>

                  {/* Agent breakdown */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 overflow-hidden">
                    <div className="border-b border-neutral-800 px-4 py-3">
                      <h3 className="text-sm font-semibold text-white">Agent Breakdown</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-neutral-800 text-xs text-neutral-500">
                          <th className="px-4 py-2 text-left">Agent</th>
                          <th className="px-4 py-2 text-left">Avg Score</th>
                          <th className="px-4 py-2 text-left">Pass Rate</th>
                          <th className="px-4 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agentBreakdown.map((row: any, i: number) => (
                          <tr key={i} className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/30">
                            <td className="px-4 py-2.5 font-medium text-white">{row.name}</td>
                            <td className="px-4 py-2.5">
                              <span className={`rounded px-2 py-0.5 text-xs font-bold ${
                                row.avg_score >= 80 ? "bg-emerald-900/50 text-emerald-300"
                                : row.avg_score >= 60 ? "bg-amber-900/50 text-amber-300"
                                : "bg-red-900/50 text-red-300"}`}>
                                {row.avg_score}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-neutral-300">
                              {typeof row.pass_rate === "number" ? fmtPct(row.pass_rate) : (row.pass_rate ?? "—")}
                            </td>
                            <td className="px-4 py-2.5"><StatusPill status={row.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Top flags */}
                  {topFlags.length > 0 && (
                    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
                      <h3 className="mb-4 text-sm font-semibold text-white">Most Common Issues</h3>
                      <div className="space-y-3">
                        {topFlags.slice(0, 5).map((flag: any, i: number) => {
                          const maxCount = Math.max(...topFlags.map((f: any) => f.count));
                          const pct = maxCount > 0 ? (flag.count / maxCount) * 100 : 0;
                          return (
                            <div key={i} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="flex-1 text-sm text-neutral-300">{flag.message}</span>
                                <SeverityPill severity={flag.severity} />
                                <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-xs font-semibold text-neutral-300">{flag.count}</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-neutral-800">
                                <div className="h-1.5 rounded-full bg-red-500/70" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Recent calls */}
                  {recentCalls.length > 0 && (
                    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 overflow-hidden">
                      <div className="border-b border-neutral-800 px-4 py-3">
                        <h3 className="text-sm font-semibold text-white">Recent Calls</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-neutral-800 text-xs text-neutral-500">
                              <th className="px-4 py-2 text-left">Date</th>
                              <th className="px-4 py-2 text-left">Ticket</th>
                              <th className="px-4 py-2 text-left">Technician</th>
                              <th className="px-4 py-2 text-left">Duration</th>
                              <th className="px-4 py-2 text-left">Score</th>
                              <th className="px-4 py-2 text-left">Status</th>
                              <th className="px-4 py-2 text-left">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recentCalls.map((call: AccuracyCall, i: number) => (
                              <tr key={i}
                                className="cursor-pointer border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/30"
                                onClick={() => setReportConvId(call.conversation_id)}>
                                <td className="px-4 py-2.5 text-neutral-400">{fmtDate(call.call_date)}</td>
                                <td className="px-4 py-2.5 font-medium text-white">{call.ticket_number ?? "—"}</td>
                                <td className="px-4 py-2.5 text-neutral-300">{call.technician_name ?? "—"}</td>
                                <td className="px-4 py-2.5 text-neutral-400">{fmtDuration(call.call_duration_secs)}</td>
                                <td className="px-4 py-2.5">
                                  <span className={`font-semibold ${scoreColor(call.overall_score)}`}>{call.overall_score ?? "—"}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <StatusPill status={(call as any).overall_status ?? "fail"} />
                                </td>
                                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                                  <button type="button" onClick={() => setReportConvId(call.conversation_id)}
                                    className="rounded border border-amber-600/50 bg-amber-600/20 px-2.5 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-600/30">
                                    View Report
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <style>{`@keyframes reportFadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`}</style>
      </div>

      {/* Validation report for a specific call — z-60 sits above this modal */}
      {reportConvId && (
        <ReportModal
          conversationId={reportConvId}
          onClose={() => setReportConvId(null)}
        />
      )}
    </>
  );
}
