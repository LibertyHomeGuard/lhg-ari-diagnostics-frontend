/**
 * ElevenLabs Conversational AI service layer.
 * All API calls go through this module — no inline fetches in components.
 */

const BASE_URL = "https://api.elevenlabs.io/v1/convai";

// ── API response types ───────────────────────────────────────────────────────

export type ConversationStatus = "done" | "in-progress" | "processing" | "failed";

export type ConversationStub = {
  conversation_id: string;
  agent_id: string;
  status: ConversationStatus;
  start_time_unix_secs: number;
  call_duration_secs: number;
  metadata?: Record<string, unknown>;
  analysis?: {
    summary?: string;
    evaluation?: Record<string, unknown>;
    data_collection?: Record<string, unknown>;
  };
};

export type TranscriptTurn = {
  role: "agent" | "user";
  message: string;
  time_in_call_secs: number;
};

// ── UI cache entry types (used by ActiveClaimsList + ConversationPanel) ──────

export type ConvCacheEntry =
  | { status: "loading" }
  | { status: "done"; data: ConversationStub[] }
  | { status: "error"; message: string };

export type TranscriptCacheEntry =
  | { status: "loading" }
  | { status: "done"; data: TranscriptTurn[] };

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize to E.164 format. Handles 10-digit US, 11-digit US, already-formatted. */
export function toE164(phone: string): string {
  if (phone.startsWith("+")) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

/** Last 10 digits of any value, for loose phone matching. */
function last10(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "").slice(-10);
}

function getApiKey(): string {
  const key = (import.meta as { env: Record<string, string | undefined> }).env
    .VITE_ELEVENLABS_API_KEY;
  if (!key) throw new Error("VITE_ELEVENLABS_API_KEY is not configured in frontend/.env");
  return key;
}

async function elevenLabsGet<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const key = getApiKey();

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  console.log("[ElevenLabs] GET", url.toString());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "xi-api-key": key },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("ElevenLabs request timed out after 15s");
    }
    throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }
  clearTimeout(timeout);

  console.log("[ElevenLabs] status", res.status);

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    console.error("[ElevenLabs] error body", text);
    throw new Error(`ElevenLabs API ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  console.log("[ElevenLabs] response", data);
  return data as T;
}

// ── Conversation detail (full) ────────────────────────────────────────────────

type ConvDetailResponse = {
  conversation_id: string;
  transcript?: TranscriptTurn[];
  metadata?: {
    /** Caller's phone number for inbound Twilio / SIP telephony calls. */
    external_number?: string;
    /** ElevenLabs phone number ID that received the call. */
    phone_number_id?: string;
    /** The ElevenLabs / agent-side phone number (NOT the caller). */
    agent_number?: string;
    [key: string]: unknown;
  };
  analysis?: {
    summary?: string;
    evaluation?: Record<string, unknown>;
    data_collection?: Record<string, unknown>;
    data_collection_results?: Record<string, unknown>;
  };
  conversation_initiation_client_data?: {
    /** system__caller_id is auto-populated by ElevenLabs with the caller's phone. */
    dynamic_variables?: Record<string, unknown>;
    conversation_config_override?: Record<string, unknown>;
  };
};

/**
 * Extract the caller's phone number (last 10 digits) from a conversation detail.
 *
 * ElevenLabs stores the inbound caller's number in two places (per API docs):
 *   1. metadata.external_number      — caller's phone for Twilio / SIP telephony calls
 *   2. dynamic_variables.system__caller_id — ElevenLabs auto-populated caller ID variable
 *
 * We check those first, then fall back to other common field names.
 * We deliberately skip metadata.agent_number (that's the ElevenLabs line, not the caller).
 */
function phoneFromDetail(detail: ConvDetailResponse): string {
  const m = detail.metadata ?? {};
  const dv = detail.conversation_initiation_client_data?.dynamic_variables ?? {};

  const candidates: unknown[] = [
    // Primary sources (ElevenLabs docs)
    m.external_number,                       // inbound caller's number (Twilio / SIP)
    dv["system__caller_id"],                 // ElevenLabs auto-populated caller ID

    // Secondary: other common caller fields
    m.caller_id, m.caller_phone_number, m.phone_number, m.from_number, m.From, m.from, m.caller,
    dv.caller_id, dv.caller_phone_number, dv.caller, dv.From, dv.from,
  ];

  // Also scan data_collection results (agent may have collected technician phone via tools)
  const dc =
    (detail.analysis?.data_collection ?? detail.analysis?.data_collection_results ?? {}) as
      Record<string, unknown>;
  for (const entry of Object.values(dc)) {
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      candidates.push(e.value, e.phone, e.phone_number);
    } else {
      candidates.push(entry);
    }
  }

  return (
    candidates
      .filter(Boolean)
      .map((v) => last10(v))
      .find((v) => v.length === 10) ?? ""
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

type ConvListResponse = {
  conversations: ConversationStub[];
  next_cursor?: string;
};

/**
 * Fetch conversations for a phone number.
 *
 * The ElevenLabs list endpoint ignores the `phone_number` query param and
 * returns ALL agent conversations. The caller phone is only available in each
 * conversation's detail response (Twilio stores it in dynamic_variables).
 * We therefore:
 *   1. Fetch all list pages.
 *   2. Fetch every conversation's detail in parallel.
 *   3. Keep only conversations whose detail contains a matching phone number.
 */
export async function fetchConversationsByPhone(
  phoneNumber: string
): Promise<ConversationStub[]> {
  const e164 = toE164(phoneNumber);
  const targetLast10 = last10(e164);
  const all: ConversationStub[] = [];
  let cursor: string | undefined;

  // Step 1 — paginate through the list
  do {
    const params: Record<string, string> = {};
    if (cursor) params.cursor = cursor;
    const res = await elevenLabsGet<ConvListResponse>("/conversations", params);
    all.push(...(res.conversations ?? []));
    cursor = res.next_cursor;
  } while (cursor);

  if (all.length === 0) return [];

  // Step 2 — fetch all details in parallel to extract caller phone
  console.log(`[ElevenLabs] Fetching ${all.length} conversation details for phone filtering…`);
  const detailResults = await Promise.allSettled(
    all.map((conv) =>
      elevenLabsGet<ConvDetailResponse>(
        `/conversations/${encodeURIComponent(conv.conversation_id)}`
      )
    )
  );

  // Step 3 — keep only conversations whose caller phone matches
  const filtered = all.filter((_, i) => {
    const r = detailResults[i];
    if (r.status === "rejected") return false;
    const phone = phoneFromDetail(r.value);
    const match = phone === targetLast10;
    console.log(
      `[ElevenLabs] ${all[i].conversation_id}: extracted phone="${phone}", target="${targetLast10}", match=${match}`
    );
    return match;
  });

  if (filtered.length === 0) {
    // Log a sample detail so we can identify the correct phone field name
    const sample = detailResults.find((r) => r.status === "fulfilled");
    console.warn(
      "[ElevenLabs] No conversations matched phone",
      e164,
      "— sample detail for field inspection:",
      sample?.status === "fulfilled" ? sample.value : "(all detail fetches failed)"
    );
  }

  filtered.sort((a, b) => b.start_time_unix_secs - a.start_time_unix_secs);
  return filtered;
}

/** Fetch the full turn-by-turn transcript for a single conversation. */
export async function fetchConversationTranscript(
  conversationId: string
): Promise<TranscriptTurn[]> {
  const res = await elevenLabsGet<ConvDetailResponse>(
    `/conversations/${encodeURIComponent(conversationId)}`
  );
  return res.transcript ?? [];
}
