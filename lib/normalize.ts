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
    payload.body,
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
  const fullAddress = pick(raw, ["address", "streetAddress", "propertyAddress", "Address"]);
  const parsedAddress = parseFullAddress(fullAddress);
  const address = parsedAddress.address || fullAddress;
  const city = pick(raw, ["city", "City"]);
  const state = pick(raw, ["state", "State"]);
  const zip = pick(raw, ["zip", "zipcode", "zipCode", "postalCode", "Zip"]);
  const parcelId =
    pick(raw, ["parcelId", "parcel_id", "propertyId", "property_id", "apn", "APN"]) ||
    undefined;
  const listingUrl =
    pick(raw, [
      "listingUrl",
      "listing_url",
      "propertyLink",
      "property_link",
      "redfinLink",
      "redfin_url",
      "url",
      "link",
    ]) ||
    undefined;
  const landPortalLink =
    pick(raw, [
      "landPortalLink",
      "land_portal_link",
      "landVuLink",
      "land_vu_link",
      "landPortalUrl",
      "land_portal_url",
      "landIdLink",
      "land_id_link",
      "landLink",
      "land_link",
    ]) || undefined;

  if (!address && !parcelId && !listingUrl) return null;

  const now = new Date().toISOString();
  const base = {
    address: address || "Address unavailable",
    city: city || parsedAddress.city,
    state: state || parsedAddress.state,
    zip: zip || parsedAddress.zip,
    parcelId,
    listingUrl,
    landPortalLink,
  };

  return {
    id: crypto.randomUUID(),
    fingerprint: fingerprintFor(base),
    status: "needs_review",
    ...base,
    county: pick(raw, ["county", "County"]) || undefined,
    acres: numberValue(raw.acres ?? raw.acreage ?? raw.lotAcres ?? raw.lot_size_acres),
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

function parseFullAddress(value: string) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const last = parts.at(-1) || "";
  const stateZip = last.match(/\b([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/);

  if (parts.length < 2 || !stateZip) {
    return { address: value, city: "", state: "", zip: "" };
  }

  return {
    address: parts.slice(0, -2).join(", ") || parts[0],
    city: parts.at(-2) || "",
    state: stateZip[1],
    zip: stateZip[2],
  };
}
