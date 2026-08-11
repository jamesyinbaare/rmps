export function TableSkeleton({
  rows = 8,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="rounded-md border" aria-busy="true" aria-label="Loading">
      <div className="border-b bg-muted/40 px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="h-3 flex-1 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex gap-4 px-4 py-3">
            {Array.from({ length: cols }).map((_, col) => (
              <div
                key={col}
                className="h-3 flex-1 animate-pulse rounded bg-muted"
                style={{ opacity: 1 - row * 0.06 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
