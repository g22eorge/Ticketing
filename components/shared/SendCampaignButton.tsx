"use client";

import { useState } from "react";

interface SendResult {
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export function SendCampaignButton({ campaignId, pendingCount }: { campaignId: string; pendingCount: number }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<SendResult | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  if (pendingCount === 0) return null;

  async function handleSend() {
    if (state === "loading") return;
    if (!confirm(`Send this campaign to ${pendingCount} pending contact${pendingCount === 1 ? "" : "s"}?`)) return;
    setState("loading");
    setResult(null);
    setErrMsg(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data.error ?? "Send failed");
        setState("error");
        return;
      }
      setResult(data as SendResult);
      setState("done");
      // Reload to show updated statuses
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Network error");
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleSend}
        disabled={state === "loading"}
        className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {state === "loading" ? "Sending…" : (
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            {`Send to ${pendingCount} pending`}
          </span>
        )}
      </button>
      {state === "done" && result && (
        <p className="text-xs text-green-700">
          ✓ Queued {result.sent} · Skipped {result.skipped}{result.failed > 0 ? ` · Failed ${result.failed}` : ""}
        </p>
      )}
      {state === "error" && errMsg && (
        <p className="text-xs text-red-600">✕ {errMsg}</p>
      )}
    </div>
  );
}
