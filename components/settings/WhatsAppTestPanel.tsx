"use client";

import { useActionState, useEffect, useRef } from "react";

import { sendTestWhatsAppAction, type SendTestResult } from "@/app/(app)/settings/notifications/whatsapp/actions";

interface Props {
  from: string;
  verifiedName: string | null;
}

export function WhatsAppTestPanel({ from, verifiedName }: Props) {
  const [result, action, pending] = useActionState<SendTestResult | null, FormData>(
    sendTestWhatsAppAction,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (result?.ok) formRef.current?.reset();
  }, [result]);

  return (
    <div className="panel-shadow space-y-5 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          Send Test Message
        </p>
        <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
          Verify end-to-end delivery from your business number to a real WhatsApp recipient.
        </p>
      </div>

      {/* From display */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          From (WhatsApp Business Number)
        </p>
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </span>
          <div>
            <p className="text-sm font-bold text-[var(--ink)]">{from}</p>
            {verifiedName ? (
              <p className="text-[11px] text-[var(--ink-muted)]">{verifiedName}</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Form */}
      <form ref={formRef} action={action} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--ink)]">
            To (recipient number)
          </label>
          <input
            name="to"
            type="tel"
            placeholder="+256 7XX XXX XXX"
            required
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
          />
          <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
            Use the real phone number of the WhatsApp account you want to send to.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--ink)]">
            Message
          </label>
          <textarea
            name="message"
            rows={4}
            required
            defaultValue="Hello! This is a test message sent from the Eagle Info Solutions repair management system via WhatsApp Business API."
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="btn-premium flex items-center gap-2 rounded-lg px-4 py-2 text-sm disabled:opacity-60"
        >
          {pending ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
              Sending…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Send via WhatsApp
            </>
          )}
        </button>
      </form>

      {/* Result */}
      {result ? (
        result.ok ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <svg className="mt-0.5 shrink-0 text-emerald-600" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <div>
                <p className="text-sm font-semibold text-emerald-800">Message sent successfully</p>
                <p className="mt-0.5 text-xs text-emerald-700">
                  From <span className="font-mono font-semibold">{result.from}</span> → <span className="font-mono font-semibold">{result.to}</span>
                </p>
                <p className="mt-1 font-mono text-[11px] text-emerald-600 break-all">
                  Message ID: {result.messageId}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <svg className="mt-0.5 shrink-0 text-red-500" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div>
                <p className="text-sm font-semibold text-red-700">Send failed</p>
                <p className="mt-0.5 text-xs text-red-600">{result.error}</p>
              </div>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
