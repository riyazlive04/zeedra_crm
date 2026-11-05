export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-white">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
        Opening flow…
      </div>
    </div>
  );
}
