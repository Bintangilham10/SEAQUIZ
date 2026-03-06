export type RoomStatus = "lobby" | "running" | "finished";

export interface QuizSet {
  id: string;
  title: string;
}

export interface Question {
  id: string;
  quiz_set_id: string;
  text: string;
  time_limit_seconds: number;
  order_index: number;
}

export interface Option {
  id: string;
  question_id: string;
  text: string;
  is_correct: boolean;
}

export interface Room {
  id: string;
  room_code: string;
  host_token: string;
  quiz_set_id: string;
  status: RoomStatus;
  current_question_index: number;
  question_started_at: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface RoomPlayer {
  id: string;
  room_id: string;
  display_name: string;
  guest_id: string;
  joined_at: string;
  total_score: number;
}

export interface RoomAnswer {
  id: string;
  room_id: string;
  player_id: string;
  question_id: string;
  option_id: string;
  is_correct: boolean;
  score_awarded: number;
  submitted_at: string;
}

export interface LeaderboardGlobal {
  guest_id: string;
  display_name: string;
  total_score_all_time: number;
  matches_played: number;
  updated_at: string;
}

export interface CurrentQuestionPayload {
  question: Pick<Question, "id" | "text" | "time_limit_seconds" | "order_index">;
  options: Array<Pick<Option, "id" | "question_id" | "text">>;
}

export interface StandingSummary {
  rank: number;
  score: number;
  total_players: number;
}

export interface RoomSnapshot {
  room: Pick<
    Room,
    "id" | "room_code" | "quiz_set_id" | "status" | "current_question_index" | "question_started_at"
  >;
  quizTitle: string;
  totalQuestions: number;
  playerCount: number;
  players: Array<Pick<RoomPlayer, "id" | "display_name" | "guest_id" | "joined_at" | "total_score">>;
  currentQuestion: CurrentQuestionPayload | null;
  currentQuestionAnswerCount: number;
  playerAnswerForCurrent: Pick<RoomAnswer, "id" | "option_id" | "is_correct" | "score_awarded"> | null;
  selfStanding: StandingSummary | null;
}

export interface ActionResult<T = null> {
  ok: boolean;
  message: string;
  data: T;
}
