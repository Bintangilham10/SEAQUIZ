import { notFound } from "next/navigation";
import { PlayerRoom } from "@/components/player/player-room";

export default function RoomPage({
  params
}: {
  params: {
    roomCode: string;
  };
}) {
  const roomCode = params.roomCode.toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
    notFound();
  }

  return <PlayerRoom roomCode={roomCode} />;
}
