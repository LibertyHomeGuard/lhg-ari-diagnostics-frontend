/**
 * ElevenLabs service layer.
 * All calls go through the backend proxy — the ElevenLabs API key never reaches the browser.
 */

import { API_BASE } from "../api/diagnostics";

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

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch conversations for a phone number via the backend proxy.
 * The backend handles ElevenLabs pagination and phone filtering server-side.
 */
export async function fetchConversationsByPhone(
  phoneNumber: string
): Promise<ConversationStub[]> {
  const e164 = toE164(phoneNumber);
  const url = `${API_BASE}/api/elevenlabs/conversations?phone=${encodeURIComponent(e164)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to load conversations: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Fetch the full turn-by-turn transcript for a single conversation via the backend proxy. */
export async function fetchConversationTranscript(
  conversationId: string
): Promise<TranscriptTurn[]> {
  const url = `${API_BASE}/api/elevenlabs/conversations/${encodeURIComponent(conversationId)}/transcript`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to load transcript: ${text.slice(0, 200)}`);
  }
  return res.json();
}
