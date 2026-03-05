import { createHash, randomBytes, randomUUID } from "crypto";
import { ROOM_CODE_LENGTH } from "@/lib/constants";

export function cn(...inputs: Array<string | undefined | null | false>) {
  return inputs.filter(Boolean).join(" ");
}

const ROOM_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateRoomCode(length = ROOM_CODE_LENGTH) {
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  }
  return result;
}

export function generateHostToken() {
  return randomBytes(18).toString("hex");
}

export function hashHostToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateGuestId() {
  return randomUUID();
}

export function getRemainingSeconds(startedAt: string | null, timeLimit: number) {
  if (!startedAt) return timeLimit;
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(timeLimit - elapsed));
}
