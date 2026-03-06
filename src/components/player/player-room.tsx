"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Crown, Medal, Users } from "lucide-react";
import { Button } from "@/components/shared/button";
import { Panel } from "@/components/shared/panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { getOrCreateGuestId, loadPlayerSession, savePlayerSession } from "@/lib/client-storage";
import { getRemainingSeconds } from "@/lib/utils";
import { useRoomRealtime } from "@/lib/use-room-realtime";
import type { ActionResult } from "@/lib/types";

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
    throw new Error(payload.message || "Request failed");
  }
  return payload.data;
}

interface JoinResponse {
  player: {
    id: string;
    display_name: string;
    guest_id: string;
  };
}

const optionLabels = ["A", "B", "C", "D", "E", "F"];
const avatarColors = [
  "from-emerald-400 to-cyan-500",
  "from-blue-500 to-indigo-500",
  "from-fuchsia-500 to-purple-500",
  "from-orange-400 to-amber-500",
  "from-rose-400 to-red-500",
  "from-sky-400 to-blue-500"
];

export function PlayerRoom({ roomCode }: { roomCode: string }) {
  const normalizedRoomCode = roomCode.toUpperCase();
  const [guestId, setGuestId] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [joining, setJoining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<string | null>(null);
  const [optimisticAnswer, setOptimisticAnswer] = useState<{
    questionId: string;
    optionId: string;
    isCorrect: boolean;
    scoreAwarded: number;
  } | null>(null);

  useEffect(() => {
    const id = getOrCreateGuestId();
    setGuestId(id);
    const session = loadPlayerSession(normalizedRoomCode);
    if (session?.guestId === id) {
      setPlayerId(session.playerId);
      setDisplayName(session.displayName);
    }
  }, [normalizedRoomCode]);

  const { snapshot, loading, error, refresh } = useRoomRealtime({
    roomCode: normalizedRoomCode,
    playerId,
    viewer: "player"
  });

  const currentQuestion = snapshot?.currentQuestion?.question ?? null;
  const effectiveAnswer = useMemo(() => {
    if (snapshot?.playerAnswerForCurrent) {
      return snapshot.playerAnswerForCurrent;
    }

    if (!optimisticAnswer || optimisticAnswer.questionId !== currentQuestion?.id) {
      return null;
    }

    return {
      id: "optimistic",
      option_id: optimisticAnswer.optionId,
      is_correct: optimisticAnswer.isCorrect,
      score_awarded: optimisticAnswer.scoreAwarded
    };
  }, [currentQuestion?.id, optimisticAnswer, snapshot?.playerAnswerForCurrent]);
  const hasAnsweredCurrent = Boolean(effectiveAnswer);

  useEffect(() => {
    if (!snapshot?.room || !currentQuestion || snapshot.room.status !== "running") {
      setRemaining(0);
      return;
    }

    const update = () => {
      setRemaining(getRemainingSeconds(snapshot.room.question_started_at, currentQuestion.time_limit_seconds));
    };

    update();
    const interval = setInterval(update, 300);
    return () => clearInterval(interval);
  }, [
    currentQuestion?.id,
    currentQuestion?.time_limit_seconds,
    snapshot?.room.question_started_at,
    snapshot?.room.status
  ]);

  useEffect(() => {
    if (!currentQuestion) {
      setOptimisticAnswer(null);
      setSelectedOptionId(null);
      setAnswerFeedback(null);
      return;
    }

    if (snapshot?.playerAnswerForCurrent) {
      setOptimisticAnswer(null);
    } else if (optimisticAnswer && optimisticAnswer.questionId !== currentQuestion.id) {
      setOptimisticAnswer(null);
    }

    setSelectedOptionId(effectiveAnswer?.option_id ?? null);
    if (effectiveAnswer) {
      setAnswerFeedback(
        effectiveAnswer.is_correct ? `Correct! +${effectiveAnswer.score_awarded}` : "Wrong answer. +0"
      );
    } else {
      setAnswerFeedback(null);
    }
  }, [currentQuestion, effectiveAnswer, optimisticAnswer, snapshot?.playerAnswerForCurrent]);

  const joinRoom = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!displayName.trim() || !guestId) return;
    setJoining(true);
    setLocalError(null);
    try {
      const data = await postJson<JoinResponse>("/api/rooms/join", {
        roomCode: normalizedRoomCode,
        displayName: displayName.trim(),
        guestId
      });
      setPlayerId(data.player.id);
      setDisplayName(data.player.display_name);
      savePlayerSession({
        roomCode: normalizedRoomCode,
        playerId: data.player.id,
        guestId: data.player.guest_id,
        displayName: data.player.display_name
      });
      await refresh();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to join room");
    } finally {
      setJoining(false);
    }
  };

  const submitAnswer = async () => {
    if (!playerId || !currentQuestion || !selectedOptionId || hasAnsweredCurrent || remaining <= 0) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const result = await postJson<{ answer: { is_correct: boolean; score_awarded: number } }>(
        "/api/answers/submit",
        {
          roomCode: normalizedRoomCode,
          playerId,
          questionId: currentQuestion.id,
          optionId: selectedOptionId
        }
      );

      setOptimisticAnswer({
        questionId: currentQuestion.id,
        optionId: selectedOptionId,
        isCorrect: result.answer.is_correct,
        scoreAwarded: result.answer.score_awarded
      });
      setAnswerFeedback(
        result.answer.is_correct ? `Correct! +${result.answer.score_awarded}` : "Wrong answer. +0"
      );
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to submit answer");
    } finally {
      setSubmitting(false);
    }
  };

  const myStanding = useMemo(() => {
    if (!snapshot || !playerId) return null;
    if (snapshot.selfStanding) {
      return {
        rank: snapshot.selfStanding.rank,
        score: snapshot.selfStanding.score,
        totalPlayers: snapshot.selfStanding.total_players
      };
    }

    const index = snapshot.players.findIndex((item) => item.id === playerId);
    if (index === -1) return null;
    const me = snapshot.players[index];
    return {
      rank: index + 1,
      score: me.total_score,
      totalPlayers: snapshot.playerCount ?? snapshot.players.length
    };
  }, [playerId, snapshot]);

  const finalLeaders = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.players.slice(0, 10);
  }, [snapshot]);

  const meOutsideTopList = useMemo(() => {
    if (!snapshot || !playerId || !myStanding) return null;
    if (finalLeaders.some((player) => player.id === playerId)) return null;
    const fallbackPlayer = snapshot.players.find((player) => player.id === playerId);
    return {
      id: playerId,
      display_name: displayName,
      total_score: myStanding.score ?? fallbackPlayer?.total_score ?? 0
    };
  }, [displayName, finalLeaders, myStanding, playerId, snapshot]);

  const timerProgress = useMemo(() => {
    if (!currentQuestion) return 0;
    return Math.max(0, Math.min(100, Math.round((remaining / currentQuestion.time_limit_seconds) * 100)));
  }, [currentQuestion, remaining]);

  const questionProgress = useMemo(() => {
    if (!snapshot?.totalQuestions) return 0;
    return Math.max(
      0,
      Math.min(100, Math.round(((snapshot.room.current_question_index + 1) / snapshot.totalQuestions) * 100))
    );
  }, [snapshot?.room.current_question_index, snapshot?.totalQuestions]);

  if (loading && !snapshot) {
    return (
      <div className="mx-auto max-w-md">
        <Panel>
          <p className="text-sm text-slate-600">Loading room {normalizedRoomCode}...</p>
        </Panel>
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="mx-auto max-w-md">
        <Panel className="space-y-3">
          <h1 className="text-2xl font-bold">Room Not Available</h1>
          <p className="text-sm text-rose-600">{error}</p>
          <p className="text-xs font-semibold text-slate-500">
            Make sure host already created the room in the same deployed app.
          </p>
          <Link href="/" className="text-sm font-semibold">
            Back to home
          </Link>
        </Panel>
      </div>
    );
  }

  if (!playerId) {
    return (
      <div className="mx-auto max-w-md">
        <Panel className="space-y-5 bg-white/92">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">Join Room</p>
            <h1 className="font-display mt-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">{normalizedRoomCode}</h1>
          </div>
          <form onSubmit={joinRoom} className="space-y-3">
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={24}
              placeholder="Your nickname"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:text-base"
            />
            <Button type="submit" disabled={joining} className="w-full py-3 text-base sm:text-lg">
              {joining ? "Joining..." : "Join Room"}
            </Button>
          </form>
          {(localError || error) && <p className="text-sm text-rose-600">{localError || error}</p>}
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-3 sm:space-y-4">
      <Panel className="space-y-2 bg-white/94">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-xl font-extrabold text-slate-900 sm:text-2xl">Seachan Quiz</h1>
          {snapshot?.room && <StatusBadge status={snapshot.room.status} />}
        </div>
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-500 px-4 py-3 text-center text-white">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-100">Room</p>
          <p className="text-2xl font-extrabold tracking-[0.2em] sm:text-3xl">{normalizedRoomCode}</p>
        </div>
        <p className="text-sm font-semibold text-slate-700">
          You are <span className="font-extrabold">{displayName}</span>
        </p>
      </Panel>

      {snapshot?.room.status === "lobby" && (
        <Panel className="space-y-4 bg-white/95">
          <div className="text-center">
            <p className="font-display text-2xl font-extrabold uppercase tracking-wide text-slate-900 sm:text-3xl">
              Waiting for Host...
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              {(snapshot.playerCount ?? snapshot.players.length)} member
              {(snapshot.playerCount ?? snapshot.players.length) === 1 ? "" : "s"} in room
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {snapshot.players.slice(0, 12).map((player, index) => (
              <div key={player.id} className="space-y-1 text-center">
                <div
                  className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br text-lg font-extrabold text-white sm:h-14 sm:w-14 ${avatarColors[index % avatarColors.length]}`}
                >
                  {player.display_name.slice(0, 1).toUpperCase()}
                </div>
                <p className="truncate text-xs font-bold text-slate-700">{player.display_name}</p>
              </div>
            ))}
          </div>

          <Button className="w-full py-3 text-base sm:text-lg" disabled>
            I&apos;M READY!
          </Button>
        </Panel>
      )}

      {snapshot?.room.status === "running" && currentQuestion && (
        <Panel className="space-y-4 bg-white/95">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-extrabold uppercase tracking-wide text-slate-700">
                SOAL {snapshot.room.current_question_index + 1}/{snapshot.totalQuestions}
              </p>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-lime-400 to-lime-500 transition-all duration-300"
                  style={{ width: `${questionProgress}%` }}
                />
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Score</p>
              <p className="text-2xl font-extrabold text-slate-900 sm:text-3xl">{myStanding?.score ?? 0}</p>
            </div>
          </div>

          <div className="relative mx-auto h-40 w-40 sm:h-56 sm:w-56">
            <div
              className="absolute inset-0 rounded-full shadow-[0_0_35px_rgba(132,204,22,0.35)]"
              style={{
                background: `conic-gradient(#a3e635 ${timerProgress}%, #e2e8f0 ${timerProgress}% 100%)`
              }}
            />
            <div className="absolute inset-[12px] rounded-full bg-white" />
            <div className="absolute inset-0 flex items-center justify-center text-center">
              <div>
                <p className="text-5xl font-extrabold leading-none text-slate-900 sm:text-7xl">{remaining}</p>
                <p className="text-sm font-extrabold uppercase tracking-wide text-slate-500">seconds</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">{currentQuestion.text}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {snapshot.currentQuestion?.options.map((option, index) => {
              const selected = option.id === selectedOptionId;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`rounded-2xl border bg-white px-3 py-4 text-left transition ${
                    selected
                      ? "border-indigo-500 bg-indigo-50 shadow-[0_8px_25px_-20px_rgba(79,70,229,0.9)]"
                      : "border-slate-200 hover:border-indigo-300"
                  }`}
                  onClick={() => {
                    if (hasAnsweredCurrent || remaining <= 0 || submitting) return;
                    setSelectedOptionId(option.id);
                  }}
                  disabled={hasAnsweredCurrent || remaining <= 0 || submitting}
                >
                  <p className="text-2xl font-extrabold text-slate-900 sm:text-3xl">{optionLabels[index] ?? "?"}</p>
                  <p className="mt-1 text-sm font-bold uppercase text-slate-700">{option.text}</p>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <Button
              onClick={() => {
                submitAnswer().catch(() => undefined);
              }}
              disabled={submitting || hasAnsweredCurrent || !selectedOptionId || remaining <= 0}
              className="w-full py-3 text-base sm:text-lg"
            >
              {hasAnsweredCurrent ? "Jawaban Terkunci!" : submitting ? "Submitting..." : "Submit Answer"}
            </Button>
            {answerFeedback && (
              <p className="rounded-xl bg-slate-900 px-3 py-2 text-center text-sm font-bold text-white">
                {answerFeedback}
              </p>
            )}
          </div>
        </Panel>
      )}

      {snapshot?.room.status === "finished" && (
        <Panel className="space-y-4 bg-white/95">
          <div className="text-center">
            <p className="font-display text-2xl font-extrabold text-slate-900 sm:text-3xl">Hasil Quiz</p>
            {myStanding && (
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Final Rank <strong>#{myStanding.rank}</strong> with <strong>{myStanding.score}</strong> points.
              </p>
            )}
          </div>

          <div className="space-y-2">
            {finalLeaders.map((player, index) => {
              const isMe = player.id === playerId;
              return (
                <div
                  key={player.id}
                  className={`flex items-center justify-between rounded-2xl border px-3 py-2 ${
                    isMe
                      ? "border-indigo-300 bg-gradient-to-r from-indigo-500 to-violet-500 text-white"
                      : "border-slate-200 bg-white text-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isMe ? "bg-white/20" : "bg-slate-100"}`}>
                      {index === 0 ? (
                        <Crown size={16} className={isMe ? "text-white" : "text-amber-500"} />
                      ) : index === 1 ? (
                        <Medal size={16} className={isMe ? "text-white" : "text-slate-400"} />
                      ) : (
                        <span className="text-sm font-extrabold">{index + 1}</span>
                      )}
                    </div>
                    <p className="font-extrabold">{isMe ? `You (${player.display_name})` : player.display_name}</p>
                  </div>
                  <p className="text-lg font-extrabold">{player.total_score}</p>
                </div>
              );
            })}
            {meOutsideTopList && myStanding && (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
                      <span className="text-sm font-extrabold">#{myStanding.rank}</span>
                    </div>
                    <p className="font-extrabold">You ({meOutsideTopList.display_name})</p>
                  </div>
                  <p className="text-lg font-extrabold">{meOutsideTopList.total_score}</p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-500 px-4 py-3 text-sm font-extrabold text-white"
            >
              Play Again
            </Link>
            <Link
              href="/leaderboard"
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-extrabold text-white"
            >
              Global Board
            </Link>
          </div>
        </Panel>
      )}

      {(localError || error) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {localError || error}
        </div>
      )}

      {myStanding && snapshot?.room.status !== "finished" && (
        <div className="sticky bottom-2 z-20 flex items-center justify-between rounded-2xl border border-white/80 bg-white/95 px-4 py-2 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <Users size={16} />
              <span>
              Rank #{myStanding.rank} of {myStanding.totalPlayers}
            </span>
          </div>
          <p className="text-sm font-extrabold text-slate-900">{myStanding.score} pts</p>
        </div>
      )}
    </div>
  );
}
