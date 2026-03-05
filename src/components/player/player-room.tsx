"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
    playerId
  });

  const currentQuestion = snapshot?.currentQuestion?.question ?? null;
  const hasAnsweredCurrent = Boolean(snapshot?.playerAnswerForCurrent);

  useEffect(() => {
    if (!snapshot?.room || !currentQuestion || snapshot.room.status !== "running") {
      setRemaining(0);
      return;
    }

    const update = () => {
      setRemaining(getRemainingSeconds(snapshot.room.question_started_at, currentQuestion.time_limit_seconds));
    };

    update();
    const interval = setInterval(update, 400);
    return () => clearInterval(interval);
  }, [
    currentQuestion?.id,
    currentQuestion?.time_limit_seconds,
    snapshot?.room.question_started_at,
    snapshot?.room.status
  ]);

  useEffect(() => {
    setSelectedOptionId(snapshot?.playerAnswerForCurrent?.option_id ?? null);
    if (snapshot?.playerAnswerForCurrent) {
      setAnswerFeedback(
        snapshot.playerAnswerForCurrent.is_correct
          ? `Correct! +${snapshot.playerAnswerForCurrent.score_awarded} points`
          : "Wrong answer. +0 points"
      );
    } else {
      setAnswerFeedback(null);
    }
  }, [snapshot?.playerAnswerForCurrent, currentQuestion?.id]);

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

  const submitAnswer = async (optionOverride?: string) => {
    const optionToSubmit = optionOverride ?? selectedOptionId;
    if (!playerId || !currentQuestion || !optionToSubmit || hasAnsweredCurrent || remaining <= 0) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const result = await postJson<{ answer: { is_correct: boolean; score_awarded: number } }>(
        "/api/answers/submit",
        {
          roomCode: normalizedRoomCode,
          playerId,
          questionId: currentQuestion.id,
          optionId: optionToSubmit
        }
      );

      setAnswerFeedback(
        result.answer.is_correct ? `Correct! +${result.answer.score_awarded} points` : "Wrong answer. +0 points"
      );
      await refresh();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to submit answer");
    } finally {
      setSubmitting(false);
    }
  };

  const myStanding = useMemo(() => {
    if (!snapshot || !playerId) return null;
    const index = snapshot.players.findIndex((item) => item.id === playerId);
    if (index === -1) return null;
    const me = snapshot.players[index];
    return {
      rank: index + 1,
      score: me.total_score
    };
  }, [playerId, snapshot]);

  if (loading && !snapshot) {
    return (
      <Panel>
        <p className="text-sm text-slate-600">Loading room {normalizedRoomCode}...</p>
      </Panel>
    );
  }

  if (error && !snapshot) {
    return (
      <Panel className="space-y-3">
        <h1 className="text-2xl font-bold">Room Not Available</h1>
        <p className="text-sm text-rose-600">{error}</p>
        <Link href="/" className="text-sm font-semibold">
          Back to home
        </Link>
      </Panel>
    );
  }

  if (!playerId) {
    return (
      <Panel className="space-y-4">
        <h1 className="text-2xl font-bold">Join Room {normalizedRoomCode}</h1>
        <p className="text-sm text-slate-600">Enter your display name to join as guest.</p>
        <form onSubmit={joinRoom} className="space-y-3">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={24}
            placeholder="Your nickname"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <Button type="submit" disabled={joining}>
            {joining ? "Joining..." : "Join Room"}
          </Button>
        </form>
        {(localError || error) && <p className="text-sm text-rose-600">{localError || error}</p>}
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Room {normalizedRoomCode}</h1>
          {snapshot?.room && <StatusBadge status={snapshot.room.status} />}
        </div>
        <p className="text-sm text-slate-600">
          Player: <strong>{displayName}</strong>
        </p>
        {myStanding && (
          <p className="text-sm text-slate-700">
            Current Rank: <strong>#{myStanding.rank}</strong> | Score: <strong>{myStanding.score}</strong>
          </p>
        )}
      </Panel>

      {snapshot?.room.status === "lobby" && (
        <Panel className="space-y-2">
          <h2 className="text-xl font-semibold">Waiting Room</h2>
          <p className="text-sm text-slate-600">Host has not started yet. Stay on this page.</p>
          <p className="text-sm text-slate-600">Players joined: {snapshot.players.length}</p>
        </Panel>
      )}

      {snapshot?.room.status === "running" && currentQuestion && (
        <Panel className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Question {snapshot.room.current_question_index + 1} / {snapshot.totalQuestions}
            </p>
            <p className="text-sm font-semibold text-brand-800">Time Left: {remaining}s</p>
          </div>
          <h2 className="text-xl font-semibold">{currentQuestion.text}</h2>
          <div className="grid gap-2">
            {snapshot.currentQuestion?.options.map((option) => {
              const selected = option.id === selectedOptionId;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    selected
                      ? "border-brand-500 bg-brand-50 text-brand-800"
                      : "border-slate-300 bg-white text-slate-800 hover:border-brand-300"
                  }`}
                  onClick={() => {
                    if (hasAnsweredCurrent || remaining <= 0 || submitting) return;
                    setSelectedOptionId(option.id);
                    submitAnswer(option.id).catch(() => undefined);
                  }}
                  disabled={hasAnsweredCurrent || remaining <= 0 || submitting}
                >
                  {option.text}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => {
                submitAnswer().catch(() => undefined);
              }}
              disabled={submitting || hasAnsweredCurrent || !selectedOptionId || remaining <= 0}
            >
              {hasAnsweredCurrent ? "Answer Locked" : submitting ? "Submitting..." : "Submit Answer"}
            </Button>
            {answerFeedback && <p className="text-sm font-semibold text-slate-700">{answerFeedback}</p>}
          </div>
        </Panel>
      )}

      {snapshot?.room.status === "finished" && (
        <Panel className="space-y-3">
          <h2 className="text-xl font-semibold">Game Finished</h2>
          {myStanding && (
            <p className="text-sm text-slate-700">
              Final Rank: <strong>#{myStanding.rank}</strong> with <strong>{myStanding.score}</strong> points.
            </p>
          )}
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
                {snapshot.players.map((player, index) => (
                  <tr key={player.id} className={player.id === playerId ? "bg-brand-50" : "border-t border-slate-100"}>
                    <td className="px-3 py-2 font-semibold">{index + 1}</td>
                    <td className="px-3 py-2">{player.display_name}</td>
                    <td className="px-3 py-2 text-right font-semibold">{player.total_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <Link href="/" className="inline-flex rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
              Play Again
            </Link>
            <Link
              href="/leaderboard"
              className="inline-flex rounded-md bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-900"
            >
              Global Leaderboard
            </Link>
          </div>
        </Panel>
      )}

      {(localError || error) && <p className="text-sm text-rose-600">{localError || error}</p>}
    </div>
  );
}
