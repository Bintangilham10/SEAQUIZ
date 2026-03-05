"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/button";
import { Panel } from "@/components/shared/panel";
import type { ActionResult } from "@/lib/types";

export function HostLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/host/login", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });
      const payload = (await response.json()) as ActionResult<{ authenticated: boolean }>;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Failed to login.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <Panel className="space-y-5">
        <h1 className="font-display text-3xl font-extrabold text-slate-900">Host Login</h1>
        <p className="text-sm text-slate-600">Login required before creating and controlling quiz rooms.</p>
        <form onSubmit={login} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Username</label>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="Enter username"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Enter password"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Login as Host"}
          </Button>
          {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
        </form>
      </Panel>
    </div>
  );
}
