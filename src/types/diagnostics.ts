/** Row shape for Active Claims list (matches backend response) */
export type ActiveClaimRow = {
  ticketNo: string;
  coveredItem: string;
  propertyAddress: string;
  ticketStatus?: string;
  savedAtMs?: number;
  callerNumber?: string;
};

/** Per-part negotiation result stored by Lambda */
export type NegotiationPartResult = {
  name?: string;
  lhg_price?: number;
  tech_price?: number;
  tier_max?: number;
  within_tier?: boolean;
  approved_part_price?: number | null;
  weight_pct?: number;
  auto_approved?: boolean | null;
};

/** Single negotiation round (labor or parts) stored by Lambda */
export type NegotiationAttempt = {
  attempt: number | "reopen";
  anchor_offered: number | null;
  tech_offer: number | null;
};

/** Full diagnostic record (matches backend DynamoDB item) */
export type DiagnosticRecord = {
  ticketNo: string;
  recordType: "PLUMBING_DIAGNOSTIC";
  vendorId?: string;
  selectedVendorId?: string;
  callerNumber?: string;
  callSid: string;
  endReason?: string;
  callerSummary?: string;
  ticketBound?: boolean;
  endedAtMs?: number;
  startedAtMs?: number;
  updatedAtMs?: number;
  activeTicket?: {
    propertyAddress?: string;
    coveredItem?: string;
    ticketStatus?: string;
  };
  plumbingDiagnostic: PlumbingDiagnostic;
  plumbingParts: PlumbingPartRow[];
  selectedTechnician?: Record<string, unknown>;
};

/** Flat snake_case shape as stored by Lambda in plumbingDiagnostic */
export type PlumbingDiagnostic = {
  // Core diagnostic fields
  calling_for_diagnosis?: boolean;
  description?: string;
  location?: string;
  access_required?: boolean;
  access_price?: number;
  access_closing_included?: boolean;
  issue_begin?: string;
  malfunction_cause?: string;
  condition?: string;
  condition_poor_specify?: string;
  details?: string;
  next_step_recommendation?: string;
  parts_needed?: boolean;
  shipping_cost?: number;
  tax?: number;
  labor_cost_self_supplied_parts?: number;
  enable_live_resolution?: boolean;
  is_technician_onsite?: boolean;
  is_customer_onsite?: boolean;
  waive_service_call_fee?: string;
  note?: string;
  change_task_status?: string;
  // Totals
  parts_cost_total?: number;
  labor_total?: number;
  final_total?: number;
  // Technician identity
  technician_company_name?: string;
  technician_company_only?: string;
  technician_email?: string;
  technician_phone?: string;
  // LHG benchmark values
  lhg_hourly_rate?: number;
  lhg_labor?: number;
  lhg_parts_total?: number;
  lhg_total?: number;
  lhg_labor_ceiling?: number;
  lhg_parts_ceiling?: number;
  // Negotiation context flags
  labor_flag?: boolean;
  follow_up_labor?: boolean;
  acceptable_ceiling?: number;
  within_ceiling?: boolean;
  bundle_lhg_total?: number;
  bundle_tech_parts_total?: number;
  bundle_approved?: boolean;
  follow_up_parts?: boolean;
  unpriced_parts_count?: number;
  // Negotiation outcome
  approved_labor?: number;
  approved_parts?: number;
  approved_total?: number;
  follow_up_required?: boolean;
  negotiation_note?: string;
  // Parts negotiation results
  parts_negotiation_results?: NegotiationPartResult[];
  // Negotiation attempt histories
  labor_negotiation_attempts?: NegotiationAttempt[];
  parts_negotiation_attempts?: NegotiationAttempt[];
};

/** Part row as stored by Lambda in plumbingParts */
export type PlumbingPartRow = {
  part_name?: string;
  quantity?: number;
  tech_price?: number;
  location_of_repair?: string;
};
