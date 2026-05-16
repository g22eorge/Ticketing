"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoneyCompact } from "@/lib/currency";

export function ReportsCharts({
  statusData,
  deviceData,
  from,
  to,
}: {
  statusData: { key?: string; name: string; value: number }[];
  deviceData: { key?: string; name: string; value: number }[];
  from?: string;
  to?: string;
}) {
  const [shouldRender, setShouldRender] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setShouldRender(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const rangeSuffix = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return qs ? `&${qs}` : "";
  }, [from, to]);

  const tooltipStyle = {
    backgroundColor: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    fontSize: 12,
    color: "var(--ink)",
  } as const;

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="panel-shadow h-72 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="mb-2 text-xs uppercase tracking-[0.15em] text-[var(--ink-muted)]">Jobs by Status</p>
        <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={220}>
          <BarChart
            data={statusData}
            margin={{ top: 8, right: 12, left: 0, bottom: 44 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis
              dataKey="name"
              interval={0}
              angle={-25}
              height={54}
              textAnchor="end"
              tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
              axisLine={{ stroke: "var(--line)" }}
              tickLine={{ stroke: "var(--line)" }}
            />
            <YAxis tick={{ fontSize: 11, fill: "var(--ink-muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={{ stroke: "var(--line)" }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar
              dataKey="value"
              fill="var(--accent)"
              radius={[6, 6, 0, 0]}
              cursor="pointer"
              onClick={(_, index) => {
                const item = statusData[index];
                if (!item?.key) return;
                router.push(`/jobs?status=${encodeURIComponent(item.key)}${rangeSuffix}`);
              }}
            />
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-[11px] text-[var(--ink-muted)]">Tip: click a bar to open the matching jobs.</p>
      </div>
      <div className="panel-shadow h-72 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="mb-2 text-xs uppercase tracking-[0.15em] text-[var(--ink-muted)]">Repairs by Device Type</p>
        <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={220}>
          <PieChart>
             <Pie data={deviceData} dataKey="value" nameKey="name" outerRadius={90}>
               {deviceData.map((entry, index) => (
                 <Cell
                   key={entry.name}
                   fill={["var(--ink)", "var(--accent)", "var(--ink-muted)", "var(--ink)", "var(--accent)", "var(--ink-muted)"][index % 6]}
                 />
               ))}
             </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RevenueLineChart({
  data,
  currency,
}: {
  data: { key: string; revenue: number; margin: number }[];
  currency: string;
}) {
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const tooltipStyle = {
    backgroundColor: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    fontSize: 12,
    color: "var(--ink)",
  } as const;

  if (!mounted) {
    return <div className="h-64 w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] animate-pulse" />;
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 text-sm text-[var(--ink-muted)]">
        No revenue data for this period.
      </div>
    );
  }

  // Only show the margin line when it differs from revenue (i.e. external tech costs exist).
  const showMargin = data.some((d) => d.margin !== d.revenue);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={180}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="key" tick={{ fontSize: 11, fill: "var(--ink-muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={{ stroke: "var(--line)" }} />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={{ stroke: "var(--line)" }}
            tickFormatter={(value) => formatMoneyCompact(Number(value), currency).replace(`${currency} `, "")}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => {
              const numeric = typeof value === "number" ? value : Number(value);
              const label = name === "margin" ? "Margin" : name === "revenue" ? "Revenue" : String(name);
              return [formatMoneyCompact(numeric, currency), label];
            }}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="var(--accent)"
            strokeWidth={2.5}
            dot={{ fill: "var(--accent)", strokeWidth: 0, r: 4 }}
            name="Revenue"
          />
          {showMargin && (
            <Line
              type="monotone"
              dataKey="margin"
              stroke="#10b981"
              strokeOpacity={0.9}
              strokeWidth={2}
              strokeDasharray="4 2"
              dot={{ fill: "#10b981", strokeWidth: 0, r: 3 }}
              name="Margin"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TechnicianBarChart({
  data,
}: {
  data: { name: string; completed: number; total: number }[];
}) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const sync = () => setShouldRender(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const tooltipStyle = {
    backgroundColor: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    fontSize: 12,
    color: "var(--ink)",
  } as const;

  if (!shouldRender || data.length === 0) return null;

  return (
    <div className="panel-shadow h-56 w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="mb-2 text-xs uppercase tracking-[0.15em] text-[var(--ink-muted)]">Completed vs Assigned</p>
      <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={160}>
        <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis
            dataKey="name"
            interval={0}
            angle={-20}
            height={44}
            textAnchor="end"
              tick={{ fontSize: 10, fill: "var(--ink-muted)" }}
              axisLine={{ stroke: "var(--line)" }}
              tickLine={{ stroke: "var(--line)" }}
            />
          <YAxis tick={{ fontSize: 10, fill: "var(--ink-muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={{ stroke: "var(--line)" }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="total" fill="var(--panel-strong)" radius={[4, 4, 0, 0]} name="Assigned" />
          <Bar dataKey="completed" fill="var(--accent)" radius={[4, 4, 0, 0]} name="Completed" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
