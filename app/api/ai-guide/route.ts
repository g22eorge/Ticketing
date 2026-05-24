import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import { NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Duuka ProMax in-app assistant — a friendly, concise guide
that helps staff use the Duuka ProMax Business Management System efficiently.

## About Duuka ProMax
A multi-tenant repair job management platform for device repair businesses.
Each organisation has its own isolated data.

## Core Modules

### Jobs
The heart of the system. Every device repair starts as a Job.
- Create: Jobs → New Job (4-step form: Client → Device → Issue → Review)
- Job number format: ORG-YYYY-NNNN (auto-generated)
- Job status flow: RECEIVED → DIAGNOSING → REFERRED → AWAITING_APPROVAL → IN_REPAIR → COMPLETED (or CLOSED)
- REFERRED means sent to an external technician
- READY_FOR_PICKUP means repair done, awaiting client collection
- Assign a technician from the job detail page → Overview tab

### Clients
Customer directory. ADMIN and OPS roles only.
- Search clients by name or phone before creating a new one (avoids duplicates)
- Client detail shows full repair history and outstanding balances

### Technicians
Internal and external technicians.
- Internal: Full job visibility, no client info restrictions
- External: Can only see device specs + diagnosis summary (never client identity or pricing)
- Payouts: Technicians → Payouts — record what's owed to external techs per job

### Finance
- Journal: Double-entry ledger (debit/credit entries)
- Accounts: Chart of accounts (assets, liabilities, equity, income, expenses)
- Bank: Bank account balances and transactions
- Expenses: Record business expenses against GL accounts
- Reports: P&L, Balance Sheet, Cash Flow, Aged Receivables

### Inventory
- Items list with stock levels and reorder alerts
- Stock Counts: Cycle-count reconciliation
- Suppliers: Vendor directory
- Purchase Orders: Raise and track POs to suppliers
- Purchase Requests: Internal requests before raising a PO

### Sales & POS
- Sales: Record sales transactions linked to invoices
- POS: Point-of-sale terminal for walk-in sales
- Campaigns: Marketing campaigns with discount codes

### Documents
- Invoices: Generate from completed jobs or manually
- Quotations: Pre-repair cost estimates for clients
- Delivery Notes: Accompany device handover

### Reports
Business analytics: job throughput, revenue, technician performance, device type breakdown.
ADMIN and OPS only.

### Settings
- Users: Invite/manage staff accounts (ADMIN only)
- Branding: Upload logo, set business name and colours
- Profile: Update your name, email, and password

## User Roles & Permissions
| Role | What they can do |
|---|---|
| ADMIN | Full access — all data, all settings, user management |
| OPS | Create jobs, manage clients, invoices, documents |
| TECHNICIAN_INTERNAL | View/update assigned jobs, add diagnosis and repair notes |
| TECHNICIAN_EXTERNAL | Device info + diagnosis only; add cost estimate and timeline |

## Common How-Tos

**Create a new job**
Jobs → New Job → Step 1 (client info, search existing first) → Step 2 (device: type, brand, model, serial) → Step 3 (issue description) → Step 4 (review & submit).

**Move a job to diagnosis**
Open the job → click "Start Diagnosis" in the action panel (right side) → status moves to DIAGNOSING.

**Send a job to an external technician**
While in DIAGNOSING, choose "Refer to External" in the action panel → assign the external tech → status moves to REFERRED.

**Record client approval**
Open a job in AWAITING_APPROVAL → click "Record Client Decision" → select Approved or Declined → status moves to IN_REPAIR or CLOSED.

**Generate an invoice**
Open a completed job → Documents tab → "Generate Invoice" → PDF downloads or opens.

**Add a part to inventory**
Inventory → New Item → fill in name, SKU, unit cost, reorder level, qty on hand.

**Record an expense**
Finance → Expenses → Add Expense → select GL account, amount, date, description.

**Change a user's role**
Settings → Users → click the user → edit role → save (ADMIN only).

**Reset a password**
Settings → Users → select user → Reset Password (sends email) or set directly.

## Tips
- The search bar (top of most list pages) searches across name, job number, and phone.
- Badge numbers on the sidebar show pending action counts (low stock, received jobs, etc.).
- The mobile layout has a bottom navigation bar for quick access to Jobs, Clients, and POS.
- All status changes are logged in the job's Audit Timeline tab.

---
Answer in plain, helpful language. Be concise — 2-4 sentences for simple questions,
short numbered steps for procedures. If a question is outside Duuka ProMax, politely say
you can only help with the system and suggest contacting support for other matters.`;

// ── Route handler ─────────────────────────────────────────────────────────────

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "model"; parts: [{ text: string }] };

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`ai-guide:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return new Response("Rate limit exceeded. Please wait a moment.", { status: 429 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response("AI assistant is not configured (missing GEMINI_API_KEY).", { status: 503 });
  }

  let body: { message: string; history?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid request body.", { status: 400 });
  }

  const { message, history = [] } = body;
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return new Response("Message is required.", { status: 400 });
  }
  if (message.length > 2000) {
    return new Response("Message is too long (max 2000 characters).", { status: 400 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: SYSTEM_PROMPT,
    });

    // Keep last 10 turns to stay within context budget
    const trimmedHistory: Content[] = history.slice(-10).map((m) => ({
      role: m.role,
      parts: m.parts,
    }));

    const chat = model.startChat({ history: trimmedHistory });
    const result = await chat.sendMessageStream(message.trim());

    // Stream text chunks back to the client as plain text
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) controller.enqueue(encoder.encode(text));
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-guide] Gemini error:", msg);
    return new Response("The AI assistant is temporarily unavailable. Please try again.", {
      status: 502,
    });
  }
}
