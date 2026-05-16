import { NextResponse } from "next/server";
import { triggerManualImport } from "@/lib/importer";

export async function POST() {
  try {
    const result = await triggerManualImport();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Manual import failed",
      },
      { status: 500 },
    );
  }
}
