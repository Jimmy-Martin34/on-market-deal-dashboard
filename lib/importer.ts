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

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

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
