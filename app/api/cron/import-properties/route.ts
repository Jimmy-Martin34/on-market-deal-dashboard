import { NextResponse } from "next/server";
import { triggerActivePiecesImport } from "@/lib/importer";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await triggerActivePiecesImport();
  return NextResponse.json({ ok: true, ...result });
}
