"use client";
import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1 text-[13px] font-semibold transition hover:border-[var(--accent)]/50"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}