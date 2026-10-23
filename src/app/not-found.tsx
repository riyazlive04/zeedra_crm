import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <img src="/icon.svg" alt="" className="h-12 w-12 rounded-xl" />
      <h1 className="font-display text-2xl font-bold">Page not found</h1>
      <p className="text-sm text-slate-500">The page you are looking for does not exist or you don&apos;t have access.</p>
      <Link href="/" className="sun-gradient mt-2 rounded-lg px-4 py-2 text-sm font-semibold text-white">
        Go to dashboard
      </Link>
    </div>
  );
}
