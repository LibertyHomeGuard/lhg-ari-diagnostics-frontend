// ── Status / severity enums ───────────────────────────────────────────────────

export type ReportStatus = "pass" | "warning" | "fail";
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM";
export type Impact = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type CheckStatus = "pass" | "fail" | "warning" | "skip";
export type NegStatus = "silent" | "negotiate" | "escalate";

// ── Validation report shapes ──────────────────────────────────────────────────

export type ReportFlag = {
  severity: Severity;
  message: string;
};

export type ReportCheck = {
  name: string;
  detail: string;
  status: CheckStatus;
  impact: Impact;
};

export type AgentReport = {
  name: string;
  score: number;
  status: ReportStatus;
  pass_rate: string;
  passed: number;
  failed: number;
  warned: number;
  skipped: number;
  checks: ReportCheck[];
  failed_summary: string[];
};

export type NegotiationSide = {
  status: NegStatus;
  approved_amount: number;
  ceiling_max: number;
  attempts: number;
  ceiling_compliant: boolean;
};

export type NegotiationSummary = {
  labor: NegotiationSide;
  parts: NegotiationSide;
};

export type SaveResult = {
  status: ReportStatus;
  save_called: boolean;
  save_successful: boolean;
  approved_total_saved: number;
  final_total_saved: number;
};

export type ReportData = {
  conversation_id: string;
  ticket_number: string | null;   // backend field name
  technician_name: string | null;
  call_date: string | number | null; // backend returns ISO string; frontend normalises
  call_duration_secs: number | null;
  overall_score: number;
  overall_status: ReportStatus;
  overall_pass_rate: string;
  flags: ReportFlag[];
  auth_agent: AgentReport;
  plumbing_agent: AgentReport;
  negotiation_agent: AgentReport;
  negotiation_summary?: NegotiationSummary;
  save_result: SaveResult;
  what_went_well: string[];
  what_failed: string[];
  recommendations: string[];
  summary: string;
};

// ── AI Accuracy summary shapes ────────────────────────────────────────────────

export type AccuracyAgentRow = {
  name: string;
  avg_score: number;
  pass_rate: number; // 0–100
  status: ReportStatus;
};

export type AccuracyFlag = {
  message: string;
  severity: Severity;
  count: number;
};

export type AccuracyCall = {
  conversation_id: string;
  call_date: string | null;       // backend returns YYYY-MM-DD string
  ticket_number: string | null;
  technician_name: string | null;
  call_duration_secs: number | null;
  overall_score: number | null;
  status: ReportStatus;
};

// Backend returns agent_breakdown as an object keyed by agent name
export type AccuracyAgentBreakdown = {
  auth?: { avg_score: number; pass_rate: string };
  plumbing?: { avg_score: number; pass_rate: string };
  negotiation?: { avg_score: number; pass_rate: string };
};

export type AccuracySummary = {
  total_calls: number;
  average_score: number;
  overall_pass_rate?: string;   // backend returns this as a string e.g. "75%"
  pass_rate?: number;           // optional normalised number
  status_breakdown: { pass: number; warning: number; fail: number };
  agent_breakdown: AccuracyAgentBreakdown | AccuracyAgentRow[];
  top_flags: AccuracyFlag[];
  recent_calls: AccuracyCall[];
};
