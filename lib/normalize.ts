import crypto from "node:crypto";
import type { PropertyRecord } from "./types";

type IncomingProperty = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pick(record: IncomingProperty, names: string[]): string {
  for (const name of names) {
    const value = text(record[name]);
    if (value) return value;
  }
  return "";
}

function fingerprintFor(record: {
  address: string;
  city: string;
  state: string;
  zip: string;
  parcelId?: string;
  listingUrl?: string;
}) {
  const strongestKey = record.parcelId || record.listingUrl;
  const basis =
    strongestKey ||
    [record.address, record.city, record.state, record.zip]
      .join("|")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  return crypto.createHash("sha256").update(basis.toLowerCase()).digest("hex");
}

export function extractIncomingRecords(payload: unknown): IncomingProperty[] {
  if (Array.isArray(payload)) return payload.filter(isObject);
  if (!isObject(payload)) return [];

  const candidates = [
    payload.properties,
    payload.records,
    payload.data,
    payload.items,
    payload.listings,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isObject);
  }

  return [payload];
}

export function normalizeIncomingProperty(raw: IncomingProperty): PropertyRecord | null {
  const address = pick(raw, ["address", "streetAddress", "propertyAddress", "Address"]);
  const city = pick(raw, ["city", "City"]);
  const state = pick(raw, ["state", "State"]);
  const zip = pick(raw, ["zip", "zipcode", "postalCode", "Zip"]);
  const parcelId = pick(raw, ["parcelId", "parcel_id", "apn", "APN"]) || undefined;
  const listingUrl =
    pick(raw, ["listingUrl", "listing_url", "redfinLink", "redfin_url", "url", "link"]) ||
    undefined;

  if (!address && !parcelId && !listingUrl) return null;

  const now = new Date().toISOString();
  const base = {
    address: address || "Address unavailable",
    city,
    state,
    zip,
    parcelId,
    listingUrl,
  };

  return {
    id: crypto.randomUUID(),
    fingerprint: fingerprintFor(base),
    status: "needs_review",
    ...base,
    county: pick(raw, ["county", "County"]) || undefined,
    acres: numberValue(raw.acres ?? raw.lotAcres ?? raw.lot_size_acres),
    price: numberValue(raw.price ?? raw.listPrice ?? raw.askingPrice),
    zoning: pick(raw, ["zoning", "Zoning"]) || undefined,
    agentName:
      pick(raw, [
        "agentName",
        "agent_name",
        "listingAgent",
        "listing_agent",
        "brokerName",
        "broker_name",
      ]) || undefined,
    agentPhone:
      pick(raw, [
        "agentPhone",
        "agent_phone",
        "listingAgentPhone",
        "listing_agent_phone",
        "brokerPhone",
        "broker_phone",
        "phone",
      ]) || undefined,
    source: pick(raw, ["source", "Source"]) || "ActivePieces",
    notes: pick(raw, ["notes", "description", "remarks"]) || undefined,
    importedAt: now,
    updatedAt: now,
    raw,
  };
}

function isObject(value: unknown): value is IncomingProperty {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
