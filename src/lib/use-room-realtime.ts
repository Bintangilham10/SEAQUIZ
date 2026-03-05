"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ActionResult, RoomSnapshot } from "@/lib/types";

interface UseRoomRealtimeOptions {
  roomCode: string;
  playerId?: string | null;
}

export function useRoomRealtime({ roomCode, playerId }: UseRoomRealtimeOptions) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const roomIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!roomCode) return;
    const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
    const response = await fetch(`/api/rooms/${roomCode}/state${query}`, {
      cache: "no-store"
    });
    const payload = (await response.json()) as ActionResult<RoomSnapshot>;
    if (!response.ok || !payload.ok || !payload.data) {
      throw new Error(payload.message || "Failed to load room snapshot");
    }
    roomIdRef.current = payload.data.room.id;
    setSnapshot(payload.data);
    setError(null);
  }, [playerId, roomCode]);

  useEffect(() => {
    if (!roomCode) {
      setLoading(false);
      setSnapshot(null);
      setError(null);
      return;
    }

    let mounted = true;
    setLoading(true);
    refresh()
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load room.");
          setSnapshot(null);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!roomCode) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`room-watch-${roomCode}-${playerId ?? "anon"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `room_code=eq.${roomCode}` },
        () => {
          refresh().catch(() => undefined);
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players" }, (payload: any) => {
        const roomId = roomIdRef.current;
        const newRoomId = payload.new?.room_id as string | undefined;
        const oldRoomId = payload.old?.room_id as string | undefined;
        if (!roomId || newRoomId === roomId || oldRoomId === roomId) {
          refresh().catch(() => undefined);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_answers" }, (payload: any) => {
        const roomId = roomIdRef.current;
        const newRoomId = payload.new?.room_id as string | undefined;
        const oldRoomId = payload.old?.room_id as string | undefined;
        if (!roomId || newRoomId === roomId || oldRoomId === roomId) {
          refresh().catch(() => undefined);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => undefined);
    };
  }, [playerId, refresh, roomCode]);

  return {
    snapshot,
    loading,
    error,
    refresh
  };
}
