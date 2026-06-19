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
  tickets: number;
  createdAt: string;
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { user, orgId } = await requireOrgSession();
  if (!can.viewClientInfo(user)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(Number(params.page ?? "1") || 1, 1);
  const pageSize = 20;

  const where = {
    orgId,
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

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        createdAt: true,
        _count: { select: { jobs: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.client.count({ where }),
  ]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    phone: c.phone,
    email: c.email,
    tickets: c._count.jobs,
    createdAt: formatEATDate(c.createdAt),
  }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <PageLayout
        title="Clients"
        subtitle="Manage your client list."
        action={
          <Link
            href="/tickets/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
          >
            + New Ticket
          </Link>
        }
        searchPlaceholder="Search clients..."
        searchValue={q}
        page={page}
        totalPages={totalPages}
      >
        {/* Inline add client form */}
        <form
          action={async (formData: FormData) => {
            "use server";
            const { user, orgId } = await requireOrgSession();
            if (!user) return;
            const fullName = String(formData.get("fullName") ?? "").trim();
            const phone = String(formData.get("phone") ?? "").trim();
            const email = String(formData.get("email") ?? "").trim() || undefined;
            if (!fullName || !phone) return;
            await prisma.client.create({ data: { orgId, fullName, phone, email } });
            revalidatePath("/clients");
          }}
          className="flex flex-wrap items-end gap-2 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <input name="fullName" required placeholder="Full name" className="w-48 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none transition focus:border-stone-400 focus:ring-1 focus:ring-stone-400" />
          <input name="phone" required placeholder="Phone" className="w-48 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none transition focus:border-stone-400 focus:ring-1 focus:ring-stone-400" />
          <input name="email" placeholder="Email (optional)" className="w-48 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none transition focus:border-stone-400 focus:ring-1 focus:ring-stone-400" />
          <button type="submit" className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800">Add Client</button>
        </form>

        <SimpleTable
          rows={rows}
          keyExtractor={(r) => r.id}
          emptyState={<EmptyState title="No clients found" description="Add a client to get started." />}
          columns={[
            { header: "Name", render: (r) => <span className="font-medium text-stone-900">{r.fullName}</span> },
            { header: "Phone", render: (r) => r.phone },
            { header: "Email", render: (r) => r.email ?? "—" },
            {
              header: "Tickets",
              render: (r) => (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-xs font-medium text-stone-700">
                  {r.tickets}
                </span>
              ),
            },
            { header: "Created", render: (r) => <span className="text-stone-500">{r.createdAt}</span> },
          ]}
        />
      </PageLayout>
    </div>
  );
}
