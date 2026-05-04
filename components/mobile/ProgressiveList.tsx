"use client";

import { Children, useMemo, useState } from "react";

export function ProgressiveList({
  children,
  initialCount = 3,
  step = 4,
}: {
  children: React.ReactNode;
  initialCount?: number;
  step?: number;
}) {
  const items = useMemo(() => Children.toArray(children), [children]);
  const [visibleCount, setVisibleCount] = useState(initialCount);

  const visible = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;
  const canCollapse = visibleCount > initialCount;

  return (
    <>
      {visible}
      {hasMore ? (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => Math.min(count + step, items.length))}
          className="btn-premium-secondary mt-2 w-full rounded-lg px-3 py-1.5 text-sm"
        >
          Show more
        </button>
      ) : null}
      {!hasMore && canCollapse ? (
        <button
          type="button"
          onClick={() => setVisibleCount(initialCount)}
          className="btn-premium-secondary mt-2 w-full rounded-lg px-3 py-1.5 text-sm"
        >
          Show less
        </button>
      ) : null}
    </>
  );
}
