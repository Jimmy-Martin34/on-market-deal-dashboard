import { extractIncomingRecords, normalizeIncomingProperty } from "./normalize";
import { importProperties } from "./store";
import type { PropertyRecord } from "./types";

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
  const extracted = extractIncomingRecords(payload);

  if (!response.ok) {
    throw new Error(`ActivePieces webhook failed with ${response.status}`);
  }

  const normalized = (await Promise.all(extracted.map(normalizeIncomingProperty))).filter(
    (record): record is PropertyRecord => record !== null,
  );

  const diagnostics = {
    webhookStatus: response.status,
    responseTextLength: responseText.length,
    parsedPayload: payload !== null,
    extractedRecords: extracted.length,
    normalizedRecords: normalized.length,
    payloadKeys: getPayloadKeys(payload),
    extractedKeys: extracted.slice(0, 3).map((record) => Object.keys(record)),
  };

  if (normalized.length === 0) {
    return {
      added: 0,
      skippedDuplicates: 0,
      records: [],
      webhookReturnedRecords: false,
      diagnostics,
    };
  }

  const result = await importProperties(normalized);
  return {
    ...result,
    webhookReturnedRecords: true,
    diagnostics,
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

function getPayloadKeys(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return Object.keys(payload);
}
