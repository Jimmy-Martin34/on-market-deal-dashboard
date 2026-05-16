"use client";

import { Check, ExternalLink, RefreshCcw, Send, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import type { PropertyRecord, PropertyStatus } from "@/lib/types";

type Tab = {
  id: PropertyStatus;
  label: string;
  className?: string;
};

const tabs: Tab[] = [
  { id: "needs_review", label: "Needs review" },
  { id: "sent_to_crm", label: "Sent to CRM" },
  { id: "completed", label: "Completed", className: "completed" },
  { id: "discarded", label: "Discarded", className: "discarded" },
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function DealDashboard({
  initialProperties,
}: {
  initialProperties: PropertyRecord[];
}) {
  const [properties, setProperties] = useState(initialProperties);
  const [activeTab, setActiveTab] = useState<PropertyStatus>("needs_review");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();
    return properties.filter((property) => {
      if (property.status !== activeTab) return false;
      if (!normalizedQuery) return true;
      return [
        property.address,
        property.city,
        property.state,
        property.zip,
        property.county,
        property.parcelId,
        property.zoning,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [activeTab, properties, query]);

  const counts = useMemo(() => {
    return properties.reduce<Record<PropertyStatus, number>>(
      (acc, property) => {
        acc[property.status] += 1;
        return acc;
      },
      { needs_review: 0, sent_to_crm: 0, completed: 0, discarded: 0 },
    );
  }, [properties]);

  const newestImport = properties[0]?.importedAt;

  async function refreshProperties() {
    setError("");
    const response = await fetch("/api/properties", { cache: "no-store" });
    const data = (await response.json()) as { properties: PropertyRecord[] };
    setProperties(data.properties);
  }

  async function runImport() {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/manual-import", { method: "POST" });
      if (!response.ok) {
        setError("Import failed. Check Vercel function logs.");
        return;
      }
      await refreshProperties();
    });
  }

  async function act(id: string, action: "send_to_crm" | PropertyStatus) {
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/properties/${id}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setError(body.error || "Action failed.");
        return;
      }

      const body = (await response.json()) as { property: PropertyRecord };
      setProperties((current) =>
        current.map((property) => (property.id === id ? body.property : property)),
      );
    });
  }

  return (
    <main className="page-shell">
      <section className="dashboard" aria-label="Subdivide deal dashboard">
        <header className="topbar">
          <div className="title-block">
            <h1>Subdivide Deal Dashboard</h1>
            <p>New vacant land listings and possible subdivision opportunities.</p>
          </div>
          <div className="sync-meta">
            <div>{properties.length} total properties</div>
            <div>
              Last import:{" "}
              {newestImport ? new Date(newestImport).toLocaleString() : "No imports yet"}
            </div>
          </div>
        </header>

        <nav className="tabs" aria-label="Property status">
          {tabs.map((tab) => (
            <button
              className={`tab ${activeTab === tab.id ? "active" : ""} ${
                tab.className || ""
              }`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
              <span className="count">{counts[tab.id]}</span>
            </button>
          ))}
        </nav>

        <div className="toolbar">
          <input
            className="search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search address, county, parcel, zoning"
            value={query}
          />
          <div className="actions">
            <button
              className="icon-button"
              disabled={isPending}
              onClick={refreshProperties}
              title="Refresh dashboard"
              type="button"
            >
              <RefreshCcw size={17} />
            </button>
            <button
              className="import-button"
              disabled={isPending}
              onClick={runImport}
              type="button"
            >
              Run import
            </button>
          </div>
        </div>

        {error ? <div className="empty-state">{error}</div> : null}

        {filtered.length === 0 ? (
          <div className="empty-state">No properties in this tab.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Land</th>
                  <th>Price</th>
                  <th>Zoning</th>
                  <th>Source</th>
                  <th>Imported</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((property) => (
                  <tr key={property.id}>
                    <td className="property-cell">
                      <strong>{property.address}</strong>
                      <span className="subtle">
                        {[property.city, property.state, property.zip]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                      {property.parcelId ? (
                        <div className="subtle">Parcel: {property.parcelId}</div>
                      ) : null}
                    </td>
                    <td>
                      {property.acres ? `${property.acres.toLocaleString()} acres` : "Unknown"}
                      {property.county ? (
                        <div className="subtle">{property.county} County</div>
                      ) : null}
                    </td>
                    <td>{property.price ? currency.format(property.price) : "Unknown"}</td>
                    <td>{property.zoning ? <span className="badge">{property.zoning}</span> : "Unknown"}</td>
                    <td>
                      {property.listingUrl ? (
                        <a href={property.listingUrl} rel="noreferrer" target="_blank">
                          {property.source || "Listing"} <ExternalLink size={12} />
                        </a>
                      ) : (
                        property.source || "Import"
                      )}
                    </td>
                    <td>{new Date(property.importedAt).toLocaleDateString()}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="icon-button primary"
                          disabled={isPending}
                          onClick={() => act(property.id, "send_to_crm")}
                          title="Send to CRM"
                          type="button"
                        >
                          <Send size={16} />
                        </button>
                        <button
                          className="icon-button blue"
                          disabled={isPending}
                          onClick={() => act(property.id, "completed")}
                          title="Complete"
                          type="button"
                        >
                          <Check size={17} />
                        </button>
                        <button
                          className="icon-button danger"
                          disabled={isPending}
                          onClick={() => act(property.id, "discarded")}
                          title="Discard"
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
