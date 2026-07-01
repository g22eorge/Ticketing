import React from "react";

interface TableProps {
  children: React.ReactNode;
}

function Table({ children }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-[var(--panel-strong)]">
      <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
        {children}
      </tr>
    </thead>
  );
}

function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-[var(--line)]">{children}</tbody>;
}

function TableCell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

function TableHeaderCell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>;
}

export { Table, TableHead, TableBody, TableCell, TableHeaderCell };