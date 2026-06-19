"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TicketUpdateFormProps {
  ticketId: string;
  currentStatus: string;
  currentPriority: string;
  currentAssignedToId: string | null;
  currentResolution: string | null;
  users: Array<{ id: string; name: string }>;
}

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"];
const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function TicketUpdateForm({
  ticketId,
  currentStatus,
  currentPriority,
  currentAssignedToId,
  currentResolution,
  users,
}: TicketUpdateFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = {
      status: (form.elements.namedItem("status") as HTMLSelectElement).value,
      priority: (form.elements.namedItem("priority") as HTMLSelectElement).value,
      assignedToId: (form.elements.namedItem("assignedToId") as HTMLSelectElement).value || null,
      resolution: (form.elements.namedItem("resolution") as HTMLTextAreaElement).value,
    };

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tickets/" + ticketId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setMessage({ type: "success", text: "Ticket updated successfully." });
        router.refresh();
      } else {
        setMessage({ type: "error", text: json.error ?? "Failed to update ticket." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {message && (
        <div className={"rounded-lg px-4 py-3 text-sm font-medium " + (message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200")}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Status</label>
          <select name="status" defaultValue={currentStatus}
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500">
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Priority</label>
          <select name="priority" defaultValue={currentPriority}
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500">
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Assigned To</label>
        <select name="assignedToId" defaultValue={currentAssignedToId ?? ""}
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500">
          <option value="">Unassigned</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Resolution / Notes</label>
        <textarea name="resolution" rows={3} defaultValue={currentResolution ?? ""} placeholder="Add resolution notes..."
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none" />
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={busy}
          className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-60">
          {busy ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
