import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-2xl font-bold">Page Not Found</h1>
      <p className="mt-2 text-sm text-slate-600">The room code or path is invalid.</p>
      <Link href="/" className="mt-4 inline-block text-sm font-semibold">
        Back to Home
      </Link>
    </div>
  );
}
