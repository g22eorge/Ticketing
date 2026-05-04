"use client";

import { useMemo, useRef } from "react";

type MonthOption = {
  value: string;
  label: string;
};

export function MonthSelectForm({
  name = "month",
  value,
  options,
  hiddenFields,
  className,
  selectClassName,
}: {
  name?: string;
  value: string;
  options: MonthOption[];
  hiddenFields?: Record<string, string>;
  className?: string;
  selectClassName?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  const currentIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );
  const oldest = options[options.length - 1];
  const newest = options[0];

  function submitMonth(nextValue: string) {
    if (!selectRef.current) return;
    selectRef.current.value = nextValue;
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} className={className}>
      {hiddenFields
        ? Object.entries(hiddenFields).map(([fieldName, fieldValue]) => (
            <input key={fieldName} type="hidden" name={fieldName} value={fieldValue} />
          ))
        : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (currentIndex < 0 || currentIndex >= options.length - 1) return;
            submitMonth(options[currentIndex + 1].value);
          }}
          disabled={currentIndex < 0 || currentIndex >= options.length - 1}
          className="btn-premium-secondary rounded-lg px-2 py-1 text-xs disabled:opacity-40"
          aria-label="Previous month"
          title="Previous month"
        >
          ←
        </button>
        <select
          ref={selectRef}
          name={name}
          defaultValue={value}
          onChange={() => formRef.current?.requestSubmit()}
          className={selectClassName}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (currentIndex <= 0) return;
            submitMonth(options[currentIndex - 1].value);
          }}
          disabled={currentIndex <= 0}
          className="btn-premium-secondary rounded-lg px-2 py-1 text-xs disabled:opacity-40"
          aria-label="Next month"
          title="Next month"
        >
          →
        </button>
      </div>
      {oldest && newest ? (
        <p className="mt-1 hidden text-[11px] text-[var(--ink-muted)] sm:block">
          Reporting window: {oldest.label} to {newest.label}
        </p>
      ) : null}
      <noscript>
        <button className="btn-premium-secondary ml-2 rounded-lg px-3 py-1 text-sm">Go</button>
      </noscript>
    </form>
  );
}
