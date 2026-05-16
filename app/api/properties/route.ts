import { NextResponse } from "next/server";
import { getProperties } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ properties: await getProperties() });
}
