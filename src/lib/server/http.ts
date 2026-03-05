import { NextResponse } from "next/server";
import type { ActionResult } from "@/lib/types";

export function ok<T>(message: string, data: T) {
  return NextResponse.json<ActionResult<T>>({
    ok: true,
    message,
    data
  });
}

export function fail(message: string, status = 400) {
  return NextResponse.json<ActionResult<null>>(
    {
      ok: false,
      message,
      data: null
    },
    { status }
  );
}
