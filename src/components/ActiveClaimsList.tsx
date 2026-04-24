import { useState, useMemo, useCallback, useEffect } from "react";
import type { ActiveClaimRow } from "../types/diagnostics";
import {
  fetchDiagnosticsUpdates,
  fetchDiagnosticByTicket,
  diagnosticToClaimRow,
} from "../api/diagnostics";
import ConversationPanel from "./ConversationPanel";
import type { ConvCacheEntry, TranscriptCacheEntry } from "../services/elevenLabsService";
import {
  fetchConversationsByPhone,
  fetchConversationTranscript,
} from "../services/elevenLabsService";

type Tab = "transcript" | "diagnostic";

type ClaimGroup = {
  key: string; // callerNumber, or ticketNo if no phone
  tickets: ActiveClaimRow[];
};

const LIST_LIMIT = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPD(record: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!record) return {};
  return ((record.plumbingDiagnostic ?? record.plumbing_diagnostic) ?? {}) as Record<string, unknown>;
}

function s(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

// ── Profile card (left panel) ─────────────────────────────────────────────────

function ProfileCard({
  group,
  diagRecord,
  isSelected,
  onClick,
}: {
  group: ClaimGroup;
  diagRecord: Record<string, unknown> | undefined;
  isSelected: boolean;
  onClick: () => void;
}) {
  const representative = group.tickets[0];
  const d = extractPD(diagRecord);
  const company = s(d.technician_company_only ?? d.technician_company_name);
  const phone = s(d.technician_phone) || representative.callerNumber || "";
  const email = s(d.technician_email);
  const count = group.tickets.length;

  const displayName = company || representative.ticketNo;
  const initial = displayName[0]?.toUpperCase() ?? "P";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full border-b border-neutral-800 py-3 pr-4 text-left transition-colors ${
        isSelected
          ? "border-l-[3px] border-l-teal-500 bg-neutral-800 pl-[13px]"
          : "border-l-[3px] border-l-transparent pl-[13px] hover:bg-neutral-800/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
          {initial}
          {count > 1 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
              {count}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{displayName}</p>
          <p className="truncate text-xs text-neutral-400">
            Plumbing{phone ? ` · ${phone}` : ""}
          </p>
          {email ? (
            <p className="truncate text-xs text-neutral-500">{email}</p>
          ) : (
            <p className="truncate text-xs text-neutral-500">
              {company ? representative.ticketNo : representative.propertyAddress}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function SkeletonProfileCard() {
  return (
    <div className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
      <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-neutral-700" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-36 animate-pulse rounded bg-neutral-700" />
        <div className="h-3 w-24 animate-pulse rounded bg-neutral-700" />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ActiveClaimsList() {
  // ── Claims state ──────────────────────────────────────────────────────────
  const [claims, setClaims] = useState<ActiveClaimRow[]>([]);
  const [maxSavedAtMs, setMaxSavedAtMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // ── Selection state ───────────────────────────────────────────────────────
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [activeTicketByGroup, setActiveTicketByGroup] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<Tab>("transcript");

  // ── Conversation state ────────────────────────────────────────────────────
  const [convCache, setConvCache] = useState<Record<string, ConvCacheEntry>>({});
  const [transcriptCache, setTranscriptCache] = useState<Record<string, TranscriptCacheEntry>>({});
  const [techPhoneByTicket, setTechPhoneByTicket] = useState<Record<string, string>>({});

  // ── Diagnostic state ──────────────────────────────────────────────────────
  const [diagRecordByTicket, setDiagRecordByTicket] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [diagLoadingByTicket, setDiagLoadingByTicket] = useState<Record<string, boolean>>({});

  // ── Grouped claims ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return claims;
    const q = search.trim().toLowerCase();
    return claims.filter(
      (c) =>
        c.ticketNo.toLowerCase().includes(q) ||
        c.coveredItem.toLowerCase().includes(q) ||
        c.propertyAddress.toLowerCase().includes(q) ||
        (c.ticketStatus && c.ticketStatus.toLowerCase().includes(q))
    );
  }, [claims, search]);

  const groupedFiltered = useMemo<ClaimGroup[]>(() => {
    const map = new Map<string, ActiveClaimRow[]>();
    for (const claim of filtered) {
      const key = claim.callerNumber ?? claim.ticketNo;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(claim);
    }
    return Array.from(map.entries()).map(([key, tickets]) => ({ key, tickets }));
  }, [filtered]);

  // ── Derived selected-ticket data ──────────────────────────────────────────
  const selectedGroup = groupedFiltered.find((g) => g.key === selectedGroupKey) ?? null;
  const selectedTicketNo = selectedGroup
    ? (activeTicketByGroup[selectedGroupKey!] ?? selectedGroup.tickets[0].ticketNo)
    : null;
  const selectedClaim = claims.find((c) => c.ticketNo === selectedTicketNo) ?? null;
  const selectedDiagRecord = selectedTicketNo ? diagRecordByTicket[selectedTicketNo] : undefined;
  const selectedDiagLoading = selectedTicketNo
    ? (diagLoadingByTicket[selectedTicketNo] ?? false)
    : false;
  const selectedConvEntry = selectedTicketNo ? convCache[selectedTicketNo] : undefined;
  const selectedTechPhone = selectedTicketNo ? techPhoneByTicket[selectedTicketNo] : undefined;

  // ── Refresh ───────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchDiagnosticsUpdates(maxSavedAtMs, LIST_LIMIT);
      const newRows = items.map(diagnosticToClaimRow);
      setClaims((prev) => {
        const byTicket = new Map(prev.map((c) => [c.ticketNo, c]));
        for (const row of newRows) byTicket.set(row.ticketNo, row);
        return Array.from(byTicket.values());
      });
      const maxMs = Math.max(
        maxSavedAtMs ?? 0,
        ...newRows.map((r) => r.savedAtMs ?? 0),
        0
      );
      if (maxMs > 0) setMaxSavedAtMs(maxMs);
      if (newRows.length > 0) {
        setSelectedGroupKey((prev) => prev ?? (newRows[0].callerNumber ?? newRows[0].ticketNo));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load updates");
    } finally {
      setLoading(false);
    }
  }, [maxSavedAtMs]);

  // ── Diagnostic loader ─────────────────────────────────────────────────────
  const ensureDiagLoaded = useCallback(
    async (ticketNo: string): Promise<string | undefined> => {
      if (diagRecordByTicket[ticketNo]) return techPhoneByTicket[ticketNo];
      if (diagLoadingByTicket[ticketNo]) return undefined;

      setDiagLoadingByTicket((prev) => ({ ...prev, [ticketNo]: true }));
      try {
        const record = await fetchDiagnosticByTicket(ticketNo);
        setDiagRecordByTicket((prev) => ({ ...prev, [ticketNo]: record }));
        const pd = (record.plumbingDiagnostic ?? record.plumbing_diagnostic) as
          | Record<string, unknown>
          | undefined;
        const raw = pd?.technician_phone;
        const phone =
          typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
        if (phone) setTechPhoneByTicket((prev) => ({ ...prev, [ticketNo]: phone }));
        return phone;
      } catch {
        return undefined;
      } finally {
        setDiagLoadingByTicket((prev) => ({ ...prev, [ticketNo]: false }));
      }
    },
    [diagRecordByTicket, diagLoadingByTicket, techPhoneByTicket]
  );

  // ── Conversation loaders ──────────────────────────────────────────────────
  const loadConversations = useCallback(
    async (ticketNo: string, phoneNumber: string) => {
      setConvCache((prev) => {
        if (prev[ticketNo]) return prev;
        return { ...prev, [ticketNo]: { status: "loading" } };
      });
      try {
        const data = await fetchConversationsByPhone(phoneNumber);
        setConvCache((prev) => ({ ...prev, [ticketNo]: { status: "done", data } }));
      } catch (e) {
        setConvCache((prev) => ({
          ...prev,
          [ticketNo]: {
            status: "error",
            message: e instanceof Error ? e.message : "Failed to load calls",
          },
        }));
      }
    },
    []
  );

  const loadTranscript = useCallback(async (conversationId: string) => {
    setTranscriptCache((prev) => {
      if (prev[conversationId]) return prev;
      return { ...prev, [conversationId]: { status: "loading" } };
    });
    try {
      const data = await fetchConversationTranscript(conversationId);
      setTranscriptCache((prev) => ({
        ...prev,
        [conversationId]: { status: "done", data },
      }));
    } catch {
      setTranscriptCache((prev) => {
        const next = { ...prev };
        delete next[conversationId];
        return next;
      });
    }
  }, []);

  // ── Selection handlers ────────────────────────────────────────────────────
  const handleSelectGroup = useCallback(
    (groupKey: string) => {
      if (selectedGroupKey === groupKey) return;
      setSelectedGroupKey(groupKey);
      setActiveTab("transcript");
    },
    [selectedGroupKey]
  );

  const handleSelectTicketInGroup = useCallback(
    (groupKey: string, ticketNo: string) => {
      setActiveTicketByGroup((prev) => ({ ...prev, [groupKey]: ticketNo }));
      setActiveTab("transcript");
    },
    []
  );

  // ── Load data whenever active ticket changes ──────────────────────────────
  useEffect(() => {
    if (!selectedTicketNo) return;
    let active = true;
    ensureDiagLoaded(selectedTicketNo).then((phone) => {
      if (active && phone) loadConversations(selectedTicketNo, phone);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicketNo]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 text-white shadow-lg">
      {/* ══ LEFT PANEL ══ */}
      <div className="flex w-96 shrink-0 flex-col border-r border-neutral-800">
        {/* Header */}
        <div className="shrink-0 border-b border-neutral-800 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold leading-tight text-white">
              Plumbing Claim Diagnostics
              <span className="ml-1.5 rounded-full bg-neutral-700 px-2 py-0.5 text-xs font-medium text-neutral-300">
                {claims.length}
              </span>
            </h2>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="shrink-0 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-white disabled:opacity-50"
              title="Refresh"
            >
              <svg
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </span>
            <input
              type="search"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-1.5 pl-8 pr-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-3 mt-3 rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Profile card list */}
        <div className="flex-1 overflow-y-auto">
          {loading && claims.length === 0 && (
            <>
              <SkeletonProfileCard />
              <SkeletonProfileCard />
              <SkeletonProfileCard />
              <SkeletonProfileCard />
            </>
          )}
          {!loading && claims.length === 0 && !error && (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">
              No records yet. Click refresh.
            </p>
          )}
          {groupedFiltered.map((group) => (
            <ProfileCard
              key={group.key}
              group={group}
              diagRecord={diagRecordByTicket[
                activeTicketByGroup[group.key] ?? group.tickets[0].ticketNo
              ]}
              isSelected={selectedGroupKey === group.key}
              onClick={() => handleSelectGroup(group.key)}
            />
          ))}
          {claims.length > 0 && groupedFiltered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">
              No matches.
            </p>
          )}
        </div>
      </div>

      {/* ══ RIGHT PANEL ══ */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedClaim && selectedGroup ? (
          <>
            {/* Right panel header */}
            <div className="shrink-0 border-b border-neutral-800 px-6 py-4">
              <h2 className="text-base font-bold text-white">{selectedClaim.ticketNo}</h2>
              <p className="text-sm text-neutral-300">{selectedClaim.coveredItem}</p>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500">
                <svg
                  className="h-3.5 w-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                <span className="truncate">{selectedClaim.propertyAddress}</span>
              </div>
            </div>

            {/* Ticket tabs (only shown when group has multiple tickets) */}
            {selectedGroup.tickets.length > 1 && (
              <div className="shrink-0 border-b border-neutral-800 bg-neutral-900/50 px-6">
                <div className="flex items-center gap-1 overflow-x-auto py-2">
                  {selectedGroup.tickets.map((ticket) => {
                    const isActive = ticket.ticketNo === selectedTicketNo;
                    return (
                      <button
                        key={ticket.ticketNo}
                        type="button"
                        onClick={() => handleSelectTicketInGroup(selectedGroup.key, ticket.ticketNo)}
                        className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-teal-600 text-white"
                            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                        }`}
                      >
                        {ticket.ticketNo}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab toggle */}
            <div className="flex shrink-0 border-b border-neutral-800 px-6">
              {(["transcript", "diagnostic"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? "border-teal-500 text-white"
                      : "border-transparent text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {tab === "transcript" ? "View Transcript" : "View Diagnostic"}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ConversationPanel
                ticketNo={selectedClaim.ticketNo}
                phoneNumber={selectedTechPhone}
                convEntry={selectedConvEntry}
                transcriptCache={transcriptCache}
                onLoadTranscript={loadTranscript}
                diagRecord={selectedDiagRecord}
                diagLoading={selectedDiagLoading}
                activeTab={activeTab}
                onSwitchToTranscript={() => setActiveTab("transcript")}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
            {claims.length === 0
              ? "Load claims to get started."
              : "Select a profile to view."}
          </div>
        )}
      </div>
    </div>
  );
}
