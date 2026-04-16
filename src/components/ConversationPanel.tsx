import { useState } from "react";
import type {
  ConversationStub,
  ConvCacheEntry,
  TranscriptCacheEntry,
  TranscriptTurn,
} from "../services/elevenLabsService";
import type { NegotiationAttempt, NegotiationPartResult, PlumbingPartRow } from "../types/diagnostics";
import type { ReportData } from "../types/report";
import PartsTable from "./PartsTable";
import ReportModal from "./ReportModal";

type Tab = "transcript" | "diagnostic";

type Props = {
  ticketNo: string;
  phoneNumber: string | undefined;
  convEntry: ConvCacheEntry | undefined;
  transcriptCache: Record<string, TranscriptCacheEntry>;
  onLoadTranscript: (conversationId: string) => void;
  diagRecord: Record<string, unknown> | undefined;
  diagLoading: boolean;
  activeTab: Tab;
  onSwitchToTranscript: () => void;
};

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatTimestamp(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m === 0 ? `${s}s` : `${m}m ${s}s`;
}

function formatCallTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ── Data helpers (shared by both tabs) ───────────────────────────────────────

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

function toBool(v: unknown): boolean | undefined {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return undefined;
}

function nf(v: number | undefined): string {
  return v != null ? v.toFixed(2) : "0.00";
}

function extractPD(record: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!record) return {};
  return ((record.plumbingDiagnostic ?? record.plumbing_diagnostic) ?? {}) as Record<
    string,
    unknown
  >;
}

function mapPartsArray(raw: unknown[]): PlumbingPartRow[] {
  return raw.map((p) => {
    if (!p || typeof p !== "object") return {};
    const r = p as Record<string, unknown>;
    return {
      part_name: str(r.part_name ?? r.partName) || undefined,
      quantity: num(r.quantity),
      tech_price: num(r.tech_price ?? r.techPrice),
      location_of_repair: str(r.location_of_repair ?? r.locationOfRepair) || undefined,
    };
  });
}

function extractParts(record: Record<string, unknown> | undefined): PlumbingPartRow[] {
  if (!record) return [];
  return mapPartsArray(((record.plumbingParts ?? record.plumbing_parts) ?? []) as unknown[]);
}

function extractNegParts(d: Record<string, unknown>): NegotiationPartResult[] {
  const raw = ((d.parts_negotiation_results) ?? []) as unknown[];
  return raw.map((p) => {
    if (!p || typeof p !== "object") return {};
    const r = p as Record<string, unknown>;
    return {
      name: str(r.name) || undefined,
      lhg_price: num(r.lhg_price),
      tech_price: num(r.tech_price),
      tier_max: num(r.tier_max),
      within_tier: toBool(r.within_tier),
      approved_part_price: r.approved_part_price == null ? null : num(r.approved_part_price),
      weight_pct: num(r.weight_pct),
      auto_approved: r.auto_approved == null ? null : toBool(r.auto_approved),
    };
  });
}

// ── Dark-theme shared components (Transcript tab) ─────────────────────────────

const STATUS_META: Record<string, { label: string; cls: string }> = {
  done: { label: "Completed", cls: "bg-emerald-900/50 text-emerald-300 border-emerald-700/60" },
  "in-progress": { label: "In Progress", cls: "bg-amber-900/50 text-amber-300 border-amber-700/60" },
  processing: { label: "Processing", cls: "bg-amber-900/50 text-amber-300 border-amber-700/60" },
  failed: { label: "Failed", cls: "bg-red-900/50 text-red-300 border-red-700/60" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    cls: "bg-neutral-800 text-neutral-400 border-neutral-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold tracking-wide ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-neutral-700 ${className}`} />;
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-neutral-700 bg-neutral-800/30 p-4">
      <div className="mb-3 flex items-center gap-3">
        <Sk className="h-5 w-20" />
        <Sk className="h-4 w-36" />
        <Sk className="h-4 w-12" />
      </div>
      <Sk className="mb-1.5 h-3 w-3/4" />
      <Sk className="h-3 w-1/2" />
    </div>
  );
}

function TranscriptView({ entry }: { entry: TranscriptCacheEntry | undefined }) {
  if (!entry || entry.status === "loading") {
    return (
      <div className="mt-3 space-y-2 rounded-lg border border-neutral-700 bg-black/30 p-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`flex ${i % 2 === 1 ? "justify-end" : "justify-start"}`}>
            <Sk className={`h-9 rounded-xl ${i % 2 === 1 ? "w-52" : "w-44"}`} />
          </div>
        ))}
      </div>
    );
  }
  if (entry.data.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-neutral-700 bg-black/30 px-4 py-4 text-center text-sm text-neutral-500">
        No transcript available for this call
      </div>
    );
  }
  return (
    <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-neutral-700 bg-black/30 p-3 space-y-2">
      {entry.data.map((turn: TranscriptTurn, i: number) => (
        <div
          key={i}
          className={`flex gap-2 ${turn.role === "user" ? "flex-row-reverse" : "flex-row"}`}
        >
          <div
            className={`max-w-[75%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
              turn.role === "agent"
                ? "bg-neutral-800 text-neutral-300"
                : "border border-blue-600/30 bg-blue-600/15 text-white"
            }`}
          >
            <p>{turn.message}</p>
            <p
              className={`mt-1 text-xs ${
                turn.role === "agent" ? "text-neutral-500" : "text-blue-400"
              }`}
            >
              {formatCallTime(turn.time_in_call_secs)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConversationCard({
  conv,
  transcriptCache,
  onLoadTranscript,
}: {
  conv: ConversationStub;
  transcriptCache: Record<string, TranscriptCacheEntry>;
  onLoadTranscript: (id: string) => void;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [cachedReport, setCachedReport] = useState<ReportData | null>(null);
  const transcriptEntry = transcriptCache[conv.conversation_id];

  function handleToggleTranscript() {
    if (!showTranscript && !transcriptEntry) {
      onLoadTranscript(conv.conversation_id);
    }
    setShowTranscript((v) => !v);
  }

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-4 transition-colors hover:bg-neutral-800/60">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={conv.status} />
        <span className="text-sm text-neutral-300">
          {formatTimestamp(conv.start_time_unix_secs)}
        </span>
        <span className="text-neutral-600">·</span>
        <span className="text-sm text-neutral-400">
          {formatDuration(conv.call_duration_secs)}
        </span>
      </div>
      {conv.analysis?.summary ? (
        <p className="mb-3 text-sm leading-relaxed text-neutral-300">{conv.analysis.summary}</p>
      ) : (
        <p className="mb-3 text-sm italic text-neutral-500">No summary available</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleToggleTranscript}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-600 bg-neutral-700/50 px-3 py-1.5 text-xs font-medium text-neutral-200 transition hover:bg-neutral-700 hover:text-white"
        >
          <svg
            className={`h-3.5 w-3.5 transition-transform ${showTranscript ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z"
            />
          </svg>
          {showTranscript ? "Hide Transcript" : "View Transcript"}
        </button>
        <button
          type="button"
          onClick={() => setShowReport(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-600/50 bg-amber-600/20 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-600/30 hover:text-amber-200"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Report
        </button>
      </div>
      {showTranscript && <TranscriptView entry={transcriptEntry} />}
      {showReport && (
        <ReportModal
          conversationId={conv.conversation_id}
          cachedData={cachedReport}
          onReportLoaded={(data) => setCachedReport(data)}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

// ── Transcript tab ────────────────────────────────────────────────────────────

// Duration preset chips — label, min seconds, max seconds (null = no limit)
const DURATION_PRESETS: { label: string; min: number; max: number | null }[] = [
  { label: "All",    min: 0,   max: null },
  { label: "< 30s",  min: 0,   max: 30   },
  { label: "30s–2m", min: 30,  max: 120  },
  { label: "2m–5m",  min: 120, max: 300  },
  { label: "> 5m",   min: 300, max: null },
];

// Call status options
const STATUS_OPTIONS = ["all", "done", "in-progress", "processing", "failed"] as const;

function CallFilters({
  total,
  filtered,
  minSecs,
  maxSecs,
  statusFilter,
  onMinChange,
  onMaxChange,
  onPreset,
  onStatusChange,
  onReset,
}: {
  total: number;
  filtered: number;
  minSecs: string;
  maxSecs: string;
  statusFilter: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  onPreset: (min: number, max: number | null) => void;
  onStatusChange: (v: string) => void;
  onReset: () => void;
}) {
  const isDirty = minSecs !== "" || maxSecs !== "" || statusFilter !== "all";

  return (
    <div className="rounded-lg border border-neutral-700/60 bg-neutral-800/30 p-3 space-y-2.5">
      {/* Duration presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-neutral-500 mr-1">Duration</span>
        {DURATION_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onPreset(p.min, p.max)}
            className="rounded-full border border-neutral-600 bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-300 transition hover:border-teal-500 hover:text-teal-300"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom min/max inputs + status filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-500">Custom</span>
        <input
          type="number"
          placeholder="Min (s)"
          min={0}
          value={minSecs}
          onChange={(e) => onMinChange(e.target.value)}
          className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white placeholder-neutral-600 focus:border-teal-500 focus:outline-none"
        />
        <span className="text-xs text-neutral-600">–</span>
        <input
          type="number"
          placeholder="Max (s)"
          min={0}
          value={maxSecs}
          onChange={(e) => onMaxChange(e.target.value)}
          className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white placeholder-neutral-600 focus:border-teal-500 focus:outline-none"
        />

        <span className="text-xs text-neutral-500 ml-2">Status</span>
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white focus:border-teal-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        {isDirty && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto text-xs text-neutral-500 hover:text-neutral-300 underline"
          >
            Reset
          </button>
        )}
      </div>

      {/* Result count */}
      <p className="text-xs text-neutral-500">
        Showing <span className="text-white font-medium">{filtered}</span> of{" "}
        <span className="text-white font-medium">{total}</span> calls
      </p>
    </div>
  );
}

function TranscriptTab({
  convEntry,
  transcriptCache,
  onLoadTranscript,
  phoneNumber,
}: {
  convEntry: ConvCacheEntry | undefined;
  transcriptCache: Record<string, TranscriptCacheEntry>;
  onLoadTranscript: (id: string) => void;
  phoneNumber: string | undefined;
}) {
  const [minSecs, setMinSecs] = useState("");
  const [maxSecs, setMaxSecs] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  function handlePreset(min: number, max: number | null) {
    setMinSecs(min === 0 && max === null ? "" : String(min));
    setMaxSecs(max === null ? "" : String(max));
  }

  function handleReset() {
    setMinSecs("");
    setMaxSecs("");
    setStatusFilter("all");
  }

  if (!phoneNumber) {
    return (
      <div className="px-6 py-6 text-center text-sm text-neutral-500">
        No technician phone number found in this diagnostic record
      </div>
    );
  }
  if (!convEntry || convEntry.status === "loading") {
    return (
      <div className="space-y-3 p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Loading calls…
        </p>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }
  if (convEntry.status === "error") {
    return (
      <div className="px-6 py-4">
        <p className="text-sm text-red-400">Failed to load calls: {convEntry.message}</p>
      </div>
    );
  }
  if (convEntry.data.length === 0) {
    return (
      <div className="px-6 py-6 text-center text-sm text-neutral-500">
        No calls found for {phoneNumber}
      </div>
    );
  }

  const minVal = minSecs !== "" ? Number(minSecs) : 0;
  const maxVal = maxSecs !== "" ? Number(maxSecs) : Infinity;

  const filtered = convEntry.data.filter((c) => {
    const dur = c.call_duration_secs ?? 0;
    const durOk = dur >= minVal && dur <= maxVal;
    const statusOk = statusFilter === "all" || c.status === statusFilter;
    return durOk && statusOk;
  });

  return (
    <div className="space-y-3 p-6">
      <CallFilters
        total={convEntry.data.length}
        filtered={filtered.length}
        minSecs={minSecs}
        maxSecs={maxSecs}
        statusFilter={statusFilter}
        onMinChange={setMinSecs}
        onMaxChange={setMaxSecs}
        onPreset={handlePreset}
        onStatusChange={setStatusFilter}
        onReset={handleReset}
      />

      {filtered.length === 0 ? (
        <div className="py-6 text-center text-sm text-neutral-500">
          No calls match the current filters.
        </div>
      ) : (
        filtered.map((conv) => (
          <ConversationCard
            key={conv.conversation_id}
            conv={conv}
            transcriptCache={transcriptCache}
            onLoadTranscript={onLoadTranscript}
          />
        ))
      )}
    </div>
  );
}

// ── Diagnostic tab — blue/white theme (matches original modal) ────────────────

const SECTION_HDR =
  "bg-sky-200 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-slate-800";

function LField({
  label,
  value,
  className = "",
  as: as_ = "input",
}: {
  label: string;
  value?: unknown;
  className?: string;
  as?: "input" | "textarea" | "select";
}) {
  let display: string;
  if (value == null || value === "") display = "";
  else if (typeof value === "boolean") display = value ? "Yes" : "No";
  else display = String(value);

  const inputCls =
    "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:cursor-default";

  return (
    <div className={`mb-3 ${className}`}>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {as_ === "textarea" ? (
        <textarea value={display} readOnly disabled rows={3} className={inputCls} />
      ) : as_ === "select" ? (
        <div className={`${inputCls} flex min-h-[34px] items-center`}>{display || "—"}</div>
      ) : (
        <input type="text" value={display} readOnly disabled className={inputCls} />
      )}
    </div>
  );
}

function LRadio({
  label,
  value,
  options,
}: {
  label: string;
  value: unknown;
  options: [string, string];
}) {
  let display = "";
  if (value === true || value === "true") display = options[0];
  else if (value === false || value === "false") display = options[1];
  else if (typeof value === "string" && (value === options[0] || value === options[1]))
    display = value;
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-sm font-medium text-slate-700">{label}:</span>
      <span className="text-sm text-slate-700">{display || "—"}</span>
    </div>
  );
}

function extractNegAttempts(raw: unknown): NegotiationAttempt[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    if (!e || typeof e !== "object") return { attempt: 0, anchor_offered: null, tech_offer: null };
    const r = e as Record<string, unknown>;
    const attempt =
      typeof r.attempt === "string" && r.attempt.toLowerCase() === "reopen"
        ? "reopen"
        : (num(r.attempt) ?? 0);
    return {
      attempt,
      anchor_offered: num(r.anchor_offered) ?? null,
      tech_offer: num(r.tech_offer) ?? null,
    };
  });
}

function AttemptsTable({ rows }: { rows: NegotiationAttempt[] }) {
  if (rows.length === 0)
    return <p className="text-sm italic text-slate-400">No attempts recorded</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
          <th className="px-2 py-2">Attempt</th>
          <th className="px-2 py-2">Anchor Offered</th>
          <th className="px-2 py-2">Tech Offer</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-100 even:bg-slate-50">
            <td className="px-2 py-2 font-medium text-slate-800">
              {r.attempt === "reopen" ? "Reopen" : `#${r.attempt}`}
            </td>
            <td className="px-2 py-2 text-slate-800">
              {r.anchor_offered != null ? `$${nf(r.anchor_offered)}` : "—"}
            </td>
            <td className="px-2 py-2 text-slate-800">
              {r.tech_offer != null ? `$${nf(r.tech_offer)}` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── DiagnosisFormContent — renders one full diagnosis form (reused for each entry) ────

function DiagnosisFormContent({
  d,
  parts,
  propertyAddress,
  ticketNo,
  callerSummary,
  endReason,
  ticketBound,
  showCallInfo,
}: {
  d: Record<string, unknown>;
  parts: PlumbingPartRow[];
  propertyAddress: string;
  ticketNo: string;
  callerSummary?: string;
  endReason?: string;
  ticketBound?: boolean;
  showCallInfo?: boolean;
}) {
  const negParts = extractNegParts(d);
  const laborAttempts = extractNegAttempts(d.labor_negotiation_attempts);
  const partsAttempts = extractNegAttempts(d.parts_negotiation_attempts);

  const hasLhgBenchmarks =
    d.lhg_hourly_rate != null || d.lhg_labor != null || d.lhg_parts_total != null ||
    d.lhg_total != null || d.lhg_labor_ceiling != null || d.lhg_parts_ceiling != null;

  const hasNegContext =
    d.labor_flag != null || d.follow_up_labor != null || d.within_ceiling != null ||
    d.acceptable_ceiling != null || d.bundle_lhg_total != null ||
    d.bundle_tech_parts_total != null || d.bundle_approved != null ||
    d.follow_up_parts != null || d.unpriced_parts_count != null;

  const hasNegOutcome =
    d.approved_labor != null || d.approved_parts != null || d.approved_total != null ||
    d.follow_up_required != null || str(d.negotiation_note);

  return (
    <>
      {/* ── Top section — no header ── */}
      <div className="space-y-0 px-4 py-4">
        <div className="mb-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!toBool(d.calling_for_diagnosis)}
            readOnly
            disabled
            className="h-4 w-4 rounded border-slate-300"
          />
          <label className="text-sm font-medium text-slate-700">Calling for Diagnosis</label>
        </div>
        <div className="grid grid-cols-2 gap-x-4">
          <LField label="Company Name" value={str(d.technician_company_only ?? d.technician_company_name)} />
          <LField label="Category" value="Plumbing" />
          <LField label="Technician Email" value={str(d.technician_email)} />
          <LField label="Technician Phone" value={str(d.technician_phone)} />
          <LField label="Ticket Number" value={ticketNo} />
          <LField label={`Was the appointment at ${propertyAddress || "[address]"}?`} value="Yes" />
        </div>
        {showCallInfo && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 border-t border-slate-100 pt-3">
            {endReason && <LField label="End Reason" value={endReason} />}
            {ticketBound != null && (
              <LRadio label="Ticket Bound" value={ticketBound} options={["Yes", "No"]} />
            )}
            {callerSummary && (
              <div className="col-span-2">
                <LField label="Caller Summary" value={callerSummary} as="textarea" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── COVERED ITEM DETAILS ── */}
      <section className="mb-0">
        <div className={SECTION_HDR}>COVERED ITEM DETAILS</div>
        <div className="border-t-0 border-slate-200 px-4 py-3">
          <LField label="Description" value={str(d.description)} />
          <LField label="Location" value={str(d.location)} />
          <LRadio label="Access required?" value={d.access_required} options={["Yes", "No"]} />
          {toBool(d.access_required) && (
            <div className="grid grid-cols-2 gap-x-4">
              <LField label="Access Price" value={d.access_price != null ? nf(num(d.access_price)) : ""} />
              <LRadio label="Access Closing Included?" value={d.access_closing_included} options={["Yes", "No"]} />
            </div>
          )}
          <LField label="In your professional opinion, when did this issue begin?" value={str(d.issue_begin)} />
          <LField label="Malfunction cause" value={str(d.malfunction_cause)} as="select" />
          <LField label="Condition" value={str(d.condition)} as="select" />
          {str(d.condition_poor_specify) && (
            <LField label="Condition — Poor (specify)" value={str(d.condition_poor_specify)} />
          )}
          <LField label="Details (Include any issues seen and the scope of work needed)" value={str(d.details)} as="textarea" />
        </div>
      </section>

      {/* ── NEXT STEPS ── */}
      <section>
        <div className={SECTION_HDR}>NEXT STEPS</div>
        <div className="border-t-0 border-slate-200 px-4 py-3">
          <LField label="Next step recommendation" value={str(d.next_step_recommendation)} as="select" />
        </div>
      </section>

      {/* ── REPAIR INFORMATION ── */}
      <section>
        <div className={SECTION_HDR}>REPAIR INFORMATION</div>
        <div className="border-t-0 border-slate-200 px-4 py-3">
          <LRadio label="Parts needed?" value={d.parts_needed} options={["Yes", "No"]} />
          <p className="mb-2 text-sm font-medium text-slate-700">Labor estimates</p>
          <div className="mb-3 w-36">
            <LField label="Labor Cost" value={nf(num(d.labor_total))} />
          </div>
          <p className="mb-2 mt-4 text-sm font-medium text-slate-700">Parts for repair</p>
          <div className="mb-4 overflow-x-auto">
            <PartsTable rows={parts} readOnly />
          </div>
          <div className="mt-6">
            <div className={SECTION_HDR}>TECHNICIAN&apos;S ESTIMATE</div>
            <div className="grid grid-cols-2 gap-x-4 border border-t-0 border-slate-200 bg-white px-3 py-3 sm:grid-cols-3">
              <LField label="Parts" value={nf(num(d.parts_cost_total))} />
              <LField label="Shipping" value={nf(num(d.shipping_cost))} />
              <LField label="Tax" value={nf(num(d.tax))} />
              <LField label="Labor" value={nf(num(d.labor_total))} />
              <LField label="Parts Total" value={nf(num(d.parts_cost_total))} />
              <LField label="Parts &amp; Labor" value={nf(num(d.final_total))} />
            </div>
          </div>
        </div>
      </section>

      {/* ── LHG BENCHMARK VALUES ── */}
      {hasLhgBenchmarks && (
        <section>
          <div className={SECTION_HDR}>LHG BENCHMARK VALUES</div>
          <div className="grid grid-cols-2 gap-x-4 border-t-0 border-slate-200 px-4 py-3 sm:grid-cols-3">
            {d.lhg_hourly_rate != null && <LField label="LHG Hourly Rate" value={nf(num(d.lhg_hourly_rate))} />}
            {d.lhg_labor != null && <LField label="LHG Labor" value={nf(num(d.lhg_labor))} />}
            {d.lhg_parts_total != null && <LField label="LHG Parts Total" value={nf(num(d.lhg_parts_total))} />}
            {d.lhg_total != null && <LField label="LHG Total" value={nf(num(d.lhg_total))} />}
            {d.lhg_labor_ceiling != null && <LField label="LHG Labor Ceiling" value={nf(num(d.lhg_labor_ceiling))} />}
            {d.lhg_parts_ceiling != null && <LField label="LHG Parts Ceiling" value={nf(num(d.lhg_parts_ceiling))} />}
          </div>
        </section>
      )}

      {/* ── NEGOTIATION CONTEXT ── */}
      {hasNegContext && (
        <section>
          <div className={SECTION_HDR}>NEGOTIATION CONTEXT</div>
          <div className="grid grid-cols-2 gap-x-4 border-t-0 border-slate-200 px-4 py-3 sm:grid-cols-3">
            {d.labor_flag != null && <LRadio label="Labor Flag" value={d.labor_flag} options={["Yes", "No"]} />}
            {d.follow_up_labor != null && <LRadio label="Follow-up Labor" value={d.follow_up_labor} options={["Yes", "No"]} />}
            {d.within_ceiling != null && <LRadio label="Within Ceiling" value={d.within_ceiling} options={["Yes", "No"]} />}
            {d.acceptable_ceiling != null && <LField label="Acceptable Ceiling" value={nf(num(d.acceptable_ceiling))} />}
            {d.bundle_lhg_total != null && <LField label="Bundle LHG Total" value={nf(num(d.bundle_lhg_total))} />}
            {d.bundle_tech_parts_total != null && <LField label="Bundle Tech Parts Total" value={nf(num(d.bundle_tech_parts_total))} />}
            {d.bundle_approved != null && <LRadio label="Bundle Approved" value={d.bundle_approved} options={["Yes", "No"]} />}
            {d.follow_up_parts != null && <LRadio label="Follow-up Parts" value={d.follow_up_parts} options={["Yes", "No"]} />}
            {d.unpriced_parts_count != null && <LField label="Unpriced Parts Count" value={num(d.unpriced_parts_count)} />}
          </div>
        </section>
      )}

      {/* ── NEGOTIATION OUTCOME ── */}
      {hasNegOutcome && (
        <section>
          <div className={SECTION_HDR}>NEGOTIATION OUTCOME</div>
          <div className="border-t-0 border-slate-200 px-4 py-3">
            <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
              {d.approved_labor != null && <LField label="Approved Labor" value={nf(num(d.approved_labor))} />}
              {d.approved_parts != null && <LField label="Approved Parts" value={nf(num(d.approved_parts))} />}
              {d.approved_total != null && <LField label="Approved Total" value={nf(num(d.approved_total))} />}
            </div>
            {d.follow_up_required != null && (
              <LRadio label="Follow-up Required" value={d.follow_up_required} options={["Yes", "No"]} />
            )}
            {str(d.negotiation_note) && (
              <LField label="Negotiation Note" value={str(d.negotiation_note)} as="textarea" />
            )}
          </div>
        </section>
      )}

      {/* ── PARTS NEGOTIATION RESULTS ── */}
      {negParts.length > 0 && (
        <section>
          <div className={SECTION_HDR}>PARTS NEGOTIATION RESULTS</div>
          <div className="overflow-x-auto border-t-0 border-slate-200 px-4 py-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="px-2 py-2">Part Name</th>
                  <th className="px-2 py-2">LHG Price</th>
                  <th className="px-2 py-2">Tech Price</th>
                  <th className="px-2 py-2">Tier Max</th>
                  <th className="px-2 py-2">Within Tier</th>
                  <th className="px-2 py-2">Approved Price</th>
                  <th className="px-2 py-2">Weight %</th>
                  <th className="px-2 py-2">Auto Approved</th>
                </tr>
              </thead>
              <tbody>
                {negParts.map((p, i) => (
                  <tr key={i} className="border-b border-slate-100 even:bg-slate-50">
                    <td className="px-2 py-2 text-slate-800">{p.name || "—"}</td>
                    <td className="px-2 py-2 text-slate-800">${nf(p.lhg_price)}</td>
                    <td className="px-2 py-2 text-slate-800">${nf(p.tech_price)}</td>
                    <td className="px-2 py-2 text-slate-800">${nf(p.tier_max)}</td>
                    <td className="px-2 py-2">
                      {p.within_tier == null ? "—" : p.within_tier ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">Yes</span>
                      ) : (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">No</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-slate-800">
                      {p.approved_part_price == null ? (
                        <span className="italic text-slate-400">Unresolved</span>
                      ) : (
                        `$${nf(p.approved_part_price)}`
                      )}
                    </td>
                    <td className="px-2 py-2 text-slate-800">
                      {p.weight_pct != null ? `${nf(p.weight_pct)}%` : "—"}
                    </td>
                    <td className="px-2 py-2">
                      {p.auto_approved == null ? "—" : p.auto_approved ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">Yes</span>
                      ) : (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── LABOR NEGOTIATION ATTEMPTS ── */}
      {laborAttempts.length > 0 && (
        <section>
          <div className={SECTION_HDR}>LABOR NEGOTIATION ATTEMPTS</div>
          <div className="overflow-x-auto border-t-0 border-slate-200 px-4 py-3">
            <AttemptsTable rows={laborAttempts} />
          </div>
        </section>
      )}

      {/* ── PARTS NEGOTIATION ATTEMPTS ── */}
      {partsAttempts.length > 0 && (
        <section>
          <div className={SECTION_HDR}>PARTS NEGOTIATION ATTEMPTS</div>
          <div className="overflow-x-auto border-t-0 border-slate-200 px-4 py-3">
            <AttemptsTable rows={partsAttempts} />
          </div>
        </section>
      )}

      {/* ── CLAIM ACTIONS ── */}
      <section>
        <div className={SECTION_HDR}>CLAIM ACTIONS</div>
        <div className="border-t-0 border-slate-200 px-4 py-3">
          <LRadio label="Live resolution requested" value={d.enable_live_resolution} options={["Yes", "No"]} />
          <LRadio label="Is the technician onsite?" value={d.is_technician_onsite} options={["Yes", "No"]} />
          <LRadio label="Is the customer onsite?" value={d.is_customer_onsite} options={["Yes", "No"]} />
          <LField label="Is the technician willing to waive their service call fee?" value={str(d.waive_service_call_fee)} />
          <LField label="Change task status" value={str(d.change_task_status)} as="select" />
          <LField label="Note" value={str(d.note)} as="textarea" />
        </div>
      </section>
    </>
  );
}

// ── DiagnosisAccordion — card list + expandable form per diagnosis ────────────

type EntryShape = {
  diagnosis_id?: string;
  is_primary?: boolean;
  saved_at?: string;
  plumbingDiagnostic?: Record<string, unknown>;
  plumbingParts?: unknown[];
};

function DiagnosisAccordion({
  sorted,
  propertyAddress,
  ticketNo,
  callerSummary,
  endReason,
  ticketBound,
  hasCallInfo,
  onClose,
}: {
  sorted: EntryShape[];
  propertyAddress: string;
  ticketNo: string;
  callerSummary: string;
  endReason: string;
  ticketBound: boolean | undefined;
  hasCallInfo: boolean;
  onClose: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="p-6">
      <div className="space-y-3">
        {sorted.map((entry, idx) => {
          const id = entry.diagnosis_id ?? String(idx);
          const isOpen = openId === id;
          const dateStr = entry.saved_at
            ? new Date(entry.saved_at).toLocaleString(undefined, {
                month: "short", day: "numeric", year: "numeric",
                hour: "numeric", minute: "2-digit",
              })
            : "—";
          const d = (entry.plumbingDiagnostic ?? {}) as Record<string, unknown>;
          const parts = mapPartsArray((entry.plumbingParts ?? []) as unknown[]);

          return (
            <div key={id}>
              {/* ── Clickable card ── */}
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : id)}
                className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                  isOpen
                    ? "border-teal-600/60 bg-teal-900/20"
                    : "border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {entry.is_primary && (
                      <span className="shrink-0 rounded border border-teal-700/60 bg-teal-900/40 px-2 py-0.5 text-xs font-medium text-teal-300">
                        Primary
                      </span>
                    )}
                    <span className="truncate text-sm font-medium text-white">
                      {entry.diagnosis_id ?? `Diagnosis ${idx + 1}`}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-neutral-400">{dateStr}</span>
                    <svg
                      className={`h-4 w-4 text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </button>

              {/* ── Expanded form ── */}
              {isOpen && (
                <div className="mt-2 overflow-hidden rounded-lg bg-white shadow-sm">
                  <DiagnosisFormContent
                    d={d}
                    parts={parts}
                    propertyAddress={propertyAddress}
                    ticketNo={ticketNo}
                    callerSummary={idx === 0 ? callerSummary : undefined}
                    endReason={idx === 0 ? endReason : undefined}
                    ticketBound={idx === 0 ? ticketBound : undefined}
                    showCallInfo={idx === 0 && hasCallInfo}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}

// ── DiagnosticTab ─────────────────────────────────────────────────────────────

function DiagnosticTab({
  diagRecord,
  diagLoading,
  ticketNo,
  onClose,
}: {
  diagRecord: Record<string, unknown> | undefined;
  diagLoading: boolean;
  ticketNo: string;
  onClose: () => void;
}) {
  if (diagLoading && !diagRecord) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4 rounded-lg bg-white p-6 shadow-sm">
          {[...Array(5)].map((_, i) => (
            <div key={i}>
              <div className="mb-1.5 h-3 w-28 rounded bg-slate-200" />
              <div className="h-8 w-full rounded border border-slate-200 bg-slate-50" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!diagRecord) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-neutral-500">
        Diagnostic data unavailable
      </div>
    );
  }

  const at = (diagRecord.activeTicket ?? diagRecord.active_ticket) as Record<string, unknown> | undefined;
  const propertyAddress = str(at?.propertyAddress ?? at?.property_address);
  const callerSummary = str(diagRecord.callerSummary ?? diagRecord.caller_summary);
  const endReason = str(diagRecord.endReason ?? diagRecord.end_reason);
  const ticketBound = diagRecord.ticketBound != null ? toBool(diagRecord.ticketBound) : undefined;
  const hasCallInfo = !!(callerSummary || endReason || ticketBound != null);

  // ── Multi-diagnosis path ──────────────────────────────────────────────────
  const diagnosesRaw = Array.isArray(diagRecord.diagnoses)
    ? (diagRecord.diagnoses as EntryShape[])
    : null;

  if (diagnosesRaw && diagnosesRaw.length > 0) {
    const sorted = [...diagnosesRaw].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      const aDate = a.saved_at ?? "";
      const bDate = b.saved_at ?? "";
      return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
    });

    return (
      <DiagnosisAccordion
        sorted={sorted}
        propertyAddress={propertyAddress}
        ticketNo={ticketNo}
        callerSummary={callerSummary}
        endReason={endReason}
        ticketBound={ticketBound}
        hasCallInfo={hasCallInfo}
        onClose={onClose}
      />
    );
  }

  // ── Single-diagnosis fallback (original behaviour, no diagnoses array) ────
  const d = extractPD(diagRecord);
  const parts = extractParts(diagRecord);

  return (
    <div className="p-6">
      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <DiagnosisFormContent
          d={d}
          parts={parts}
          propertyAddress={propertyAddress}
          ticketNo={ticketNo}
          callerSummary={callerSummary}
          endReason={endReason}
          ticketBound={ticketBound}
          showCallInfo={hasCallInfo}
        />
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ConversationPanel({
  ticketNo,
  phoneNumber,
  convEntry,
  transcriptCache,
  onLoadTranscript,
  diagRecord,
  diagLoading,
  activeTab,
  onSwitchToTranscript,
}: Props) {
  if (activeTab === "diagnostic") {
    return (
      <DiagnosticTab
        diagRecord={diagRecord}
        diagLoading={diagLoading}
        ticketNo={ticketNo}
        onClose={onSwitchToTranscript}
      />
    );
  }
  return (
    <TranscriptTab
      convEntry={convEntry}
      transcriptCache={transcriptCache}
      onLoadTranscript={onLoadTranscript}
      phoneNumber={phoneNumber}
    />
  );
}
