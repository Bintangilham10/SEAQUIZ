"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/shared/button";
import { Panel } from "@/components/shared/panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { loadLastHostSession, saveHostSession } from "@/lib/client-storage";
import type { ActionResult, RoomSnapshot } from "@/lib/types";
import { getRemainingSeconds } from "@/lib/utils";
import { useRoomRealtime } from "@/lib/use-room-realtime";

type CreateRoomResponse = {
  room: {
    room_code: string;
  };
  hostToken: string;
};

async function postJson<T>(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as ActionResult<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Action failed");
  }
  return payload.data;
}

export function HostConsole() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [remaining, setRemaining] = useState(0);
  const autoAdvanceKeyRef = useRef<string | null>(null);

  const { snapshot, loading, error: roomError, refresh } = useRoomRealtime({
    roomCode: roomCode ?? "",
    playerId: null
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      const session = loadLastHostSession();
      if (session) {
        setRoomCode(session.roomCode);
        setHostToken(session.hostToken);
      }
    }
  }, []);

  useEffect(() => {
    const room = snapshot?.room;
    const question = snapshot?.currentQuestion?.question;
    if (!room || !question || room.status !== "running") {
      setRemaining(0);
      return;
    }

    const update = () => {
      setRemaining(getRemainingSeconds(room.question_started_at, question.time_limit_seconds));
    };

    update();
    const timer = setInterval(update, 400);
    return () => clearInterval(timer);
  }, [
    snapshot?.currentQuestion?.question.id,
    snapshot?.currentQuestion?.question.time_limit_seconds,
    snapshot?.room.question_started_at,
    snapshot?.room.status
  ]);

  const createRoom = async () => {
    setError(null);
    setFlash("Creating room...");
    try {
      const data = await postJson<CreateRoomResponse>("/api/rooms/create", {});
      setRoomCode(data.room.room_code);
      setHostToken(data.hostToken);
      saveHostSession({
        roomCode: data.room.room_code,
        hostToken: data.hostToken
      });
      setFlash(`Room ${data.room.room_code} created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      setFlash(null);
    }
  };

  const startGame = async () => {
    if (!roomCode || !hostToken) return;
    setError(null);
    try {
      await postJson("/api/rooms/start", { roomCode, hostToken });
      setFlash("Game started.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start game");
    }
  };

  const nextQuestion = async () => {
    if (!roomCode || !hostToken) return;
    setError(null);
    try {
      const data = await postJson<{ status: "running" | "finished"; currentQuestionIndex?: number }>(
        "/api/rooms/next",
        { roomCode, hostToken }
      );
      if (data.status === "finished") {
        setFlash("Game finished. Global leaderboard updated.");
      } else {
        setFlash("Moved to next question.");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move question");
    }
  };

  useEffect(() => {
    const room = snapshot?.room;
    const question = snapshot?.currentQuestion?.question;
    if (!room || !question || room.status !== "running") return;

    if (remaining > 0) return;

    const autoKey = `${room.current_question_index}_${room.question_started_at}`;
    if (autoAdvanceKeyRef.current === autoKey) return;
    autoAdvanceKeyRef.current = autoKey;

    nextQuestion().catch(() => undefined);
  }, [remaining, snapshot?.currentQuestion?.question, snapshot?.room]);

  const joinedPlayers = snapshot?.players.length ?? 0;
  const joinUrl = useMemo(() => {
    if (!roomCode || !origin) return "";
    return `${origin}/r/${roomCode}`;
  }, [origin, roomCode]);

  return (
    <div className="space-y-4">
      <Panel className="space-y-3">
        <h1 className="text-2xl font-bold">Host Console</h1>
        <p className="text-sm text-slate-600">
          Create room, share QR to participants, and control game progression in realtime.
        </p>
        {!roomCode ? (
          <Button onClick={createRoom}>Create Room</Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={snapshot?.room.status ?? "lobby"} />
            <span className="text-sm text-slate-600">
              Room <strong>{roomCode}</strong>
            </span>
            {snapshot?.room.status === "lobby" && (
              <Button onClick={startGame} disabled={joinedPlayers === 0 || loading}>
                Start Game
              </Button>
            )}
            {snapshot?.room.status === "running" && (
              <Button variant="secondary" onClick={nextQuestion}>
                Next Question
              </Button>
            )}
          </div>
        )}
        {flash && <p className="text-sm text-emerald-700">{flash}</p>}
        {(error || roomError) && <p className="text-sm text-rose-600">{error || roomError}</p>}
      </Panel>

      {roomCode && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Panel className="space-y-3">
            <h2 className="text-lg font-semibold">Join QR</h2>
            {joinUrl ? (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(joinUrl)}`}
                alt="QR code room"
                className="h-56 w-56 rounded-lg border border-slate-200"
              />
            ) : (
              <div className="h-56 w-56 animate-pulse rounded-lg bg-slate-200" />
            )}
            <div className="rounded-md bg-slate-100 p-3 text-sm">
              <p className="text-slate-500">Room Code</p>
              <p className="mt-1 text-xl font-bold tracking-[0.2em]">{roomCode}</p>
            </div>
            <div className="rounded-md bg-slate-100 p-3 text-sm">
              <p className="text-slate-500">Players Joined</p>
              <p className="mt-1 text-xl font-bold">{joinedPlayers} / 50</p>
            </div>
          </Panel>

          <Panel className="space-y-4">
            {snapshot?.room.status === "running" && snapshot.currentQuestion ? (
              <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                    Question {snapshot.room.current_question_index + 1} / {snapshot.totalQuestions}
                  </p>
                  <p className="text-sm font-semibold text-brand-800">Timer: {remaining}s</p>
                </div>
                <p className="font-semibold text-slate-900">{snapshot.currentQuestion.question.text}</p>
                <ol className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  {snapshot.currentQuestion.options.map((option) => (
                    <li key={option.id} className="rounded border border-brand-200 bg-white px-3 py-2">
                      {option.text}
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                {snapshot?.room.status === "finished"
                  ? "Game finished. Final standings below."
                  : "Waiting for host to start the game."}
              </div>
            )}

            <div>
              <h3 className="mb-2 text-lg font-semibold">
                {snapshot?.room.status === "finished" ? "Final Room Ranking" : "Live Room Ranking"}
              </h3>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-left text-slate-600">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Player</th>
                      <th className="px-3 py-2 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(snapshot?.players ?? []).map((player, index) => (
                      <tr key={player.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold">{index + 1}</td>
                        <td className="px-3 py-2">{player.display_name}</td>
                        <td className="px-3 py-2 text-right font-semibold">{player.total_score}</td>
                      </tr>
                    ))}
                    {(snapshot?.players.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-5 text-center text-slate-500">
                          No players joined yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
