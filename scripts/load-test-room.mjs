import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDotEnv(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

async function loadLocalEnv() {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const contents = await readFile(envPath, "utf8");
    return parseDotEnv(contents);
  } catch {
    return {};
  }
}

function getArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const match = process.argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function getCookieHeader(response) {
  const value = response.headers.get("set-cookie");
  if (!value) return "";
  return value.split(",").map((part) => part.split(";")[0].trim()).join("; ");
}

async function requestJson(baseUrl, pathname, options = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${pathname}`, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return {
    response,
    payload,
    durationMs: Date.now() - startedAt
  };
}

function summarizeDurations(label, values) {
  if (!values.length) {
    return `${label}: no data`;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const pick = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return `${label}: avg=${Math.round(total / sorted.length)}ms p50=${pick(0.5)}ms p95=${pick(0.95)}ms max=${sorted.at(-1)}ms`;
}

async function runStatePollers({
  baseUrl,
  roomCode,
  playerIds,
  includeHostPoller = true,
  pollerCount,
  durationMs,
  intervalMs
}) {
  const deadline = Date.now() + durationMs;
  const metrics = {
    ok: 0,
    failed: 0,
    durations: [],
    failures: []
  };

  await Promise.all(
    Array.from({ length: pollerCount }, async (_, index) => {
      while (Date.now() < deadline) {
        const useHostView = includeHostPoller && index === 0;
        const playerId = useHostView ? null : playerIds.length ? playerIds[index % playerIds.length] : null;
        const query = playerId
          ? `?viewer=player&playerId=${encodeURIComponent(playerId)}`
          : "?viewer=host";
        try {
          const result = await requestJson(baseUrl, `/api/rooms/${roomCode}/state${query}`, {
            headers: {
              "cache-control": "no-store"
            }
          });

          metrics.durations.push(result.durationMs);
          if (result.response.ok && result.payload?.ok) {
            metrics.ok += 1;
          } else {
            metrics.failed += 1;
            if (metrics.failures.length < 5) {
              metrics.failures.push(`${result.response.status}: ${result.payload?.message ?? "unknown error"}`);
            }
          }
        } catch (error) {
          metrics.failed += 1;
          if (metrics.failures.length < 5) {
            metrics.failures.push(error instanceof Error ? error.message : "state poll failed");
          }
        }

        await sleep(intervalMs);
      }
    })
  );

  return metrics;
}

async function ensureQuizSeed(env) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin env is required to seed a temporary quiz set for load testing.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { count } = await supabase.from("quiz_sets").select("*", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;

  const { data: quizSet, error: quizError } = await supabase
    .from("quiz_sets")
    .insert({ title: "Load Test Quiz" })
    .select("id")
    .maybeSingle();

  if (quizError || !quizSet) {
    throw new Error(`Failed to create temporary quiz set: ${quizError?.message ?? "unknown error"}`);
  }

  const { data: question, error: questionError } = await supabase
    .from("questions")
    .insert({
      quiz_set_id: quizSet.id,
      text: "Load test question",
      time_limit_seconds: 15,
      order_index: 0
    })
    .select("id")
    .maybeSingle();

  if (questionError || !question) {
    throw new Error(`Failed to create temporary question: ${questionError?.message ?? "unknown error"}`);
  }

  const { error: optionError } = await supabase.from("options").insert([
    {
      question_id: question.id,
      text: "Option A",
      is_correct: true
    },
    {
      question_id: question.id,
      text: "Option B",
      is_correct: false
    }
  ]);

  if (optionError) {
    throw new Error(`Failed to create temporary options: ${optionError.message}`);
  }

  console.log("Temporary quiz : created");
}

async function main() {
  const localEnv = await loadLocalEnv();
  const baseUrl = getArg("base-url", "http://127.0.0.1:3000");
  const userCount = Number.parseInt(getArg("users", "55"), 10);
  const mode = getArg("mode", "baseline");
  const pollerCount = Number.parseInt(getArg("pollers", "30"), 10);
  const pollSeconds = Number.parseInt(getArg("poll-seconds", "12"), 10);
  const pollIntervalMs = Number.parseInt(getArg("poll-interval-ms", "1200"), 10);
  const submitJitterMs = Number.parseInt(getArg("submit-jitter-ms", "1800"), 10);
  const username = getArg("username", process.env.HOST_LOGIN_USERNAME ?? localEnv.HOST_LOGIN_USERNAME ?? "");
  const password = getArg("password", process.env.HOST_LOGIN_PASSWORD ?? localEnv.HOST_LOGIN_PASSWORD ?? "");

  if (!username || !password) {
    throw new Error("Host credentials are required. Set HOST_LOGIN_USERNAME and HOST_LOGIN_PASSWORD.");
  }

  console.log(`Base URL       : ${baseUrl}`);
  console.log(`Mode           : ${mode}`);
  console.log(`Concurrent join: ${userCount}`);

  const login = await requestJson(baseUrl, "/api/host/login", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });

  if (!login.response.ok || !login.payload?.ok) {
    throw new Error(`Host login failed: ${login.payload?.message ?? login.response.statusText}`);
  }

  const cookie = getCookieHeader(login.response);
  console.log("Host login     : OK");

  const createRoom = await requestJson(baseUrl, "/api/rooms/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie
    },
    body: JSON.stringify({})
  });

  if ((!createRoom.response.ok || !createRoom.payload?.ok) && String(createRoom.payload?.message ?? "").includes("Quiz set not found")) {
    await ensureQuizSeed(localEnv);
    const retryCreateRoom = await requestJson(baseUrl, "/api/rooms/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie
      },
      body: JSON.stringify({})
    });

    if (!retryCreateRoom.response.ok || !retryCreateRoom.payload?.ok) {
      throw new Error(`Create room failed: ${retryCreateRoom.payload?.message ?? retryCreateRoom.response.statusText}`);
    }

    createRoom.response = retryCreateRoom.response;
    createRoom.payload = retryCreateRoom.payload;
  }

  if (!createRoom.response.ok || !createRoom.payload?.ok) {
    throw new Error(`Create room failed: ${createRoom.payload?.message ?? createRoom.response.statusText}`);
  }

  const roomCode = createRoom.payload.data.room.room_code;
  const hostToken = createRoom.payload.data.hostToken;
  console.log(`Room created   : ${roomCode}`);

  const joinStartedAt = Date.now();
  const joinResults = await Promise.all(
    Array.from({ length: userCount }, async (_, index) => {
      const guestId = randomUUID();
      const displayName = `user_${String(index + 1).padStart(2, "0")}`;

      const join = await requestJson(baseUrl, "/api/rooms/join", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          roomCode,
          displayName,
          guestId
        })
      });

      return {
        index,
        guestId,
        displayName,
        status: join.response.status,
        ok: Boolean(join.payload?.ok),
        payload: join.payload,
        durationMs: join.durationMs
      };
    })
  );
  const joinDurationMs = Date.now() - joinStartedAt;

  const joinSummary = joinResults.reduce(
    (acc, result) => {
      if (result.ok) acc.joined += 1;
      else if (result.status === 409 && String(result.payload?.message ?? "").toLowerCase().includes("full")) acc.full += 1;
      else acc.failed += 1;
      return acc;
    },
    { joined: 0, full: 0, failed: 0 }
  );

  console.log(`Join results   : joined=${joinSummary.joined} full=${joinSummary.full} failed=${joinSummary.failed}`);
  console.log(`Join duration  : ${joinDurationMs} ms`);
  console.log(summarizeDurations("Join latency   ", joinResults.map((result) => result.durationMs)));

  const stateAfterJoin = await requestJson(baseUrl, `/api/rooms/${roomCode}/state?viewer=host`, {
    headers: {
      "cache-control": "no-store"
    }
  });

  const playerCount = Math.max(
    stateAfterJoin.payload?.data?.playerCount ?? 0,
    stateAfterJoin.payload?.data?.players?.length ?? 0
  );
  const visiblePlayers = stateAfterJoin.payload?.data?.players?.length ?? 0;
  console.log(`Player count   : ${playerCount}`);
  console.log(`Visible list   : ${visiblePlayers}`);

  const start = await requestJson(baseUrl, "/api/rooms/start", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie
    },
    body: JSON.stringify({
      roomCode,
      hostToken
    })
  });

  if (!start.response.ok || !start.payload?.ok) {
    throw new Error(`Start game failed: ${start.payload?.message ?? start.response.statusText}`);
  }
  console.log("Game started   : OK");

  const stateAfterStart = await requestJson(baseUrl, `/api/rooms/${roomCode}/state?viewer=host`, {
    headers: {
      "cache-control": "no-store"
    }
  });

  const currentQuestion = stateAfterStart.payload?.data?.currentQuestion?.question ?? null;
  const firstOption = stateAfterStart.payload?.data?.currentQuestion?.options?.[0] ?? null;

  if (!currentQuestion || !firstOption) {
    throw new Error("Current question payload missing after start.");
  }

  const joinedPlayers = joinResults
    .filter((entry) => entry.ok)
    .map((entry) => entry.payload.data.player);

  let statePollingPromise = null;
  if (mode === "stress") {
    console.log(`State pollers  : ${pollerCount} for ${pollSeconds}s @ ${pollIntervalMs}ms`);
    statePollingPromise = runStatePollers({
      baseUrl,
      roomCode,
      playerIds: joinedPlayers.map((player) => player.id),
      includeHostPoller: true,
      pollerCount,
      durationMs: pollSeconds * 1000,
      intervalMs: pollIntervalMs
    });
  }

  const answerStartedAt = Date.now();
  const answerResults = await Promise.all(
    joinedPlayers.map(async (player) => {
      if (mode === "stress" && submitJitterMs > 0) {
        await sleep(Math.floor(Math.random() * submitJitterMs));
      }

      const submit = await requestJson(baseUrl, "/api/answers/submit", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          roomCode,
          playerId: player.id,
          questionId: currentQuestion.id,
          optionId: firstOption.id
        })
      });

      return {
        status: submit.response.status,
        ok: Boolean(submit.payload?.ok),
        message: submit.payload?.message ?? "",
        durationMs: submit.durationMs
      };
    })
  );
  const answerDurationMs = Date.now() - answerStartedAt;

  const answerSummary = answerResults.reduce(
    (acc, result) => {
      if (result.ok) acc.success += 1;
      else acc.failed += 1;
      return acc;
    },
    { success: 0, failed: 0 }
  );

  console.log(`Answer results : success=${answerSummary.success} failed=${answerSummary.failed}`);
  console.log(`Answer duration: ${answerDurationMs} ms`);
  console.log(summarizeDurations("Answer latency ", answerResults.map((result) => result.durationMs)));

  const finalState = await requestJson(baseUrl, `/api/rooms/${roomCode}/state?viewer=host`, {
    headers: {
      "cache-control": "no-store"
    }
  });

  console.log(`Answer count   : ${finalState.payload?.data?.currentQuestionAnswerCount ?? 0}`);

  const failedJoins = joinResults
    .filter((entry) => !entry.ok)
    .slice(0, 5)
    .map((entry) => ({ status: entry.status, message: entry.payload?.message ?? "unknown" }));

  if (failedJoins.length) {
    console.log("Sample join failures:");
    for (const item of failedJoins) {
      console.log(`- ${item.status}: ${item.message}`);
    }
  }

  if (statePollingPromise) {
    const stateMetrics = await statePollingPromise;
    console.log(`State results  : ok=${stateMetrics.ok} failed=${stateMetrics.failed}`);
    console.log(summarizeDurations("State latency  ", stateMetrics.durations));
    if (stateMetrics.failures.length) {
      console.log("Sample state failures:");
      for (const item of stateMetrics.failures) {
        console.log(`- ${item}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
