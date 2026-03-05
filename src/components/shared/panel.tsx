import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  className?: string;
}

export function Panel({ className, children }: PropsWithChildren<PanelProps>) {
  return <section className={cn("rounded-xl border border-slate-200 bg-white p-5", className)}>{children}</section>;
}
