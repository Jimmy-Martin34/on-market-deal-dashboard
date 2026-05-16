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
  const seen = new Set(existing.map((record) => record.fingerprint));
  const fresh: PropertyRecord[] = [];

  for (const record of incoming) {
    if (seen.has(record.fingerprint)) continue;
    seen.add(record.fingerprint);
    fresh.push(record);
  }

  if (fresh.length > 0) {
    await saveProperties([...fresh, ...existing]);
  }

  return {
    added: fresh.length,
    skippedDuplicates: incoming.length - fresh.length,
    records: fresh,
  };
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
