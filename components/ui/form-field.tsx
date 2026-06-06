import { type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

// ---------------------------------------------------------------------------
// Shared class builders
// ---------------------------------------------------------------------------

const labelBase = "block font-bold uppercase tracking-[0.13em] text-[var(--ink-muted)]";
const inputBase =
  "w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] outline-none transition " +
  "focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/14 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const sizeMap = {
  sm: { label: "text-[10px] mb-0.5", input: "h-8 px-2.5 text-[12px]" },
  md: { label: "text-[11px] mb-1",   input: "h-9 px-3   text-[13px]" },
  lg: { label: "text-[12px] mb-1",   input: "h-10 px-3  text-[14px]" },
} as const;

type Size = keyof typeof sizeMap;

// ---------------------------------------------------------------------------
// FormField — text / number / email / tel / date inputs
// ---------------------------------------------------------------------------

export interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  name: string;
  size?: Size;
  hint?: string;
  error?: string;
}

export function FormField({
  label,
  size = "sm",
  hint,
  error,
  className,
  ...props
}: FormFieldProps) {
  const s = sizeMap[size];
  return (
    <div>
      <label
        htmlFor={props.id ?? props.name}
        className={`${labelBase} ${s.label}`}
      >
        {label}
      </label>
      <input
        id={props.id ?? props.name}
        className={`${inputBase} ${s.input}${error ? " border-red-400/60" : ""}${className ? ` ${className}` : ""}`}
        {...props}
      />
      {hint && !error && (
        <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">{hint}</p>
      )}
      {error && (
        <p className="mt-0.5 text-[11px] text-red-500">{error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormTextarea
// ---------------------------------------------------------------------------

export interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  name: string;
  size?: Size;
  hint?: string;
  error?: string;
}

export function FormTextarea({
  label,
  size = "sm",
  hint,
  error,
  className,
  rows = 3,
  ...props
}: FormTextareaProps) {
  const s = sizeMap[size];
  return (
    <div>
      <label
        htmlFor={props.id ?? props.name}
        className={`${labelBase} ${s.label}`}
      >
        {label}
      </label>
      <textarea
        id={props.id ?? props.name}
        rows={rows}
        className={`${inputBase} py-2 ${s.input.replace(/h-\S+\s?/, "")}${error ? " border-red-400/60" : ""}${className ? ` ${className}` : ""}`}
        {...props}
      />
      {hint && !error && (
        <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">{hint}</p>
      )}
      {error && (
        <p className="mt-0.5 text-[11px] text-red-500">{error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormSelect
// ---------------------------------------------------------------------------

export interface FormSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label: string;
  name: string;
  size?: Size;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export function FormSelect({
  label,
  size = "sm",
  hint,
  error,
  className,
  children,
  ...props
}: FormSelectProps) {
  const s = sizeMap[size];
  return (
    <div>
      <label
        htmlFor={props.id ?? props.name}
        className={`${labelBase} ${s.label}`}
      >
        {label}
      </label>
      <select
        id={props.id ?? props.name}
        className={`${inputBase} ${s.input}${error ? " border-red-400/60" : ""}${className ? ` ${className}` : ""}`}
        {...props}
      >
        {children}
      </select>
      {hint && !error && (
        <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">{hint}</p>
      )}
      {error && (
        <p className="mt-0.5 text-[11px] text-red-500">{error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormRow — two-column grid wrapper
// ---------------------------------------------------------------------------

export function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
