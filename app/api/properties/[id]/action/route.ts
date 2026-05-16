import { NextResponse } from "next/server";
import { getProperties, updatePropertyStatus } from "@/lib/store";
import type { PropertyRecord, PropertyStatus } from "@/lib/types";

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
    body: JSON.stringify(buildCrmPayload(property)),
  });

  if (!response.ok) {
    return { ok: false, error: `CRM webhook failed with ${response.status}` };
  }

  return { ok: true };
}

function buildCrmPayload(property: PropertyRecord) {
  const agentName = property.agentName || "";
  const { firstName, lastName } = splitName(agentName);

  return {
    fields: [
      {
        id: 683,
        value: buildDealTitle(property),
      },
      {
        id: 686,
        value: agentName,
      },
      {
        id: 692,
        value: property.agentPhone || "",
      },
      {
        id: 685,
        value: buildDealNotes(property),
      },
      {
        id: 688,
        value: firstName,
      },
      {
        id: 687,
        value: lastName,
      },
      {
        id: 690,
        value: property.listingUrl || "",
      },
      {
        id: 691,
        value: property.price?.toString() || "",
      },
      {
        id: 693,
        value: "On Market-email list.",
      },
      {
        id: 694,
        value: property.parcelId || property.id,
      },
    ],
  };
}

function buildDealTitle(property: PropertyRecord) {
  const acreage = property.acres ? `${formatNumber(property.acres)} acre` : "Unknown acreage";
  const countyState = [property.county, property.state].filter(Boolean).join(", ");
  return `OM ${acreage} / ${countyState || "Unknown location"}`;
}

function buildDealNotes(property: PropertyRecord) {
  const details = [
    `Address: ${property.address}`,
    `Location: ${[property.city, property.state, property.zip].filter(Boolean).join(", ")}`,
    property.county ? `County: ${property.county}` : "",
    property.acres ? `Acreage: ${formatNumber(property.acres)}` : "",
    property.price ? `List price: ${property.price}` : "",
    property.zoning ? `Zoning: ${property.zoning}` : "",
    property.parcelId ? `Parcel/Land ID: ${property.parcelId}` : "",
    property.listingUrl ? `On market link: ${property.listingUrl}` : "",
    property.notes ? `Notes: ${property.notes}` : "",
  ];

  return details.filter(Boolean).join("\n");
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}
