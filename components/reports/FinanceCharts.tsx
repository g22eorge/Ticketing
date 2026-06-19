"use client";

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

const ACCENT = "#4F8EF7";
const PIE_COLORS = ["#4F8EF7", "#60a5fa", "#34d399", "#f472b6", "#a78bfa", "#fb923c", "#38bdf8", "#4ade80"];

export function PLTrendChart({
  data,
  currency,
}: {
  data: { key: string; revenue: number; expenses: number; net: number }[];
  currency: string;
}) {
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="key" tick={{ fontSize: 10, fill: "var(--ink-muted)" }} />
        <YAxis tick={{ fontSize: 10, fill: "var(--ink-muted)" }} tickFormatter={(v) => formatMoneyCompact(v, currency)} width={64} />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => formatMoneyCompact(v, currency)}
          contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
        />
        <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#34d399" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#f87171" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="net" name="Net" stroke={ACCENT} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ExpenseMonthlyChart({
  data,
  currency,
}: {
  data: { key: string; amount: number }[];
  currency: string;
}) {
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="key" tick={{ fontSize: 10, fill: "var(--ink-muted)" }} />
        <YAxis tick={{ fontSize: 10, fill: "var(--ink-muted)" }} tickFormatter={(v) => formatMoneyCompact(v, currency)} width={64} />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => formatMoneyCompact(v, currency)}
          contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="amount" fill={ACCENT} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ExpenseCategoryPie({
  data,
  currency,
}: {
  data: { name: string; amount: number }[];
  currency: string;
}) {
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name }) => name}>
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => formatMoneyCompact(v, currency)}
          contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
