import crypto from "node:crypto";
import type { PropertyRecord } from "./types";

type IncomingProperty = Record<string, unknown>;
type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};
type CountyState = {
  county: string;
  state: string;
};

const IMPORT_TIME_ZONE = "America/New_York";

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
  const unwrapped = unwrapPayload(payload);
  const propertyLikeRecords = collectPropertyLikeRecords(unwrapped);

  if (propertyLikeRecords.length > 0) {
    return dedupeByReference(propertyLikeRecords);
  }

  if (Array.isArray(unwrapped)) {
    const nested = unwrapped.flatMap((item) => {
      if (!isObject(item) || !hasNestedRecords(item)) return isObject(item) ? [item] : [];
      return extractIncomingRecords(item);
    });
    return nested.filter(isObject);
  }
  if (!isObject(unwrapped)) return [];

  const candidates = [
    unwrapped.body,
    unwrapped.properties,
    unwrapped.records,
    unwrapped.data,
    unwrapped.items,
    unwrapped.listings,
  ];

  for (const candidate of candidates) {
    const nested = unwrapPayload(candidate);
    if (Array.isArray(nested)) return nested.filter(isObject);
    if (isObject(nested)) {
      const nestedRecords = extractIncomingRecords(nested);
      if (nestedRecords.length > 0 && nestedRecords[0] !== nested) return nestedRecords;
    }
  }

  return [unwrapped];
}

export async function normalizeIncomingProperty(raw: IncomingProperty): Promise<PropertyRecord | null> {
  const fullAddress = pick(raw, ["address", "streetAddress", "propertyAddress", "Address"]);
  const parsedAddress = parseFullAddress(fullAddress);
  const address = parsedAddress.address || fullAddress;
  const city = pick(raw, ["city", "City"]);
  const state = pick(raw, ["state", "State"]);
  const zip = pick(raw, ["zip", "zipcode", "zipCode", "postalCode", "Zip"]);
  const countyState = pick(raw, [
    "County, St",
    "County, State",
    "county, state",
    "countyState",
    "county_state",
    "countySt",
  ]);
  const parsedCountyState = parseCountyState(countyState);
  const parcelId =
    pick(raw, ["parcelId", "parcel_id", "propertyId", "property_id", "apn", "APN"]) ||
    undefined;
  const listingUrl =
    pick(raw, [
      "listingUrl",
      "listing_url",
      "propertyUrl",
      "property_url",
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
  const photoUrl =
    pick(raw, [
      "photoUrl",
      "photo_url",
      "photoURL",
      "photo",
      "image",
      "imageUrl",
      "image_url",
      "imageURL",
      "imageSrc",
      "image_src",
      "heroPhoto",
      "hero_photo",
      "heroPhotoUrl",
      "hero_photo_url",
      "heroImage",
      "hero_image",
      "heroImageUrl",
      "hero_image_url",
      "thumbnailUrl",
      "thumbnail_url",
      "thumbnail",
    ]) ||
    extractPhotoUrlFromHtml(raw) ||
    undefined;

  if (!address && !parcelId && !listingUrl) return null;

  const now = new Date().toISOString();
  const importedAt = parseImportDate(pick(raw, ["date", "importedAt", "createdAt"])) || now;
  const resolvedCity = city || parsedAddress.city;
  const resolvedState = state || parsedCountyState.state || parsedAddress.state;
  const resolvedZip = zip || parsedAddress.zip;
  const base = {
    address: address || "Address unavailable",
    city: resolvedCity,
    state: resolvedState,
    zip: resolvedZip,
    parcelId,
    photoUrl,
    listingUrl,
    landPortalLink,
  };
  const incomingCountyState = {
    county: pick(raw, ["county", "County"]) || parsedCountyState.county,
    state: resolvedState,
  };
  const resolvedCountyState =
    (await resolveCountyStateFromAddress({
      address: base.address,
      city: resolvedCity,
      state: resolvedState,
      zip: resolvedZip,
    })) || (shouldTrustIncomingCounty(raw) ? incomingCountyState : { county: "", state: resolvedState });
  const normalizedCountyState = resolvedCountyState.county
    ? [resolvedCountyState.county, resolvedCountyState.state].filter(Boolean).join(", ")
    : "";

  return {
    id: crypto.randomUUID(),
    fingerprint: fingerprintFor(base),
    status: "needs_review",
    ...base,
    county: resolvedCountyState.county || undefined,
    countyState: normalizedCountyState || (shouldTrustIncomingCounty(raw) ? countyState : "") || undefined,
    acres: numberValue(raw.acres ?? raw.acreage ?? raw.lotAcres ?? raw.lot_size_acres),
    price: numberValue(raw.price ?? raw.listPrice ?? raw.askingPrice),
    subdivideEstimate: numberValue(raw.subdivideEstimate ?? raw.subdivide_estimate),
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
    importedAt,
    updatedAt: now,
    raw,
  };
}

function isObject(value: unknown): value is IncomingProperty {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNestedRecords(value: IncomingProperty) {
  return [
    value.body,
    value.Body,
    value.result,
    value.response,
    value.output,
    value.properties,
    value.records,
    value.data,
    value.items,
    value.listings,
  ].some((candidate) => Array.isArray(candidate) || typeof candidate === "string" || isObject(candidate));
}

function unwrapPayload(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return value;
    try {
      return unwrapPayload(JSON.parse(trimmed) as unknown);
    } catch {
      return value;
    }
  }

  if (!isObject(value)) return value;

  const body = value.body;
  if (typeof body === "string" || Array.isArray(body)) return unwrapPayload(body);

  const upperBody = value.Body;
  if (typeof upperBody === "string" || Array.isArray(upperBody)) return unwrapPayload(upperBody);

  return value;
}

function collectPropertyLikeRecords(value: unknown): IncomingProperty[] {
  const parsed = unwrapPayload(value);

  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => collectPropertyLikeRecords(item));
  }

  if (!isObject(parsed)) return [];
  if (isPropertyLikeRecord(parsed)) return [parsed];

  return Object.values(parsed).flatMap((item) => collectPropertyLikeRecords(item));
}

function isPropertyLikeRecord(value: IncomingProperty) {
  const requiredAnchor = [
    "address",
    "Address",
    "propertyAddress",
    "streetAddress",
    "propertyId",
    "property_id",
    "parcelId",
    "parcel_id",
    "propertyLink",
    "property_link",
    "propertyUrl",
    "property_url",
    "listingUrl",
    "listing_url",
    "redfinLink",
  ].some((key) => text(value[key]));

  if (!requiredAnchor) return false;

  const markerScore = [
    "address",
    "Address",
    "propertyId",
    "property_id",
    "parcelId",
    "propertyLink",
    "property_link",
    "propertyUrl",
    "property_url",
    "listingUrl",
    "price",
    "listPrice",
    "acreage",
    "acres",
    "zipCode",
    "zipcode",
    "zip",
    "landVuLink",
    "landPortalLink",
    "photoUrl",
    "photoURL",
    "photo",
    "imageUrl",
    "imageURL",
    "image",
    "heroPhotoUrl",
    "heroImageUrl",
    "County, St",
    "subdivideEstimate",
  ].filter((key) => text(value[key]) || typeof value[key] === "number").length;

  return markerScore >= 2;
}

function dedupeByReference(records: IncomingProperty[]) {
  return records.filter((record, index) => records.indexOf(record) === index);
}

function extractPhotoUrlFromHtml(record: IncomingProperty) {
  const htmlCandidates = [
    text(record.html),
    text(record.body),
    isObject(record.message) ? text(record.message.html) : "",
  ].filter(Boolean);

  for (const html of htmlCandidates) {
    const homePhotoMatch = html.match(
      /<img\b(?=[^>]*\bclass=["'][^"']*\bhome-photo\b[^"']*["'])[^>]*\bsrc=["']([^"']+)["']/i,
    );
    const genericRedfinMatch = html.match(
      /<img\b[^>]*\bsrc=["']([^"']*redfin\.com\/stingray\/do\/api-get-listing-hero-shot[^"']+)["']/i,
    );
    const url = homePhotoMatch?.[1] || genericRedfinMatch?.[1] || "";
    if (url) return decodeHtmlUrl(url);
  }

  return "";
}

function decodeHtmlUrl(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#47;/g, "/")
    .trim();
}

function parseCountyState(value: string) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    county: parts[0] || "",
    state: parts[1] || "",
  };
}

function shouldTrustIncomingCounty(record: IncomingProperty) {
  const source = text(record.source ?? record.Source).toLowerCase();
  const listingUrl = pick(record, [
    "listingUrl",
    "listing_url",
    "propertyUrl",
    "property_url",
    "propertyLink",
    "property_link",
    "redfinLink",
    "redfin_url",
    "url",
    "link",
  ]).toLowerCase();
  const html = [
    text(record.html),
    text(record.body),
    isObject(record.message) ? text(record.message.html) : "",
  ]
    .join(" ")
    .toLowerCase();

  return !(
    source.includes("activepieces") ||
    listingUrl.includes("redfin.com") ||
    html.includes("redfin.com")
  );
}

async function resolveCountyStateFromAddress({
  address,
  city,
  state,
  zip,
}: {
  address: string;
  city: string;
  state: string;
  zip: string;
}): Promise<CountyState | null> {
  const candidates = [
    [address, city, state, zip].filter(Boolean).join(", "),
    [city, state, zip].filter(Boolean).join(", "),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const countyState = await fetchCensusCountyState(candidate);
    if (countyState) return countyState;
  }

  return null;
}

async function fetchCensusCountyState(address: string): Promise<CountyState | null> {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress");
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      result?: {
        addressMatches?: {
          geographies?: {
            Counties?: { NAME?: string; STUSAB?: string }[];
          };
        }[];
      };
    };
    const county = body.result?.addressMatches?.[0]?.geographies?.Counties?.[0];
    const countyName = county?.NAME?.trim() || "";
    const stateAbbreviation = county?.STUSAB?.trim() || "";
    if (!countyName || !stateAbbreviation) return null;
    return { county: countyName, state: stateAbbreviation };
  } catch {
    return null;
  }
}

function parseImportDate(value: string) {
  if (!value) return "";
  const trimmed = value.trim();
  const explicitTimeZone = /(?:z|[+-]\d{2}:?\d{2}|\b(?:UTC|GMT|EST|EDT)\b)$/i.test(trimmed);
  if (!explicitTimeZone) {
    const dateParts = parseNaiveDateParts(trimmed);
    if (dateParts) return zonedDatePartsToUtc(dateParts, IMPORT_TIME_ZONE).toISOString();
  }

  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function parseNaiveDateParts(value: string): DateParts | null {
  const isoMatch = value.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?)?$/i,
  );
  if (isoMatch) {
    return normalizeDateParts({
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
      hour: Number(isoMatch[4] || 0),
      minute: Number(isoMatch[5] || 0),
      second: Number(isoMatch[6] || 0),
      meridiem: isoMatch[7],
    });
  }

  const slashMatch = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?)?$/i,
  );
  if (slashMatch) {
    return normalizeDateParts({
      year: Number(slashMatch[3]),
      month: Number(slashMatch[1]),
      day: Number(slashMatch[2]),
      hour: Number(slashMatch[4] || 0),
      minute: Number(slashMatch[5] || 0),
      second: Number(slashMatch[6] || 0),
      meridiem: slashMatch[7],
    });
  }

  return null;
}

function normalizeDateParts({
  year,
  month,
  day,
  hour,
  minute,
  second,
  meridiem,
}: DateParts & { meridiem?: string }): DateParts | null {
  let normalizedHour = hour;
  if (meridiem?.toUpperCase() === "PM" && normalizedHour < 12) normalizedHour += 12;
  if (meridiem?.toUpperCase() === "AM" && normalizedHour === 12) normalizedHour = 0;

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    normalizedHour < 0 ||
    normalizedHour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return { year, month, day, hour: normalizedHour, minute, second };
}

function zonedDatePartsToUtc(parts: DateParts, timeZone: string) {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offset = getTimeZoneOffsetMinutes(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset * 60 * 1000);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return (zonedAsUtc - date.getTime()) / 60000;
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
