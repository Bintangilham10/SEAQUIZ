import { NextResponse } from "next/server";
import type { ActionResult } from "@/lib/types";

const NO_STORE_HEADERS = {
  "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  pragma: "no-cache",
  expires: "0"
};

export function ok<T>(message: string, data: T) {
  return NextResponse.json<ActionResult<T>>({
    ok: true,
    message,
    data
  }, {
    headers: NO_STORE_HEADERS
  });
}

export function fail(message: string, status = 400) {
  return NextResponse.json<ActionResult<null>>(
    {
      ok: false,
      message,
      data: null
    },
    {
      status,
      headers: NO_STORE_HEADERS
    }
  );
}
