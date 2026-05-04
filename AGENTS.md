# AGENT.md — Eagle Info Machine Repair Management System
> **For AI Agents & Developers:** This document is the single source of truth for building this application. Follow the phases in strict order. Do not skip ahead. Each phase must be fully complete and verified before proceeding to the next.

---

## 📐 Project Overview

**App Name:** Eagle Info Repair Manager  
**Purpose:** A role-based, multi-tenant repair job management system for a device repair business. Supports in-house and external technician workflows with strict client data protection.

**Core Business Rule:** External technicians NEVER see client identity or pricing history. They only see device specs and diagnosis summaries.

---

## 🛠️ Tech Stack (Locked — Do Not Deviate)

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Database | SQLite (local) via Prisma ORM |
| Auth | BetterAuth |
| UI | shadcn/ui + Tailwind CSS |
| File Uploads | Local filesystem (`/uploads`) or `next/server` route handlers |
| State | React Server Components + `useActionState` / `useState` |
| Forms | React Hook Form + Zod validation |
| Notifications | shadcn Toast / Sonner |

---

## 👥 User Roles (Non-Negotiable)

| Role | Key Permissions |
|---|---|
| `ADMIN` | Full access — all jobs, all clients, all reports, pricing overrides, user management |
| `TECHNICIAN_INTERNAL` | View assigned jobs, add diagnosis, update repair work |
| `TECHNICIAN_EXTERNAL` | View job ID + device specs + diagnosis summary ONLY. Can add cost estimate & timeline. Cannot see client info |
| `OPS` | Create jobs, capture client + device info, communicate with client, update approval status, add notes, view costs, generate invoices, track payments |

---

## 🗂️ Job Status Flow (Enum — Enforce in DB and UI)

```
RECEIVED → DIAGNOSING → REFERRED → AWAITING_APPROVAL → IN_REPAIR → COMPLETED
                                                      ↘ CLOSED (client declined or unrepairable)
```

---

## 🧱 PHASE 1 — Project Scaffold & Auth

**Goal:** Running Next.js app with BetterAuth, Prisma + SQLite, and role-based session.

### 1.1 Init Project
```bash
npx create-next-app@latest eagle-repair --typescript --tailwind --app --src-dir
cd eagle-repair
```

### 1.2 Install Core Dependencies
```bash
# Prisma + SQLite
npm install prisma @prisma/client
npx prisma init --datasource-provider sqlite

# BetterAuth
npm install better-auth

# shadcn/ui
npx shadcn@latest init
# Choose: Default style, Slate base color, CSS variables: yes

# Forms + Validation
npm install react-hook-form zod @hookform/resolvers

# Utilities
npm install sonner date-fns clsx
```

### 1.3 Prisma Schema (`prisma/schema.prisma`)

Define the **full schema** in one go. All models below are required:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

// ── AUTH (BetterAuth required tables) ──────────────────────────────────────

model User {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  emailVerified Boolean  @default(false)
  image         String?
  role          Role     @default(OPS)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  sessions      Session[]
  accounts      Account[]
  jobsCreated   Job[]         @relation("CreatedBy")
  jobsAssigned  Job[]         @relation("AssignedTo")
  auditLogs     AuditLog[]
}

model Session {
  id        String   @id @default(cuid())
  expiresAt DateTime
  token     String   @unique
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Account {
  id                    String    @id @default(cuid())
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}

model Verification {
  id         String   @id @default(cuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

// ── CORE BUSINESS MODELS ────────────────────────────────────────────────────

enum Role {
  ADMIN
  TECHNICIAN_INTERNAL
  TECHNICIAN_EXTERNAL
  OPS
}

enum JobStatus {
  RECEIVED
  DIAGNOSING
  REFERRED
  AWAITING_APPROVAL
  IN_REPAIR
  COMPLETED
  CLOSED
}

enum RepairPath {
  IN_HOUSE
  EXTERNAL
}

enum DeviceType {
  PHONE_ANDROID
  PHONE_IPHONE
  TABLET
  WINDOWS_PC
  MAC
  OTHER
}

model Client {
  id           String   @id @default(cuid())
  fullName     String
  phone        String
  email        String?
  organization String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  jobs         Job[]
}

model Job {
  id              String      @id @default(cuid())
  jobNumber       String      @unique // human-readable, e.g. EI-2024-0001
  status          JobStatus   @default(RECEIVED)
  repairPath      RepairPath?

  // Relations
  clientId        String
  client          Client      @relation(fields: [clientId], references: [id])
  createdById     String
  createdBy       User        @relation("CreatedBy", fields: [createdById], references: [id])
  assignedToId    String?
  assignedTo      User?       @relation("AssignedTo", fields: [assignedToId], references: [id])

  // Device info
  deviceType      DeviceType
  brand           String
  model           String
  serialOrImei    String?
  accessories     String?     // comma-separated or JSON string
  physicalNotes   String?

  // Job details
  issueDescription     String   // client's words
  diagnosisNotes       String?  // internal
  externalDiagnosis    String?  // external tech input (no client info here)
  recommendedRepair    String?
  partsNeeded          String?

  // Financials
  costEstimate         Float?
  finalCost            Float?
  clientApproved       Boolean?
  approvalDate         DateTime?
  quotedAt             DateTime?

  // Timeline
  repairTimeline       String?  // e.g. "2-3 days"
  technicianNotes      String?
  workDone             String?
  partsReplaced        String?

  // Dates
  receivedAt      DateTime    @default(now())
  completedAt     DateTime?
  closedAt        DateTime?
  updatedAt       DateTime    @updatedAt

  photos          Photo[]
  auditLogs       AuditLog[]
}

model Photo {
  id        String   @id @default(cuid())
  jobId     String
  job       Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  url       String
  label     String?  // e.g. "before", "during", "after"
  uploadedAt DateTime @default(now())
}

model AuditLog {
  id        String   @id @default(cuid())
  jobId     String
  job       Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  action    String   // e.g. "STATUS_CHANGED", "DIAGNOSIS_ADDED"
  detail    String?  // JSON string of what changed
  createdAt DateTime @default(now())
}
```

Run migrations:
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 1.4 BetterAuth Setup

Create `src/lib/auth.ts`:
```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  session: { cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 7 } },
});
```

Create `src/app/api/auth/[...all]/route.ts`:
```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const { GET, POST } = toNextJsHandler(auth);
```

Create `src/lib/auth-client.ts`:
```ts
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({ baseURL: process.env.NEXT_PUBLIC_APP_URL });
```

### 1.5 Route Protection Middleware

Create `src/middleware.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export function middleware(req: NextRequest) {
  const session = getSessionCookie(req);
  const isPublic = PUBLIC_PATHS.some(p => req.nextUrl.pathname.startsWith(p));
  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
```

### 1.6 Seed Admin User
Create `prisma/seed.ts` to create the first ADMIN user on `npm run seed`.

### ✅ Phase 1 Done When:
- [ ] App runs on `localhost:3000`
- [ ] `/login` page works with email + password
- [ ] Session persists across refreshes
- [ ] Unauthenticated users redirected to `/login`
- [ ] Prisma Studio shows all tables created

---

## 🧱 PHASE 2 — Layout, Navigation & Role Shell

**Goal:** Authenticated shell with sidebar, role-aware navigation, and protected route groups.

### 2.1 Install shadcn Components
```bash
npx shadcn@latest add sidebar button badge avatar dropdown-menu separator skeleton toast
```

### 2.2 Route Structure

```
src/app/
├── (auth)/
│   └── login/page.tsx
├── (app)/
│   ├── layout.tsx           ← Authenticated shell with sidebar
│   ├── dashboard/page.tsx
│   ├── jobs/
│   │   ├── page.tsx         ← Job list
│   │   ├── new/page.tsx     ← Create job (OPS, ADMIN)
│   │   └── [id]/
│   │       ├── page.tsx     ← Job detail (role-filtered view)
│   │       └── edit/page.tsx
│   ├── clients/
│   │   ├── page.tsx         ← Client list (ADMIN, OPS only)
│   │   └── [id]/page.tsx
│   ├── technicians/page.tsx ← External tech portal filtered view
│   ├── reports/page.tsx     ← ADMIN, OPS only
│   └── settings/
│       ├── users/page.tsx   ← ADMIN only
│       └── profile/page.tsx
└── api/
    ├── auth/[...all]/route.ts
    ├── jobs/route.ts
    ├── jobs/[id]/route.ts
    └── upload/route.ts
```

### 2.3 Sidebar Navigation (Role-Filtered)

Build a `<AppSidebar>` component that shows nav items based on session role:

| Nav Item | Visible To |
|---|---|
| Dashboard | All |
| Jobs | All |
| Clients | ADMIN, OPS |
| Reports | ADMIN, OPS |
| Users / Settings | ADMIN only |

### 2.4 Role Guard Utility

Create `src/lib/permissions.ts`:
```ts
import { Role } from "@prisma/client";

export const can = {
  viewClientInfo: (role: Role) => ["ADMIN", "OPS"].includes(role),
  viewFinancials: (role: Role) => ["ADMIN", "OPS"].includes(role),
  createJob: (role: Role) => ["ADMIN", "OPS"].includes(role),
  editDiagnosis: (role: Role) => ["ADMIN", "TECHNICIAN_INTERNAL", "TECHNICIAN_EXTERNAL"].includes(role),
  manageUsers: (role: Role) => role === "ADMIN",
  approveWork: (role: Role) => ["ADMIN", "OPS"].includes(role),
};
```

Use this in both Server Components (check session role) and API routes.

### ✅ Phase 2 Done When:
- [ ] Authenticated users see role-appropriate sidebar
- [ ] ADMIN sees all nav items
- [ ] TECHNICIAN_EXTERNAL sees only Jobs (filtered)
- [ ] Unauthenticated access to `(app)` routes redirects to login

---

## 🧱 PHASE 3 — Job Creation (Intake Flow)

**Goal:** Multi-step form to create a new repair job capturing all required data.

### 3.1 Install Components
```bash
npx shadcn@latest add form input select textarea card progress stepper
```

### 3.2 Multi-Step Form Steps

Build as a client component with local step state. Steps:

**Step 1 — Client Info**
- Full Name (required)
- Phone (required)
- Email (optional)
- Organization (optional)
- Search existing clients by phone to avoid duplicates

**Step 2 — Device Info**
- Device Type (select: Phone Android / iPhone / Tablet / Windows PC / Mac / Other)
- Brand (text input with suggestions)
- Model (required)
- Serial / IMEI (optional)
- Accessories brought in (textarea)
- Physical condition notes (textarea)
- Photo upload (before repair) — multiple files

**Step 3 — Issue Description**
- Issue description (client's exact words) — large textarea
- Received by (auto-filled from session)
- Date received (auto-filled, editable)

**Step 4 — Review & Submit**
- Summary of all entered data
- Submit button → creates Job + Client records
- Auto-generate Job Number: `EI-YYYY-XXXX`

### 3.3 Job Number Generation

```ts
// In your API route / server action
async function generateJobNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.job.count();
  return `EI-${year}-${String(count + 1).padStart(4, "0")}`;
}
```

### 3.4 Server Action
Use Next.js Server Actions for form submission. Validate with Zod on server. Create `Client` if new, then create `Job`, then create initial `AuditLog` entry.

### ✅ Phase 3 Done When:
- [ ] OPS/ADMIN can create a full job in 4 steps
- [ ] Duplicate client check works
- [ ] Job number auto-generates correctly
- [ ] Job appears in job list with status `RECEIVED`
- [ ] Audit log entry created on job creation

---

## 🧱 PHASE 4 — Job List & Filtering

**Goal:** Paginated, filterable job list — filtered by role automatically.

### 4.1 Components
```bash
npx shadcn@latest add table pagination input select badge
```

### 4.2 Columns (Table)

| Column | Who Sees It |
|---|---|
| Job # | All |
| Device | All |
| Status (badge) | All |
| Client Name | All except TECHNICIAN_EXTERNAL |
| Assigned To | ADMIN, OPS |
| Received Date | All |
| Cost Estimate | ADMIN, OPS |
| Actions | All (context-sensitive) |

### 4.3 Filters
- Status (multi-select)
- Device Type
- Repair Path (In-house / External)
- Date range
- Search (job number or client name — hidden from external tech)

### 4.4 Role-Based Data Fetching

In the API/server component, filter query based on role:
- `TECHNICIAN_EXTERNAL`: Only see jobs assigned to them, exclude `client` relation from response
- `TECHNICIAN_INTERNAL`: Only see jobs assigned to them
- All others: See all jobs (with client info)

### ✅ Phase 4 Done When:
- [ ] Job list loads with pagination
- [ ] Filters work correctly
- [ ] External tech cannot see client names in list
- [ ] Status badges use correct colors per status

---

## 🧱 PHASE 5 — Job Detail & Diagnosis Flow

**Goal:** Role-filtered job detail page with status-driven action panels.

### 5.1 Job Detail Page Layout

```
[Job Header: Job # | Status Badge | Device Info | Assigned To]
[Tabs]
  → Overview       (all roles — device + issue summary)
  → Client Info    (hidden from TECHNICIAN_EXTERNAL)
  → Diagnosis      (editable by TECHNICIAN_INTERNAL, TECHNICIAN_EXTERNAL — limited)
  → Repair Log     (editable by TECHNICIAN_INTERNAL, ADMIN)
  → Financials     (ADMIN, OPS only)
  → Timeline/Audit (ADMIN, OPS)
  → Photos         (all roles)
```

### 5.2 Status-Driven Action Panels

Render action panel based on current status:

| Current Status | Available Actions |
|---|---|
| `RECEIVED` | "Start Diagnosis" → sets `DIAGNOSING` |
| `DIAGNOSING` | Add diagnosis notes. Choose repair path → sets `IN_REPAIR` or `REFERRED` |
| `REFERRED` | External tech adds estimate. OPS/ADMIN reviews → sets `AWAITING_APPROVAL` |
| `AWAITING_APPROVAL` | OPS records client decision → `IN_REPAIR` or `CLOSED` |
| `IN_REPAIR` | Tech updates work done, parts, notes → sets `COMPLETED` |
| `COMPLETED` / `CLOSED` | Read-only. Can generate invoice |

### 5.3 External Tech View (Critical)

When `session.role === TECHNICIAN_EXTERNAL`, the job detail MUST:
- ✅ Show: Job Number, Device Type, Brand, Model, Serial, Accessories, Diagnosis Summary
- ❌ Hide: Client name, phone, email, organization, cost history, internal notes tab
- ✅ Allow: Updating external diagnosis, parts needed, cost estimate, timeline field only

Implement this as a **separate component** `<ExternalTechJobView>` rendered conditionally.

### 5.4 Audit Log Display
Every status change, field update, and note addition must:
1. Write to `AuditLog` table (who, what, when)
2. Display in Timeline tab as a vertical feed

### ✅ Phase 5 Done When:
- [ ] Job detail shows correct tabs per role
- [ ] External tech cannot see client tab (tested manually)
- [ ] Status transitions work and update DB
- [ ] Each status action writes an audit log
- [ ] External tech can submit estimate; internal staff can view it

---

## 🧱 PHASE 6 — Client Management

**Goal:** Protected client directory. Not visible to external techs.

### 6.1 Route Guard
`/clients` and `/clients/[id]` — server-side check: redirect if role is `TECHNICIAN_EXTERNAL` or `TECHNICIAN_INTERNAL`.

### 6.2 Client Detail Page
- Client info (editable by ADMIN, OPS)
- Job history (all jobs linked to client, with status)
- Notes field

### ✅ Phase 6 Done When:
- [ ] External/internal techs cannot access `/clients`
- [ ] Client page shows full job history
- [ ] Client info is editable by authorized roles

---

## 🧱 PHASE 7 — Photo Uploads

**Goal:** Before/during/after photos attached to jobs.

### 7.1 Upload Route
Create `src/app/api/upload/route.ts` using Next.js `formData()`. Save files to `public/uploads/jobs/[jobId]/`. Return file URL.

### 7.2 Photo Component
- Upload button with label selector (before / during / after / other)
- Image grid display on job detail Photos tab
- Delete (ADMIN only)

### ✅ Phase 7 Done When:
- [ ] Photos upload and persist across page reloads
- [ ] Photos visible in Photos tab
- [ ] Labels display correctly

---

## 🧱 PHASE 8 — Reports Dashboard

**Goal:** Admin/OPS reporting page.

Route: `/reports` — protected for `ADMIN` and `OPS` roles.

### Metrics to Display:
- Total jobs by status (bar or donut chart)
- Repairs by device type
- In-house vs External ratio
- Revenue this month (sum of `finalCost` where `COMPLETED`)
- Most common faults (from diagnosis text — simple frequency count)
- Average repair time (receivedAt → completedAt)

Use shadcn `Card` components for metric tiles. Use Recharts (included in Next.js) or `chart.js` for charts.

### ✅ Phase 8 Done When:
- [ ] Reports page loads with real data from DB
- [ ] Charts render correctly
- [ ] Non-admin/ops roles get 403 or redirect

---

## 🧱 PHASE 9 — User Management

**Goal:** Admin can create, view, edit, and deactivate users.

Route: `/settings/users` — ADMIN only.

### Features:
- List all users with role badges
- Invite / create user (name, email, password, role)
- Edit role
- Deactivate user (set a `isActive` flag — add to schema if needed)

### ✅ Phase 9 Done When:
- [ ] Admin can create users with any role
- [ ] Role changes reflect immediately on next login
- [ ] Non-admin cannot access this route

---

## 🧱 PHASE 10 — Polish, Validation & Edge Cases

**Goal:** Production hardening.

### Checklist:
- [ ] All forms have Zod validation (client + server)
- [ ] All API routes check session + role before any DB operation
- [ ] Loading states on all async actions (use `useTransition` or `isPending`)
- [ ] Error boundaries on key pages
- [ ] Empty states for all lists (no jobs, no clients, etc.)
- [ ] Confirm dialogs for destructive actions (close job, delete photo)
- [ ] Responsive layout (mobile-friendly sidebar collapses)
- [ ] Toast notifications for all actions (success + error)
- [ ] 404 page for unknown job IDs
- [ ] Input sanitization (especially free-text fields)
- [ ] `NEXT_PUBLIC_APP_URL` and any secrets in `.env.local` (never committed)

---

## 🔒 Security Invariants (Never Violate These)

These must be enforced at the **API/server layer**, not just UI:

1. **Client PII never reaches TECHNICIAN_EXTERNAL** — exclude `client` from Prisma queries for external tech sessions
2. **Role checks happen server-side** — never trust client-sent role values
3. **Job number ≠ sequential integer** — use padded count, not raw ID
4. **Audit log is append-only** — never delete audit log entries
5. **File uploads validate type + size** — accept only images (jpeg, png, webp), max 5MB

---

## 📁 Key File Reference

```
src/
├── lib/
│   ├── auth.ts              ← BetterAuth config
│   ├── auth-client.ts       ← Client-side auth hooks
│   ├── prisma.ts            ← Prisma singleton
│   └── permissions.ts       ← Role permission helpers
├── components/
│   ├── jobs/
│   │   ├── JobTable.tsx
│   │   ├── JobStatusBadge.tsx
│   │   ├── JobDetailTabs.tsx
│   │   ├── ExternalTechJobView.tsx   ← Critical isolation component
│   │   └── NewJobStepper.tsx
│   ├── layout/
│   │   ├── AppSidebar.tsx
│   │   └── Header.tsx
│   └── shared/
│       ├── AuditTimeline.tsx
│       └── PhotoUploader.tsx
├── app/
│   └── (structure as defined in Phase 2)
└── middleware.ts
```

---

## 🚀 Deployment Notes (For Later)

- SQLite is suitable for single-server deployment (VPS, Railway, Render)
- For multi-server, migrate schema to PostgreSQL (change `provider` in `schema.prisma` only — queries stay the same)
- Use `pm2` or platform-managed process for Node.js
- Set up daily SQLite backups (`cp dev.db backups/dev-$(date +%F).db`)

---

## ✅ Master Completion Checklist

- [ ] Phase 1 — Scaffold, Auth, DB
- [ ] Phase 2 — Layout & Role Shell
- [ ] Phase 3 — Job Creation (Intake)
- [ ] Phase 4 — Job List & Filtering
- [ ] Phase 5 — Job Detail & Diagnosis Flow
- [ ] Phase 6 — Client Management
- [ ] Phase 7 — Photo Uploads
- [ ] Phase 8 — Reports Dashboard
- [ ] Phase 9 — User Management
- [ ] Phase 10 — Polish & Hardening

**Do not mark a phase complete until every checkbox in that phase is verified.**
