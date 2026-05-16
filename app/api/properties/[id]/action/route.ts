import { NextResponse } from "next/server";
import { getProperties, updatePropertyStatus } from "@/lib/store";
import type { PropertyStatus } from "@/lib/types";

const allowedStatuses = new Set<PropertyStatus>([
  "needs_review",
  "sent_to_crm",
  "completed",
  "discarded",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as { action?: string };
  const now = new Date().toISOString();

  if (body.action === "send_to_crm") {
    const sent = await sendToCrm(id);
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error }, { status: 502 });
    }

    const record = await updatePropertyStatus(id, "sent_to_crm", { sentToCrmAt: now });
    return record
      ? NextResponse.json({ property: record })
      : NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  if (!body.action || !allowedStatuses.has(body.action as PropertyStatus)) {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const status = body.action as PropertyStatus;
  const stamp =
    status === "completed"
      ? { completedAt: now }
      : status === "discarded"
        ? { discardedAt: now }
        : {};
  const record = await updatePropertyStatus(id, status, stamp);

  return record
    ? NextResponse.json({ property: record })
    : NextResponse.json({ error: "Property not found" }, { status: 404 });
}

async function sendToCrm(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const webhookUrl = process.env.CRM_WEBHOOK_URL;
  if (!webhookUrl) return { ok: true };

  const property = (await getProperties()).find((record) => record.id === id);
  if (!property) return { ok: false, error: "Property not found" };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ property, sentAt: new Date().toISOString() }),
  });

  if (!response.ok) {
    return { ok: false, error: `CRM webhook failed with ${response.status}` };
  }

  return { ok: true };
}
