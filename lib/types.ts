export type PropertyStatus = "needs_review" | "sent_to_crm" | "completed" | "discarded";

export type PropertyRecord = {
  id: string;
  fingerprint: string;
  status: PropertyStatus;
  address: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
  acres?: number;
  price?: number;
  zoning?: string;
  parcelId?: string;
  listingUrl?: string;
  landPortalLink?: string;
  agentName?: string;
  agentPhone?: string;
  source?: string;
  notes?: string;
  importedAt: string;
  updatedAt: string;
  sentToCrmAt?: string;
  completedAt?: string;
  discardedAt?: string;
  raw?: unknown;
};

export type ImportResult = {
  added: number;
  skippedDuplicates: number;
  records: PropertyRecord[];
};
