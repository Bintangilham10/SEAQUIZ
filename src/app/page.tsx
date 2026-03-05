import Link from "next/link";
import { JoinRoomForm } from "@/components/shared/join-room-form";
import { Panel } from "@/components/shared/panel";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <Panel className="bg-gradient-to-br from-brand-600 to-brand-800 text-white">
        <p className="text-sm uppercase tracking-[0.2em] text-brand-100">Realtime Quiz Showcase</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">QR Quiz Battle</h1>
        <p className="mt-3 max-w-2xl text-sm text-brand-100 sm:text-base">
          Host creates a room, participants scan QR, everyone answers live, and rankings update in realtime.
        </p>
      </Panel>

      <Panel className="space-y-4">
        <h2 className="text-xl font-semibold">Join a Room</h2>
        <p className="text-sm text-slate-600">Scan QR from host screen or enter room code manually.</p>
        <JoinRoomForm />
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel className="space-y-3">
          <h3 className="font-semibold">Become a Host</h3>
          <p className="text-sm text-slate-600">Create a room, manage question flow, and watch live rankings.</p>
          <Link
            href="/host"
            className="inline-flex rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Open Host Console
          </Link>
        </Panel>
        <Panel className="space-y-3">
          <h3 className="font-semibold">Global Leaderboard</h3>
          <p className="text-sm text-slate-600">Top 10 players based on all-time accumulated scores.</p>
          <Link
            href="/leaderboard"
            className="inline-flex rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
          >
            View Leaderboard
          </Link>
        </Panel>
      </div>
    </div>
  );
}
