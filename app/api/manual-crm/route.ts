import { NextResponse } from "next/server";

type ManualCrmBody = {
  dealName?: string;
  countyState?: string;
  agentName?: string;
  agentPhone?: string;
  acres?: string;
  purchasePrice?: string;
  onMarketLink?: string;
  dealNotes?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ManualCrmBody;
  const details = {
    dealName: body.dealName?.trim() || "",
    countyState: body.countyState?.trim() || "",
    agentName: body.agentName?.trim() || "",
    agentPhone: body.agentPhone?.trim() || "",
    acres: body.acres?.trim() || "",
    purchasePrice: body.purchasePrice?.trim() || "",
    onMarketLink: body.onMarketLink?.trim() || "",
    dealNotes: body.dealNotes?.trim() || "",
  };

  if (!details.dealName || !details.agentName) {
    return NextResponse.json(
      { error: "Deal name and agent name are required." },
      { status: 400 },
    );
  }

  const webhookUrl = process.env.CRM_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "CRM_WEBHOOK_URL is not configured" },
      { status: 500 },
    );
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildManualCrmPayload(details)),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    return NextResponse.json(
      {
        error: `CRM webhook failed with ${response.status}${
          responseText ? `: ${responseText.slice(0, 300)}` : ""
        }`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

function buildManualCrmPayload(details: Required<ManualCrmBody>) {
  const { firstName, lastName } = splitName(details.agentName);

  return {
    fields: [
      {
        id: 683,
        value: details.dealName,
      },
      {
        id: 686,
        value: details.agentName,
      },
      {
        id: 692,
        value: details.agentPhone,
      },
      {
        id: 685,
        value: buildDealNotes(details.countyState, details.acres, details.dealNotes),
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
        value: details.onMarketLink,
      },
      {
        id: 691,
        value: details.purchasePrice,
      },
      {
        id: 693,
        value: "Manual",
      },
    ],
  };
}

function buildDealNotes(countyState: string, acres: string, dealNotes: string) {
  return [
    `County, St: ${countyState || "Unknown"}`,
    `Acreage: ${acres || "Unknown"}`,
    dealNotes,
  ]
    .filter(Boolean)
    .join("\n\n");
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
