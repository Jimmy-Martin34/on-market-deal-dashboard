import { NextResponse } from "next/server";
import { extractIncomingRecords, normalizeIncomingProperty } from "@/lib/normalize";
import { importProperties } from "@/lib/store";

export async function POST(request: Request) {
  const payload = await request.json();
  const records = extractIncomingRecords(payload)
    .map(normalizeIncomingProperty)
    .filter((record) => record !== null);

  const result = await importProperties(records);
  return NextResponse.json(result);
}
