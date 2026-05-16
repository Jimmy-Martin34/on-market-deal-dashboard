import { extractIncomingRecords, normalizeIncomingProperty } from "./normalize";
import { importProperties } from "./store";

export async function triggerActivePiecesImport() {
  const webhookUrl = process.env.ACTIVEPIECES_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("ACTIVEPIECES_WEBHOOK_URL is not configured");
  }
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      trigger: "subdivide-deal-dashboard",
      requestedAt: new Date().toISOString(),
      lookback: "previous_day",
    }),
  });

  const responseText = await response.text();
  const payload = parseWebhookResponse(responseText);

  if (!response.ok) {
    throw new Error(`ActivePieces webhook failed with ${response.status}`);
  }

  const normalized = extractIncomingRecords(payload)
    .map(normalizeIncomingProperty)
    .filter((record) => record !== null);

  if (normalized.length === 0) {
    return {
      added: 0,
      skippedDuplicates: 0,
      records: [],
      webhookReturnedRecords: false,
    };
  }

  const result = await importProperties(normalized);
  return {
    ...result,
    webhookReturnedRecords: true,
  };
}

export async function triggerManualImport() {
  return triggerActivePiecesImport();
}

function parseWebhookResponse(responseText: string) {
  if (!responseText.trim()) return null;

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return null;
  }
}
