import fs from "node:fs/promises";
import path from "node:path";
import type { ImportResult, PropertyRecord, PropertyStatus } from "./types";

const STORE_KEY = "subdivide-deal-dashboard:properties";
const LOCAL_DATA_PATH = path.join(process.cwd(), "local-data", "properties.json");

async function hasRedisConfig() {
  const credentials = getRedisCredentials();
  return Boolean(credentials.url && credentials.token);
}

async function readLocal(): Promise<PropertyRecord[]> {
  try {
    const contents = await fs.readFile(LOCAL_DATA_PATH, "utf8");
    return JSON.parse(contents) as PropertyRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeLocal(records: PropertyRecord[]) {
  await fs.mkdir(path.dirname(LOCAL_DATA_PATH), { recursive: true });
  await fs.writeFile(LOCAL_DATA_PATH, JSON.stringify(records, null, 2));
}

async function getRedis() {
  const { Redis } = await import("@upstash/redis");
  const credentials = getRedisCredentials();
  return new Redis({
    url: credentials.url,
    token: credentials.token,
  });
}

function getRedisCredentials() {
  return {
    url:
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.KV_REST_API_URL ||
      process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ||
      process.env.UPSTASH_REDIS_REST_REDIS_URL ||
      process.env.UPSTASH_REDIS_REST_KV_URL ||
      "",
    token:
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      process.env.KV_REST_API_TOKEN ||
      process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ||
      process.env.UPSTASH_REDIS_REST_REDIS_TOKEN ||
      process.env.UPSTASH_REDIS_REST_KV_REST_API_READ_ONLY_TOKEN ||
      "",
  };
}

async function readRedis(): Promise<PropertyRecord[]> {
  const redis = await getRedis();
  return ((await redis.get(STORE_KEY)) as PropertyRecord[] | null) ?? [];
}

async function writeRedis(records: PropertyRecord[]) {
  const redis = await getRedis();
  await redis.set(STORE_KEY, records);
}

export async function getProperties(): Promise<PropertyRecord[]> {
  const records = (await hasRedisConfig()) ? await readRedis() : await readLocal();
  return records.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

async function saveProperties(records: PropertyRecord[]) {
  if (await hasRedisConfig()) {
    await writeRedis(records);
    return;
  }
  await writeLocal(records);
}

export async function importProperties(incoming: PropertyRecord[]): Promise<ImportResult> {
  const existing = await getProperties();
  const existingByFingerprint = new Map(
    existing.map((record) => [record.fingerprint, record]),
  );
  const seen = new Set(existingByFingerprint.keys());
  const fresh: PropertyRecord[] = [];
  let changedExisting = false;

  for (const record of incoming) {
    const duplicate = existingByFingerprint.get(record.fingerprint);
    if (duplicate) {
      changedExisting = mergeMissingImportFields(duplicate, record) || changedExisting;
      continue;
    }
    seen.add(record.fingerprint);
    fresh.push(record);
  }

  if (fresh.length > 0 || changedExisting) {
    await saveProperties([...fresh, ...existing]);
  }

  return {
    added: fresh.length,
    skippedDuplicates: incoming.length - fresh.length,
    records: fresh,
  };
}

function mergeMissingImportFields(existing: PropertyRecord, incoming: PropertyRecord) {
  let changed = false;

  for (const key of [
    "photoUrl",
    "listingUrl",
    "landPortalLink",
    "county",
    "countyState",
  ] satisfies (keyof PropertyRecord)[]) {
    if (!existing[key] && incoming[key]) {
      existing[key] = incoming[key] as never;
      changed = true;
    }
  }

  if (isLikelyImportTimezoneCorrection(existing.importedAt, incoming.importedAt)) {
    existing.importedAt = incoming.importedAt;
    changed = true;
  }

  if (changed) {
    existing.updatedAt = new Date().toISOString();
  }

  return changed;
}

function isLikelyImportTimezoneCorrection(existingValue?: string, incomingValue?: string) {
  if (!existingValue || !incomingValue || existingValue === incomingValue) return false;

  const existingTime = new Date(existingValue).getTime();
  const incomingTime = new Date(incomingValue).getTime();
  if (!Number.isFinite(existingTime) || !Number.isFinite(incomingTime)) return false;

  const hoursDifference = (incomingTime - existingTime) / (60 * 60 * 1000);
  return hoursDifference === 4 || hoursDifference === 5;
}

export async function updatePropertyStatus(
  id: string,
  status: PropertyStatus,
  updates: Partial<PropertyRecord> = {},
) {
  const records = await getProperties();
  const now = new Date().toISOString();
  let updated: PropertyRecord | null = null;

  const next = records.map((record) => {
    if (record.id !== id) return record;
    updated = {
      ...record,
      ...updates,
      status,
      updatedAt: now,
    };
    return updated;
  });

  if (!updated) return null;
  await saveProperties(next);
  return updated;
}
