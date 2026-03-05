import { cn } from "@/lib/utils";
import type { RoomStatus } from "@/lib/types";

const statusClass: Record<RoomStatus, string> = {
  lobby: "bg-amber-100 text-amber-800",
  running: "bg-emerald-100 text-emerald-800",
  finished: "bg-slate-200 text-slate-800"
};

export function StatusBadge({ status }: { status: RoomStatus }) {
  return (
    <span className={cn("rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide", statusClass[status])}>
      {status}
    </span>
  );
}
