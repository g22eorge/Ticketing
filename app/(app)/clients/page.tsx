export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { formatEATDate } from "@/lib/date-eat";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimpleTable, PageLayout } from "@/components/ui/SimpleTable";

type ClientRow = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  clientType: string;
  isSLACovered: boolean;
  slaEndDate: string | null;
  tickets: number;
  createdAt: string;
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; sla?: string }>;
}) {
  const { user, orgId } = await requireOrgSession();
  if (!can.viewClientInfo(user)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const slaFilter = params.sla;
  const page = Math.max(Number(params.page ?? "1") || 1, 1);
  const pageSize = 20;

  const where = {
    orgId,
    ...(slaFilter === "1" ? { isSLACovered: true } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {}),
  };

  const [clients, total, slaCount] = await Promise.all([
    prisma.client.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        clientType: true,
        isSLACovered: true,
        slaEndDate: true,
        createdAt: true,
        _count: { select: { jobs: true, tickets: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.client.count({ where }),
    prisma.client.count({ where: { orgId, isSLACovered: true } }),
  ]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    phone: c.phone,
    email: c.email,
    clientType: c.clientType,
    isSLACovered: c.isSLACovered,
    slaEndDate: c.slaEndDate ? formatEATDate(c.slaEndDate) : null,
    tickets: c._count.jobs + c._count.tickets,
    createdAt: formatEATDate(c.createdAt),
  }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageLayout
        title="Clients"
        subtitle={`${total} clients${slaCount > 0 ? ` · ${slaCount} SLA-covered` : ""}`}
        action={
          <div className="flex gap-2">
            {slaFilter !== "1" && (
              <Link
                href="/clients?sla=1"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
              >
                SLA Clients
              </Link>
            )}
            <Link
              href="/tickets/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              + New Ticket
            </Link>
          </div>
        }
        searchPlaceholder="Search clients..."
        searchValue={q}
        page={page}
        totalPages={totalPages}
      >
        <form
          action={async (formData: FormData) => {
            "use server";
            const { user, orgId } = await requireOrgSession();
            if (!user) return;
            const fullName = String(formData.get("fullName") ?? "").trim();
            const phone = String(formData.get("phone") ?? "").trim();
            const email = String(formData.get("email") ?? "").trim() || undefined;
            const clientType = String(formData.get("clientType") ?? "INDIVIDUAL");
            const isSLACovered = formData.get("isSLACovered") === "on";
            if (!fullName || !phone) return;
            await prisma.client.create({
              data: { orgId, fullName, phone, email, clientType: clientType as never, isSLACovered },
            });
            revalidatePath("/clients");
          }}
          className="flex flex-wrap items-end gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm"
        >
          <input name="fullName" required placeholder="Full name" className="w-48 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/20" />
          <input name="phone" required placeholder="Phone" className="w-48 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/20" />
          <input name="email" placeholder="Email (optional)" className="w-48 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/20" />
          <select name="clientType" aria-label="Client type" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]/60">
            <option value="INDIVIDUAL">Individual</option>
            <option value="COMPANY">Company</option>
            <option value="SCHOOL">School</option>
            <option value="NGO">NGO</option>
            <option value="GOVERNMENT">Government</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm text-[var(--ink-muted)]">
            <input type="checkbox" name="isSLACovered" className="h-4 w-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500" />
            SLA
          </label>
          <button type="submit" className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110">Add Client</button>
        </form>

        <SimpleTable
          rows={rows}
          keyExtractor={(r) => r.id}
          emptyState={<EmptyState title="No clients found" description="Add a client to get started." />}
          columns={[
            { header: "Name", render: (r) => (
              <div>
                <Link href={`/clients/${r.id}`} className="font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline">{r.fullName}</Link>
                {r.isSLACovered && <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">SLA</span>}
              </div>
            )},
            { header: "Phone", render: (r) => r.phone },
            { header: "Email", render: (r) => r.email ?? "—" },
            { header: "Type", render: (r) => <span className="capitalize text-[var(--ink-muted)]">{r.clientType.toLowerCase()}</span> },
            { header: "Tickets", render: (r) => (
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--panel-strong)] text-xs font-medium text-[var(--ink)]">
                {r.tickets}
              </span>
            )},
            { header: "Created", render: (r) => <span className="text-[var(--ink-muted)]">{r.createdAt}</span> },
          ]}
        />
      </PageLayout>
    </div>
  );
}
