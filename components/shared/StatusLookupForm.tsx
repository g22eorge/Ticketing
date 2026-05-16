"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StatusLookupForm() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const job = value.trim().toUpperCase();
    if (job) router.push(`/status/${encodeURIComponent(job)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. EI-2024-0001"
        required
        className="flex-1 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 font-mono text-sm text-white placeholder-white/25 outline-none backdrop-blur-sm transition focus:border-[#D4AF37]/50 focus:bg-white/[0.07]"
      />
      <button
        type="submit"
        className="shrink-0 rounded-xl px-5 py-3 text-sm font-bold text-black shadow-[0_2px_10px_rgba(212,175,55,0.25)] transition active:scale-95"
        style={{ background: "linear-gradient(180deg,#E8C84A 0%,#C9A020 100%)" }}
      >
        Track →
      </button>
    </form>
  );
}
