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
  const body = (await request.json()) as {
    action?: string;
    dealName?: string;
    agentName?: string;
    agentPhone?: string;
    acres?: string;
    landPortalLink?: string;
    parcelId?: string;
    dealNotes?: string;
  };
  const now = new Date().toISOString();

  if (body.action === "send_to_crm") {
    const crmDetails = {
      dealName: body.dealName?.trim() || "",
      agentName: body.agentName?.trim() || "",
      agentPhone: body.agentPhone?.trim() || "",
      acres: body.acres?.trim() || "",
      landPortalLink: body.landPortalLink?.trim() || "",
      parcelId: body.parcelId?.trim() || "",
      dealNotes: body.dealNotes?.trim() || "",
    };
    const sent = await sendToCrm(id, crmDetails);
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error }, { status: 502 });
    }

    const parsedAcres = parseAcreage(crmDetails.acres);
    const record = await updatePropertyStatus(id, "sent_to_crm", {
      agentName: crmDetails.agentName,
      agentPhone: crmDetails.agentPhone,
      ...(parsedAcres === undefined ? {} : { acres: parsedAcres }),
      landPortalLink: crmDetails.landPortalLink,
      parcelId: crmDetails.parcelId,
      notes: crmDetails.dealNotes,
      sentToCrmAt: now,
    });
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

async function sendToCrm(
  id: string,
  details: {
    dealName: string;
    agentName: string;
    agentPhone: string;
    acres: string;
    landPortalLink: string;
    parcelId: string;
    dealNotes: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const webhookUrl = process.env.CRM_WEBHOOK_URL;
  if (!webhookUrl) return { ok: false, error: "CRM_WEBHOOK_URL is not configured" };

  const property = (await getProperties()).find((record) => record.id === id);
  if (!property) return { ok: false, error: "Property not found" };
  const hydratedProperty = {
    ...property,
    agentName: details.agentName || property.agentName,
    agentPhone: details.agentPhone || property.agentPhone,
    acres: parseAcreage(details.acres) ?? property.acres,
    landPortalLink: details.landPortalLink || property.landPortalLink,
    parcelId: details.parcelId || property.parcelId,
    notes: details.dealNotes || property.notes,
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildCrmPayload(hydratedProperty, details.dealName)),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    return {
      ok: false,
      error: `CRM webhook failed with ${response.status}${
        responseText ? `: ${responseText.slice(0, 300)}` : ""
      }`,
    };
  }

  return { ok: true };
}

function buildCrmPayload(property: PropertyRecord, dealName = "") {
  const agentName = property.agentName || "";
  const { firstName, lastName } = splitName(agentName);
  const { county, state } = getCountyState(property);
  const countyState = [county, state].filter(Boolean).join(", ");

  return {
    fields: [
      {
        id: 683,
        value: dealName || buildDealTitle(property),
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
        value: property.notes || "",
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
        value: "On Market Email list",
      },
      {
        id: 694,
        value: property.landPortalLink || "",
      },
      {
        id: 749,
        value: property.parcelId || "",
      },
      {
        id: 750,
        value: property.address || "",
      },
      {
        id: 751,
        value: countyState,
      },
      {
        id: 752,
        value: property.acres ? formatNumber(property.acres) : "",
      },
    ],
  };
}

function buildDealTitle(property: PropertyRecord) {
  const acreage = property.acres ? `${formatNumber(property.acres)} Acre` : "Unknown Acreage";
  const { county, state } = getCountyState(property);
  const countyState = [county, state].filter(Boolean).join(", ");
  return `OM ${acreage} / ${countyState || "Unknown location"}`;
}

function getCountyState(property: PropertyRecord) {
  const parsedCountyState = parseCountyState(property.countyState);
  return {
    county: parsedCountyState.county || property.county || "",
    state: parsedCountyState.state || property.state || "",
  };
}

function parseCountyState(value?: string) {
  const [county = "", state = ""] = (value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return { county, state };
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

function parseAcreage(value: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}
