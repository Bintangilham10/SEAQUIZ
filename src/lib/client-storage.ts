"use client";

import { generateGuestId } from "@/lib/utils";

const GUEST_KEY = "qrquiz_guest_id";
const LAST_HOST_KEY = "qrquiz_host_last";

export function getOrCreateGuestId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(GUEST_KEY);
  if (existing) return existing;
  const newGuestId = generateGuestId();
  window.localStorage.setItem(GUEST_KEY, newGuestId);
  return newGuestId;
}

export interface HostSession {
  roomCode: string;
  hostToken: string;
}

function hostSessionKey(roomCode: string) {
  return `qrquiz_host_${roomCode.toUpperCase()}`;
}

export function saveHostSession(session: HostSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(hostSessionKey(session.roomCode), JSON.stringify(session));
  window.localStorage.setItem(LAST_HOST_KEY, JSON.stringify(session));
}

export function loadHostToken(roomCode: string) {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(hostSessionKey(roomCode));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HostSession;
    return parsed.hostToken ?? null;
  } catch {
    return null;
  }
}

export function loadLastHostSession(): HostSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LAST_HOST_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HostSession;
  } catch {
    return null;
  }
}

export interface PlayerSession {
  roomCode: string;
  playerId: string;
  guestId: string;
  displayName: string;
}

function playerSessionKey(roomCode: string) {
  return `qrquiz_player_${roomCode.toUpperCase()}`;
}

export function savePlayerSession(session: PlayerSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(playerSessionKey(session.roomCode), JSON.stringify(session));
}

export function loadPlayerSession(roomCode: string): PlayerSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(playerSessionKey(roomCode));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlayerSession;
  } catch {
    return null;
  }
}
