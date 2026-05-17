"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PosSession, Sale, SaleItem } from "@prisma/client";

import { addSaleItem, removeSaleItem, recordPayment, voidSale, createSale, closeSession } from "../actions";

const currency = (process.env.NEXT_PUBLIC_APP_CURRENCY ?? "UGX").toUpperCase() || "UGX";
const ZERO_DECIMAL = new Set(["UGX", "JPY", "KRW"]);

function fmt(amount: number) {
  const digits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount)}`;
}

type SaleWithItems = Sale & { items: SaleItem[] };
type SessionWithOperator = PosSession & { operator: { name: string } };

type Props = {
  posSession: SessionWithOperator;
  openSale: SaleWithItems | null;
  canProcessRefunds: boolean;
  canApplyDiscount: boolean;
};

export function PosSessionClient({ posSession, openSale, canProcessRefunds, canApplyDiscount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closingBalance, setClosingBalance] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("0");

  const [payMethod, setPayMethod] = useState<"CASH" | "CARD" | "MOBILE_MONEY">("CASH");
  const [payAmount, setPayAmount] = useState("");
  const [payRef, setPayRef] = useState("");

  const isClosed = posSession.status === "CLOSED";
  const sale = openSale;

  function refresh() {
    router.refresh();
  }

  function handleAddItem() {
    if (!sale) return;
    const qtyNum = Math.max(1, Math.floor(Number(qty) || 1));
    const priceNum = parseFloat(price) || 0;
    const discNum = parseFloat(discount) || 0;
    if (!desc.trim() || priceNum <= 0) {
      toast.error("Description and price are required");
      return;
    }
    startTransition(async () => {
      try {
        await addSaleItem(sale.id, { description: desc.trim(), quantity: qtyNum, unitPrice: priceNum, discount: discNum });
        refresh();
        setDesc("");
        setQty("1");
        setPrice("");
        setDiscount("0");
        toast.success("Item added");
      } catch {
        toast.error("Failed to add item");
      }
    });
  }

  function handleRemoveItem(itemId: string) {
    if (!sale) return;
    startTransition(async () => {
      try {
        await removeSaleItem(itemId);
        refresh();
      } catch {
        toast.error("Failed to remove item");
      }
    });
  }

  function handleRecordPayment() {
    if (!sale) return;
    const amount = parseFloat(payAmount) || 0;
    if (amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    startTransition(async () => {
      try {
        await recordPayment(sale.id, { amount, method: payMethod, reference: payRef || undefined });
        refresh();
        setPayAmount("");
        setPayRef("");
        toast.success("Payment recorded");
      } catch {
        toast.error("Failed to record payment");
      }
    });
  }

  function handleVoidSale() {
    if (!sale) return;
    if (!confirm("Void this sale?")) return;
    startTransition(async () => {
      try {
        await voidSale(sale.id);
        refresh();
        toast.success("Sale voided");
      } catch {
        toast.error("Failed to void sale");
      }
    });
  }

  function handleNewSale() {
    startTransition(async () => {
      try {
        await createSale(posSession.id);
        refresh();
        setDesc("");
        setQty("1");
        setPrice("");
        setDiscount("0");
        setPayAmount("");
        setPayRef("");
        toast.success("New sale started");
      } catch {
        toast.error("Failed to start new sale");
      }
    });
  }

  function handleCloseSession() {
    const balance = parseFloat(closingBalance);
    if (!Number.isFinite(balance)) {
      toast.error("Enter actual closing balance");
      return;
    }
    startTransition(async () => {
      try {
        await closeSession(posSession.id, { actualClosingBalance: balance, notes: closeNotes || undefined });
        setShowCloseDialog(false);
        router.push("/pos");
      } catch {
        toast.error("Failed to close session");
      }
    });
  }

  const subtotal = sale?.subtotal ?? 0;
  const discountTotal = sale?.discountAmount ?? 0;
  const total = sale?.totalAmount ?? 0;
  const paid = sale?.paidAmount ?? 0;
  const remaining = Math.max(0, total - paid);

  const inputClass =
    "rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-[var(--ink-muted)]">
            Operator: <span className="font-medium text-[var(--ink)]">{posSession.operator.name}</span>
            {" · "}
            Opened {new Date(posSession.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isClosed ? "bg-[var(--panel-strong)] text-[var(--ink-muted)]" : "bg-emerald-500/15 text-emerald-400"}`}>
            {isClosed ? "CLOSED" : "OPEN"}
          </span>
          {!isClosed ? (
            <button
              onClick={() => setShowCloseDialog(true)}
              className="btn-premium-secondary rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              Close Session
            </button>
          ) : null}
        </div>
      </div>

      <div className="panel-shadow grid grid-cols-2 gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 md:grid-cols-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Float</p>
          <p className="text-sm font-semibold text-[var(--ink)]">{fmt(posSession.openingFloat)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Total Collected</p>
          <p className="text-sm font-semibold text-[var(--ink)]">{fmt(posSession.totalSales)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Sales</p>
          <p className="text-sm font-semibold text-[var(--ink)]">{posSession.salesCount}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Expected Balance</p>
          <p className="text-sm font-semibold text-[var(--ink)]">{fmt(posSession.openingFloat + posSession.totalSales)}</p>
        </div>
      </div>

      {!isClosed ? (
        <>
          {!sale ? (
            <div className="panel-shadow flex flex-col items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] py-12 text-center">
              <p className="text-sm text-[var(--ink-muted)]">No active sale</p>
              <button
                onClick={handleNewSale}
                disabled={isPending}
                className="btn-premium rounded-lg px-5 py-2 text-sm font-semibold"
              >
                Start Sale
              </button>
            </div>
          ) : sale.status === "VOIDED" ? (
            <div className="panel-shadow flex flex-col items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] py-12 text-center">
              <p className="text-sm text-[var(--ink-muted)]">Sale voided</p>
              <button onClick={handleNewSale} disabled={isPending} className="btn-premium rounded-lg px-5 py-2 text-sm font-semibold">
                New Sale
              </button>
            </div>
          ) : sale.status === "COMPLETED" ? (
            <div className="panel-shadow flex flex-col items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] py-12 text-center">
              <p className="text-sm font-semibold text-emerald-400">Sale {sale.saleNumber} completed</p>
              <p className="text-xs text-[var(--ink-muted)]">Total: {fmt(sale.totalAmount)}</p>
              <button onClick={handleNewSale} disabled={isPending} className="btn-premium rounded-lg px-5 py-2 text-sm font-semibold">
                New Sale
              </button>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="panel-shadow space-y-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[var(--ink)]">Sale {sale.saleNumber}</h2>
                  <button
                    onClick={handleNewSale}
                    disabled={isPending}
                    className="btn-premium-secondary rounded-lg px-2.5 py-1 text-xs"
                  >
                    New Sale
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] text-[var(--ink-muted)]">Description</label>
                    <input
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      placeholder="Item description"
                      className={`${inputClass} w-full`}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[var(--ink-muted)]">Qty</label>
                    <input
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      type="number"
                      min="1"
                      className={`${inputClass} w-full`}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[var(--ink-muted)]">Unit price</label>
                    <input
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      className={`${inputClass} w-full`}
                    />
                  </div>
                  {canApplyDiscount ? (
                    <div className="col-span-2 sm:col-span-4">
                      <label className="mb-1 block text-[11px] text-[var(--ink-muted)]">Discount per unit</label>
                      <input
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        className={`${inputClass} w-48`}
                      />
                    </div>
                  ) : null}
                </div>
                <button
                  onClick={handleAddItem}
                  disabled={isPending}
                  className="btn-premium w-full rounded-lg py-2 text-sm font-semibold"
                >
                  Add Item
                </button>

                {sale.items.length > 0 ? (
                  <div className="space-y-1 border-t border-[var(--line)] pt-3">
                    {sale.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-[var(--ink)]">{item.description}</p>
                          <p className="text-xs text-[var(--ink-muted)]">
                            {item.quantity} × {fmt(item.unitPrice)}
                            {item.discount > 0 ? ` − ${fmt(item.discount)} disc.` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--ink)]">{fmt(item.lineTotal)}</span>
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            disabled={isPending}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--line)] text-[var(--ink-muted)] transition hover:border-red-500/40 hover:text-red-400"
                            aria-label="Remove item"
                          >
                            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="space-y-1 border-t border-[var(--line)] pt-2 text-sm">
                      <div className="flex justify-between text-[var(--ink-muted)]">
                        <span>Subtotal</span>
                        <span>{fmt(subtotal)}</span>
                      </div>
                      {discountTotal > 0 ? (
                        <div className="flex justify-between text-[var(--ink-muted)]">
                          <span>Discount</span>
                          <span>−{fmt(discountTotal)}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between font-semibold text-[var(--ink)]">
                        <span>Total</span>
                        <span>{fmt(total)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="py-4 text-center text-sm text-[var(--ink-muted)]">No items yet</p>
                )}
              </section>

              <section className="panel-shadow space-y-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
                <h2 className="text-sm font-semibold text-[var(--ink)]">Payment</h2>

                <div className="space-y-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                  <div className="flex justify-between text-sm text-[var(--ink-muted)]">
                    <span>Total</span>
                    <span className="font-semibold text-[var(--ink)]">{fmt(total)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-[var(--ink-muted)]">
                    <span>Paid</span>
                    <span>{fmt(paid)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-[var(--ink-muted)]">Remaining</span>
                    <span className={remaining > 0 ? "text-[var(--accent)]" : "text-emerald-400"}>{fmt(remaining)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-[var(--ink-muted)]">Method</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
                      className={`${inputClass} w-full`}
                    >
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card</option>
                      <option value="MOBILE_MONEY">Mobile Money</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[var(--ink-muted)]">Amount</label>
                    <input
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      type="number"
                      min="0"
                      step="any"
                      placeholder={String(remaining)}
                      className={`${inputClass} w-full`}
                    />
                  </div>
                  {payMethod !== "CASH" ? (
                    <div>
                      <label className="mb-1 block text-[11px] text-[var(--ink-muted)]">Reference</label>
                      <input
                        value={payRef}
                        onChange={(e) => setPayRef(e.target.value)}
                        placeholder="Transaction ref"
                        className={`${inputClass} w-full`}
                      />
                    </div>
                  ) : null}
                </div>

                <button
                  onClick={handleRecordPayment}
                  disabled={isPending || sale.items.length === 0}
                  className="btn-premium w-full rounded-lg py-2 text-sm font-semibold"
                >
                  Record Payment
                </button>

                {canProcessRefunds ? (
                  <button
                    onClick={handleVoidSale}
                    disabled={isPending}
                    className="w-full rounded-lg border border-red-500/30 py-2 text-sm font-medium text-red-400 transition hover:border-red-500/60 hover:bg-red-500/10"
                  >
                    Void Sale
                  </button>
                ) : null}
              </section>
            </div>
          )}
        </>
      ) : (
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--ink-muted)]">This session is closed.</p>
          {posSession.actualClosingBalance !== null ? (
            <p className="mt-1 text-sm text-[var(--ink)]">
              Actual closing balance: <span className="font-semibold">{fmt(posSession.actualClosingBalance)}</span>
            </p>
          ) : null}
        </div>
      )}

      {showCloseDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="panel-shadow w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold text-[var(--ink)]">Close Session</h3>
            <p className="mb-4 text-sm text-[var(--ink-muted)]">Enter the actual cash in your drawer to reconcile.</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] text-[var(--ink-muted)]">Actual closing balance</label>
                <input
                  value={closingBalance}
                  onChange={(e) => setClosingBalance(e.target.value)}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  className={`${inputClass} w-full`}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[var(--ink-muted)]">Notes (optional)</label>
                <textarea
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  rows={2}
                  className={`${inputClass} w-full resize-none`}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowCloseDialog(false)}
                className="btn-premium-secondary flex-1 rounded-lg py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseSession}
                disabled={isPending}
                className="btn-premium flex-1 rounded-lg py-2 text-sm font-semibold"
              >
                Close Session
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
