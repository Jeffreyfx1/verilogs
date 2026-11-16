export function ProductSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-card">
          <div className="sk w-24" />
          <div className="sk mt-2 w-4/5" />
          <div className="sk mt-2 w-full" />
          <div className="mt-3 flex items-center justify-between">
            <div className="sk w-20" />
            <div className="sk sk-btn" />
          </div>
        </div>
      ))}
    </div>
  );
}
