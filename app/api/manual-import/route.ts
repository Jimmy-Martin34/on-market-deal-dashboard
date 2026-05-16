import { NextResponse } from "next/server";
import { triggerManualImport } from "@/lib/importer";

export async function POST() {
  const result = await triggerManualImport();
  return NextResponse.json({ ok: true, ...result });
}
