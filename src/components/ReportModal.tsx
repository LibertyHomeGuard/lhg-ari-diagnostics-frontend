import { useState, useEffect, useCallback } from "react";
import { fetchConversationReport } from "../services/reportService";
import type {
  ReportData,
  AgentReport,
  ReportCheck,
  ReportFlag,
  NegotiationSide,
  ReportStatus,
  Severity,
  CheckStatus,
  Impact,
} from "../types/report";

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtDate(raw: string | number | null | undefined): string {
  if (raw == null) return "—";
  // Accept ISO string (from backend) or unix seconds
  const d = typeof raw === "number" ? new Date(raw * 1000) : new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(secs: number | null | undefined): string {
  if (secs == null) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m === 0 ? `${s}s` : `${m}m ${s}s`;
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function statusColor(s: ReportStatus): string {
  return s === "pass" ? "#22c55e" : s === "warning" ? "#f59e0b" : "#ef4444";
}

function statusRingColor(s: ReportStatus): string {
  return s === "pass" ? "#22c55e" : s === "warning" ? "#f59e0b" : "#ef4444";
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function SeverityPill({ severity }: { severity: Severity }) {
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

function ImpactPill({ impact }: { impact: Impact }) {
  const cls =
    impact === "CRITICAL"
      ? "bg-red-900/60 text-red-300"
      : impact === "HIGH"
      ? "bg-orange-800/60 text-orange-300"
      : impact === "MEDIUM"
      ? "bg-blue-900/60 text-blue-300"
      : "bg-neutral-700 text-neutral-400";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide ${cls}`}>
      {impact}
    </span>
  );
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

// ── Score ring badge (SVG) ────────────────────────────────────────────────────

function ScoreBadge({
  score,
  color,
  size = "lg",
}: {
  score: number;
  color: string;
  size?: "lg" | "sm";
}) {
  const dim = size === "lg" ? 88 : 56;
  const r = size === "lg" ? 36 : 22;
  const sw = size === "lg" ? 5 : 3.5;
  const circumference = 2 * Math.PI * r;
  const safeScore = score ?? 0;
  const offset = circumference - (Math.min(safeScore, 100) / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: dim, height: dim }}>
      <svg
        width={dim}
        height={dim}
        style={{ position: "absolute", transform: "rotate(-90deg)" }}
      >
        <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke="#2a2a2a" strokeWidth={sw} />
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span
        className={`relative font-bold ${size === "lg" ? "text-2xl" : "text-base"} text-white`}
      >
        {safeScore}
      </span>
    </div>
  );
}

// ── Check status icon ─────────────────────────────────────────────────────────

function CheckIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500">
        <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (status === "fail") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500">
        <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  }
  if (status === "warning") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500">
        <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v4m0 4h.01" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-600">
      <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
      </svg>
    </div>
  );
}

// ── Section: Flags banner ─────────────────────────────────────────────────────

const SEV_ORDER: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };

function FlagsSection({ flags }: { flags: ReportFlag[] }) {
  if (!flags || flags.length === 0) return null;
  const sorted = [...flags].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  return (
    <div className="rounded-lg border border-red-800/60 bg-red-950/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <svg className="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
        <span className="text-sm font-semibold text-red-300">Issues Detected</span>
      </div>
      <div className="space-y-2">
        {sorted.map((flag, i) => (
          <div key={i} className="flex items-start gap-3">
            <SeverityPill severity={flag.severity} />
            <span className="text-sm text-white">{flag.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section: Agent card ───────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentReport }) {
  const ringColor = statusRingColor(agent.status);
  return (
    <div className="flex flex-col rounded-lg border border-neutral-700/80 bg-neutral-900/60 p-4">
      {/* Card header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
          <p className="mt-0.5 text-xs text-neutral-400">{agent.pass_rate}</p>
        </div>
        <ScoreBadge score={agent.score} color={ringColor} size="sm" />
      </div>

      {/* Mini stats row */}
      <div className="mb-4 flex gap-3 text-xs">
        <span className="font-semibold text-emerald-400">{agent.passed} Passed</span>
        <span className="font-semibold text-red-400">{agent.failed} Failed</span>
        <span className="font-semibold text-amber-400">{agent.warned} Warned</span>
        <span className="font-semibold text-neutral-500">{agent.skipped} Skipped</span>
      </div>

      {/* Checks list */}
      <div className="flex-1 space-y-2">
        {agent.checks.map((check, i) => (
          <CheckRow key={i} check={check} />
        ))}
      </div>

      {/* Failed summary */}
      {agent.failed_summary && agent.failed_summary.length > 0 && (
        <div className="mt-4 rounded-lg border border-red-800/50 bg-red-950/30 p-3">
          <p className="mb-2 text-xs font-semibold text-red-400">What Failed</p>
          <ul className="space-y-1">
            {agent.failed_summary.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-neutral-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: ReportCheck }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md px-1 py-1">
      <CheckIcon status={check.status} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-white">{check.name}</p>
        {check.detail && <p className="mt-0.5 text-xs text-neutral-500">{check.detail}</p>}
      </div>
      <ImpactPill impact={check.impact} />
    </div>
  );
}

// ── Section: Negotiation summary ──────────────────────────────────────────────

function NegSideCard({ label, side }: { label: string; side: NegotiationSide }) {
  const statusCls =
    side.status === "silent"
      ? "bg-blue-900/50 text-blue-300 border border-blue-700/40"
      : side.status === "negotiate"
      ? "bg-orange-900/50 text-orange-300 border border-orange-700/40"
      : "bg-red-900/50 text-red-300 border border-red-700/40";

  return (
    <div className="flex-1 rounded-lg border border-neutral-700/80 bg-neutral-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold capitalize ${statusCls}`}>
          {side.status}
        </span>
      </div>
      <p className="text-2xl font-bold text-white">{fmtMoney(side.approved_amount)}</p>
      <p className="mt-1 text-xs text-neutral-500">Ceiling: {fmtMoney(side.ceiling_max)}</p>
      <p className="mt-2 text-xs text-neutral-400">{side.attempts} attempt{side.attempts !== 1 ? "s" : ""}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {side.ceiling_compliant ? (
          <>
            <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-xs text-emerald-400">Within ceiling</span>
          </>
        ) : (
          <>
            <svg className="h-3.5 w-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-xs text-red-400">Exceeds ceiling</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Section: Save result ──────────────────────────────────────────────────────

function SaveResultSection({ save }: { save: ReportData["save_result"] }) {
  const borderCls = save.status === "pass" ? "border-emerald-700/50" : "border-red-700/50";
  const bgCls = save.status === "pass" ? "bg-emerald-950/20" : "bg-red-950/20";

  function BoolIcon({ val }: { val: boolean }) {
    return val ? (
      <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    ) : (
      <svg className="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }

  return (
    <div className={`rounded-lg border ${borderCls} ${bgCls} p-4`}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Save Called</span>
          <BoolIcon val={save.save_called} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Save Successful</span>
          <BoolIcon val={save.save_successful} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Approved Total Saved</span>
          <span className="text-sm font-semibold text-white">
            {fmtMoney(save.approved_total_saved)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Final Total Saved</span>
          <span className="text-sm font-semibold text-white">
            {fmtMoney(save.final_total_saved)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Tab 1: Validation Report ──────────────────────────────────────────────────

function ValidationReportTab({ data }: { data: ReportData }) {
  const overallColor = statusColor(data.overall_status);

  return (
    <div className="space-y-6 p-6">
      {/* SECTION 1: Header */}
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-white">{data.ticket_number ?? "—"}</h2>
          <p className="mt-1 text-sm text-neutral-400">{data.technician_name ?? "—"}</p>
          <p className="mt-0.5 font-mono text-xs text-neutral-600">{data.conversation_id}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-400">
            <span>{fmtDate(data.call_date)}</span>
            <span className="text-neutral-600">·</span>
            <span>{fmtDuration(data.call_duration_secs)}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ScoreBadge score={data.overall_score} color={overallColor} size="lg" />
          <div>
            <StatusPill status={data.overall_status} />
            <p className="mt-2 text-xs text-neutral-400">{data.overall_pass_rate}</p>
          </div>
        </div>
      </div>

      {/* SECTION 2: Flags */}
      <FlagsSection flags={data.flags} />

      {/* SECTION 3: Agent cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <AgentCard agent={data.auth_agent} />
        <AgentCard agent={data.plumbing_agent} />
        <AgentCard agent={data.negotiation_agent} />
      </div>

      {/* SECTION 4: Negotiation summary */}
      {data.negotiation_summary && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Negotiation Summary
          </h3>
          <div className="flex flex-col gap-4 sm:flex-row">
            <NegSideCard label="Labor" side={data.negotiation_summary.labor} />
            <NegSideCard label="Parts" side={data.negotiation_summary.parts} />
          </div>
        </div>
      )}

      {/* SECTION 5: Save result */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Save Result
        </h3>
        <SaveResultSection save={data.save_result} />
      </div>

      {/* SECTION 6: What went well / what failed / recommendations */}
      <div className="space-y-3">
        {data.what_went_well && data.what_went_well.length > 0 && (
          <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-4">
            <p className="mb-2 text-sm font-semibold text-emerald-400">What Went Well</p>
            <ul className="space-y-1.5">
              {data.what_went_well.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.what_failed && data.what_failed.length > 0 && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/30 p-4">
            <p className="mb-2 text-sm font-semibold text-red-400">What Failed</p>
            <ul className="space-y-1.5">
              {data.what_failed.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.recommendations && data.recommendations.length > 0 && (
          <div className="rounded-lg border border-blue-800/50 bg-blue-950/30 p-4">
            <p className="mb-2 text-sm font-semibold text-blue-400">Recommendations</p>
            <ul className="space-y-1.5">
              {data.recommendations.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* SECTION 7: Summary */}
      {data.summary && (
        <div className="rounded-lg border border-neutral-700/60 bg-neutral-800/40 p-4">
          <p className="mb-2 text-sm font-semibold text-neutral-300">Summary</p>
          <p className="text-sm leading-relaxed text-white">{data.summary}</p>
        </div>
      )}
    </div>
  );
}

// ── Loading / error states ────────────────────────────────────────────────────

function ModalSkeleton({ retrying }: { retrying?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-700 border-t-teal-500" />
      <p className="text-sm text-neutral-500">
        {retrying ? "Retrieving report…" : "Generating report… this may take up to 30 seconds on first load"}
      </p>
    </div>
  );
}

function ModalError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24">
      <svg className="h-10 w-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        />
      </svg>
      <p className="max-w-sm text-center text-sm text-neutral-400">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500"
      >
        Retry
      </button>
    </div>
  );
}

// ── Main export: ReportModal ──────────────────────────────────────────────────

export default function ReportModal({
  conversationId,
  cachedData,
  onReportLoaded,
  onClose,
}: {
  conversationId: string;
  cachedData?: ReportData | null;
  onReportLoaded?: (data: ReportData) => void;
  onClose: () => void;
}) {
  const [reportData, setReportData] = useState<ReportData | null>(cachedData ?? null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [loadedConvId, setLoadedConvId] = useState<string>(conversationId);
  const [retrying, setRetrying] = useState(false);

  const loadReport = useCallback(async (convId: string) => {
    setReportLoading(true);
    setReportError(null);
    setReportData(null);
    setRetrying(false);
    setLoadedConvId(convId);
    try {
      const data = await fetchConversationReport(convId);
      setReportData(data);
      if (convId === conversationId) onReportLoaded?.(data);
    } catch {
      // First attempt failed (likely API Gateway 29s timeout while backend was generating).
      // The backend finishes and caches to DynamoDB regardless — auto-retry once.
      setRetrying(true);
      try {
        await new Promise((r) => setTimeout(r, 8000));
        const data = await fetchConversationReport(convId);
        setReportData(data);
        if (convId === conversationId) onReportLoaded?.(data);
      } catch (e2) {
        setReportError(e2 instanceof Error ? e2.message : "Unknown error");
      }
    } finally {
      setReportLoading(false);
      setRetrying(false);
    }
  }, [conversationId, onReportLoaded]);

  useEffect(() => {
    if (!cachedData) loadReport(conversationId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
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
          <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-neutral-800 bg-[#0f0f0f] px-6">
            <span className="py-3.5 text-sm font-medium text-white">Validation Report</span>
            <button
              type="button"
              onClick={onClose}
              className="ml-4 rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-800 hover:text-white"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          {reportLoading && <ModalSkeleton retrying={retrying} />}
          {reportError && !reportLoading && (
            <ModalError message={reportError} onRetry={() => loadReport(loadedConvId)} />
          )}
          {reportData && !reportLoading && <ValidationReportTab data={reportData} />}
        </div>
      </div>

      {/* Keyframe animation injected inline — avoids global CSS changes */}
      <style>{`
        @keyframes reportFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
