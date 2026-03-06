"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, LogOut, Play, QrCode, SkipForward, Users } from "lucide-react";
import { Button } from "@/components/shared/button";
import { Panel } from "@/components/shared/panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { clearHostSessions, loadLastHostSession, saveHostSession } from "@/lib/client-storage";
import type { ActionResult } from "@/lib/types";
import { getRemainingSeconds } from "@/lib/utils";
import { useRoomRealtime } from "@/lib/use-room-realtime";

type CreateRoomResponse = {
  room: {
    room_code: string;
  };
  hostToken: string;
};

const avatarColors = [
  "from-emerald-400 to-cyan-500",
  "from-blue-500 to-indigo-500",
  "from-fuchsia-500 to-purple-500",
  "from-orange-400 to-amber-500",
  "from-rose-400 to-red-500",
  "from-sky-400 to-blue-500"
];

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
  const router = useRouter();
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [remaining, setRemaining] = useState(0);
  const autoAdvanceKeyRef = useRef<string | null>(null);
  const staleSessionHandledRef = useRef(false);

  const { snapshot, loading, error: roomError, refresh } = useRoomRealtime({
    roomCode: roomCode ?? "",
    playerId: null
  });

  const joinedPlayers = snapshot?.playerCount ?? snapshot?.players.length ?? 0;
  const currentQuestion = snapshot?.currentQuestion?.question ?? null;
  const currentStatus = snapshot?.room.status ?? "lobby";

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
    const timer = setInterval(update, 300);
    return () => clearInterval(timer);
  }, [
    snapshot?.currentQuestion?.question.id,
    snapshot?.currentQuestion?.question.time_limit_seconds,
    snapshot?.room.question_started_at,
    snapshot?.room.status
  ]);

  useEffect(() => {
    if (!roomCode) {
      staleSessionHandledRef.current = false;
      return;
    }

    const combinedError = `${error ?? ""} ${roomError ?? ""}`.toLowerCase();
    const isNotFound = combinedError.includes("room not found");

    if (!isNotFound || snapshot || staleSessionHandledRef.current) return;

    staleSessionHandledRef.current = true;
    clearHostSessions();
    setRoomCode(null);
    setHostToken(null);
    setError(null);
    setFlash("Previous room not found in active Supabase project. Please create a new room.");
  }, [error, roomCode, roomError, snapshot]);

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
      staleSessionHandledRef.current = false;
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

    const liveRemaining = getRemainingSeconds(room.question_started_at, question.time_limit_seconds);
    const answeredAllPlayers = joinedPlayers > 0 && (snapshot?.currentQuestionAnswerCount ?? 0) >= joinedPlayers;
    if (liveRemaining > 0 && !answeredAllPlayers) return;

    const autoKey = `${room.current_question_index}_${room.question_started_at}`;
    if (autoAdvanceKeyRef.current === autoKey) return;
    autoAdvanceKeyRef.current = autoKey;

    nextQuestion().catch(() => undefined);
  }, [joinedPlayers, snapshot?.currentQuestion?.question, snapshot?.currentQuestionAnswerCount, snapshot?.room]);

  const joinUrl = useMemo(() => {
    if (!roomCode || !origin) return "";
    return `${origin}/r/${roomCode}`;
  }, [origin, roomCode]);

  const questionProgress = useMemo(() => {
    if (!snapshot?.totalQuestions) return 0;
    return Math.max(
      0,
      Math.min(100, Math.round(((snapshot.room.current_question_index + 1) / snapshot.totalQuestions) * 100))
    );
  }, [snapshot?.room.current_question_index, snapshot?.totalQuestions]);

  const answerProgress = useMemo(() => {
    if (!joinedPlayers) return 0;
    return Math.max(0, Math.min(100, Math.round(((snapshot?.currentQuestionAnswerCount ?? 0) / joinedPlayers) * 100)));
  }, [joinedPlayers, snapshot?.currentQuestionAnswerCount]);

  const logout = async () => {
    await fetch("/api/host/logout", { method: "POST" });
    clearHostSessions();
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-md space-y-3 sm:space-y-4 lg:max-w-6xl">
      <Panel className="space-y-4 bg-white/95">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-slate-900 sm:text-3xl">Host Console</h1>
            <p className="text-sm font-semibold text-slate-600">
              Manage room flow, timer progression, and live ranking.
            </p>
          </div>
          <Button variant="secondary" onClick={logout} className="gap-2">
            <LogOut size={16} />
            Logout
          </Button>
        </div>

        {!roomCode ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-700">No active room yet. Start by creating a new room.</p>
            <Button onClick={createRoom} className="mt-3 gap-2">
              <Play size={16} />
              Create Room
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={currentStatus} />
            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-extrabold tracking-[0.15em] text-slate-800">
              ROOM {roomCode}
            </span>
            {currentStatus === "lobby" && (
              <Button onClick={startGame} disabled={loading} className="gap-2">
                <Play size={16} />
                Start Game
              </Button>
            )}
            {currentStatus === "running" && (
              <Button variant="secondary" onClick={nextQuestion} className="gap-2">
                <SkipForward size={16} />
                Next Question
              </Button>
            )}
          </div>
        )}

        {flash && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{flash}</p>}
        {(error || roomError) && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error || roomError}</p>
        )}
      </Panel>

      {roomCode && (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <Panel className="space-y-4 bg-white/95">
            <h2 className="font-display text-lg font-extrabold text-slate-900 sm:text-xl">Join via QR</h2>
            <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-500 px-4 py-3 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-100">Room Code</p>
              <p className="mt-1 text-2xl font-extrabold tracking-[0.2em] sm:text-3xl">{roomCode}</p>
            </div>

            <div className="flex justify-center rounded-2xl border border-slate-200 bg-white p-4">
              {joinUrl ? (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(joinUrl)}`}
                  alt="QR code room"
                  className="h-52 w-52 rounded-xl sm:h-56 sm:w-56"
                />
              ) : (
                <div className="h-52 w-52 animate-pulse rounded-xl bg-slate-100 sm:h-56 sm:w-56" />
              )}
            </div>

            <div className="rounded-2xl bg-slate-100 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Players Joined</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">{joinedPlayers} / 50</p>
            </div>
            <p className="flex break-all text-xs font-semibold text-slate-500">
              <QrCode size={14} />
              <span className="ml-2">Link: {joinUrl || "-"}</span>
            </p>
          </Panel>

          <div className="space-y-4">
            <Panel className="space-y-4 bg-white/95">
              {currentStatus === "running" && currentQuestion ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-extrabold uppercase tracking-wide text-slate-700">
                      SOAL {snapshot?.room.current_question_index ? snapshot.room.current_question_index + 1 : 1}/
                      {snapshot?.totalQuestions ?? 0}
                    </p>
                    <p className="text-2xl font-extrabold text-slate-900 sm:text-4xl">{remaining}s</p>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-lime-400 to-lime-500 transition-all duration-300"
                      style={{ width: `${questionProgress}%` }}
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-base font-bold leading-snug text-slate-900 sm:text-xl">{currentQuestion.text}</p>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm font-extrabold text-slate-700">
                      <span>Answers Collected</span>
                      <span>
                        {snapshot?.currentQuestionAnswerCount ?? 0}/{joinedPlayers}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all duration-300"
                        style={{ width: `${answerProgress}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {snapshot?.currentQuestion?.options.map((option, index) => (
                      <div key={option.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                          Option {String.fromCharCode(65 + index)}
                        </p>
                        <p className="text-sm font-bold text-slate-800">{option.text}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-700">
                  {currentStatus === "finished"
                    ? "Game finished. Final ranking is available below."
                    : "Room is in lobby. Players can join and host can start anytime."}
                </div>
              )}
            </Panel>

            <Panel className="space-y-3 bg-white/95">
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
                <Users size={18} />
                Connected Members
              </h3>
              {(snapshot?.playerCount ?? snapshot?.players.length ?? 0) === 0 ? (
                <p className="text-sm font-semibold text-slate-500">No members in room yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-4">
                  {(snapshot?.players ?? []).slice(0, 16).map((player, index) => (
                    <div key={player.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
                      <div
                        className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-extrabold text-white ${avatarColors[index % avatarColors.length]}`}
                      >
                        {player.display_name.slice(0, 1).toUpperCase()}
                      </div>
                      <p className="mt-1 truncate text-[11px] font-bold text-slate-700 sm:text-xs">{player.display_name}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel className="space-y-3 bg-white/95">
              <h3 className="text-lg font-extrabold text-slate-900">
                {currentStatus === "finished" ? "Final Ranking" : "Live Ranking"}
              </h3>
              {(snapshot?.playerCount ?? snapshot?.players.length ?? 0) === 0 ? (
                <p className="text-sm font-semibold text-slate-500">No players joined yet.</p>
              ) : (
                <div className="space-y-2">
                  {(snapshot?.players ?? []).map((player, index) => (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between rounded-2xl border px-3 py-2 ${
                        index === 0
                          ? "border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                          {index === 0 ? (
                            <Crown size={16} className="text-amber-500" />
                          ) : (
                            <span className="text-sm font-extrabold text-slate-700">{index + 1}</span>
                          )}
                        </div>
                        <p className="text-sm font-extrabold text-slate-800 sm:text-base">{player.display_name}</p>
                      </div>
                      <p className="text-base font-extrabold text-slate-900 sm:text-lg">{player.total_score}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
