"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/button";

export function JoinRoomForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const roomCode = code.trim().toUpperCase();
    if (!roomCode) return;
    router.push(`/r/${roomCode}`);
  };

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
      <input
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="Enter room code"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm uppercase tracking-widest outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        maxLength={6}
      />
      <Button type="submit">Join Via Code</Button>
    </form>
  );
}
