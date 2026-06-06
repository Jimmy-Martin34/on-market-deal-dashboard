import { NextResponse } from "next/server";
import { extractIncomingRecords, normalizeIncomingProperty } from "@/lib/normalize";
import { importProperties } from "@/lib/store";
import type { PropertyRecord } from "@/lib/types";

export async function POST(request: Request) {
  const payload = await request.json();
  const records = (
    await Promise.all(extractIncomingRecords(payload).map(normalizeIncomingProperty))
  ).filter((record): record is PropertyRecord => record !== null);

  const result = await importProperties(records);
  return NextResponse.json(result);
}
