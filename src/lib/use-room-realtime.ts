"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ActionResult, RoomSnapshot } from "@/lib/types";

interface UseRoomRealtimeOptions {
  roomCode: string;
  playerId?: string | null;
  viewer?: "host" | "player";
}

export function useRoomRealtime({ roomCode, playerId, viewer = "player" }: UseRoomRealtimeOptions) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeHealthy, setRealtimeHealthy] = useState(true);
  const lastRefreshAtRef = useRef(0);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const queuedRefreshRef = useRef(false);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runRefresh = useCallback(async () => {
    if (!roomCode) return;
    const queryParams = new URLSearchParams();
    queryParams.set("viewer", viewer);
    if (playerId) {
      queryParams.set("playerId", playerId);
    }
    const query = `?${queryParams.toString()}`;
    const response = await fetch(`/api/rooms/${roomCode}/state${query}`, {
      cache: "no-store"
    });
    const payload = (await response.json()) as ActionResult<RoomSnapshot>;
    if (!response.ok || !payload.ok || !payload.data) {
      throw new Error(payload.message || "Failed to load room snapshot");
    }
    setSnapshot(payload.data);
    setError(null);
  }, [playerId, roomCode, viewer]);

  const refresh = useCallback(
    async (mode: "immediate" | "throttled" = "immediate") => {
      if (!roomCode) return;

      const minDelayMs = mode === "throttled" ? (viewer === "host" ? 500 : 1400) : 0;
      const elapsedMs = Date.now() - lastRefreshAtRef.current;

      if (mode === "throttled" && elapsedMs < minDelayMs) {
        if (throttleTimerRef.current) return;
        throttleTimerRef.current = setTimeout(() => {
          throttleTimerRef.current = null;
          refresh("throttled").catch(() => undefined);
        }, minDelayMs - elapsedMs);
        return;
      }

      if (refreshPromiseRef.current) {
        queuedRefreshRef.current = true;
        return refreshPromiseRef.current;
      }

      const task = runRefresh()
        .finally(() => {
          lastRefreshAtRef.current = Date.now();
          refreshPromiseRef.current = null;
          if (queuedRefreshRef.current) {
            queuedRefreshRef.current = false;
            refresh("throttled").catch(() => undefined);
          }
        });

      refreshPromiseRef.current = task;
      return task;
    },
    [roomCode, runRefresh, viewer]
  );

  useEffect(() => {
    if (!roomCode) {
      setLoading(false);
      setSnapshot(null);
      setError(null);
      setRealtimeHealthy(true);
      return;
    }

    let mounted = true;
    setLoading(true);
    refresh("immediate")
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
    if (!roomCode || !snapshot?.room.id) return;

    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize realtime client.");
      return;
    }

    const activeRoomId = snapshot.room.id;
    const channel = supabase.channel(`room-watch-${roomCode}-${viewer}-${playerId ?? "anon"}`);

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `room_code=eq.${roomCode}` },
      () => {
        refresh("throttled").catch(() => undefined);
      }
    );

    if (viewer === "host" || snapshot.room.status === "lobby") {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${activeRoomId}` },
        () => {
          refresh("throttled").catch(() => undefined);
        }
      );
    }

    if (viewer === "host") {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_answers", filter: `room_id=eq.${activeRoomId}` },
        () => {
          refresh("throttled").catch(() => undefined);
        }
      );
    } else if (playerId) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_answers", filter: `player_id=eq.${playerId}` },
        () => {
          refresh("throttled").catch(() => undefined);
        }
      );
    }

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        setError("Realtime disconnected. Syncing with fallback polling...");
        setRealtimeHealthy(false);
      } else if (status === "SUBSCRIBED") {
        setError(null);
        setRealtimeHealthy(true);
      }
    });

    return () => {
      supabase.removeChannel(channel).catch(() => undefined);
    };
  }, [playerId, refresh, roomCode, snapshot?.room.id, snapshot?.room.status, viewer]);

  useEffect(() => {
    if (!roomCode) return;

    const fallbackMs = !realtimeHealthy ? (viewer === "host" ? 3500 : 5000) : snapshot?.room.status === "running"
      ? viewer === "host"
        ? 8000
        : 15000
      : 20000;

    const interval = setInterval(() => {
      refresh("immediate").catch(() => undefined);
    }, fallbackMs);

    return () => clearInterval(interval);
  }, [realtimeHealthy, refresh, roomCode, snapshot?.room.status, viewer]);

  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
    };
  }, []);

  return {
    snapshot,
    loading,
    error,
    refresh,
    realtimeHealthy
  };
}
