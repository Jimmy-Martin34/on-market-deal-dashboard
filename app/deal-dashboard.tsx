"use client";

import { ExternalLink, RefreshCcw, Send, Trash2, Undo2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { PropertyRecord, PropertyStatus } from "@/lib/types";

type Tab = {
  id: PropertyStatus;
  label: string;
  className?: string;
};

type SummaryWindow = 7 | 30;

const tabs: Tab[] = [
  { id: "needs_review", label: "Needs review" },
  { id: "sent_to_crm", label: "Sent to CRM" },
  { id: "discarded", label: "Discarded", className: "discarded" },
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function DealDashboard({
  initialProperties,
}: {
  initialProperties: PropertyRecord[];
}) {
  const [properties, setProperties] = useState(initialProperties);
  const [activeTab, setActiveTab] = useState<PropertyStatus>("needs_review");
  const [query, setQuery] = useState("");
  const [summaryWindow, setSummaryWindow] = useState<SummaryWindow>(7);
  const [error, setError] = useState("");
  const [crmProperty, setCrmProperty] = useState<PropertyRecord | null>(null);
  const [manualCrmOpen, setManualCrmOpen] = useState(false);
  const [crmForm, setCrmForm] = useState({
    agentName: "",
    agentPhone: "",
    acres: "",
    landPortalLink: "",
    parcelId: "",
    dealNotes: "",
  });
  const [manualCrmForm, setManualCrmForm] = useState({
    dealName: "",
    countyState: "",
    agentName: "",
    agentPhone: "",
    acres: "",
    purchasePrice: "",
    onMarketLink: "",
    landIdLink: "",
    dealNotes: "",
  });
  const [crmError, setCrmError] = useState("");
  const [manualCrmError, setManualCrmError] = useState("");
  const [isSendingCrm, setIsSendingCrm] = useState(false);
  const [isSendingManualCrm, setIsSendingManualCrm] = useState(false);
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
        property.countyState,
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

  const summaryStats = useMemo(() => {
    const cutoff = Date.now() - summaryWindow * 24 * 60 * 60 * 1000;
    return {
      imported: countSince(properties, "importedAt", cutoff),
      sentToCrm: countSince(properties, "sentToCrmAt", cutoff),
    };
  }, [properties, summaryWindow]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshProperties();
    }, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function refreshProperties() {
    setError("");
    const response = await fetch("/api/properties", { cache: "no-store" });
    const data = (await response.json()) as { properties: PropertyRecord[] };
    setProperties(data.properties);
  }

  function openCrmForm(property: PropertyRecord) {
    setError("");
    setCrmError("");
    setCrmProperty(property);
    setCrmForm({
      agentName: property.agentName || "",
      agentPhone: property.agentPhone || "",
      acres: property.acres?.toString() || "",
      landPortalLink: property.landPortalLink || "",
      parcelId: "",
      dealNotes: property.notes || "",
    });
  }

  function openManualCrmForm() {
    setError("");
    setManualCrmError("");
    setManualCrmOpen(true);
    setManualCrmForm({
      dealName: "",
      countyState: "",
      agentName: "",
      agentPhone: "",
      acres: "",
      purchasePrice: "",
      onMarketLink: "",
      landIdLink: "",
      dealNotes: "",
    });
  }

  async function submitCrmForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!crmProperty) return;
    setCrmError("");
    setIsSendingCrm(true);
    const sent = await sendAction(crmProperty.id, "send_to_crm", crmForm, {
      showModalError: true,
    });
    setIsSendingCrm(false);
    if (sent) {
      setCrmProperty(null);
      setCrmError("");
    }
  }

  async function submitManualCrmForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualCrmError("");
    setIsSendingManualCrm(true);

    const response = await fetch("/api/manual-crm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(manualCrmForm),
    });

    setIsSendingManualCrm(false);
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setManualCrmError(body.error || "Manual CRM send failed.");
      return;
    }

    setManualCrmOpen(false);
  }

  function act(
    id: string,
    action: "send_to_crm" | PropertyStatus,
    crmDetails?: typeof crmForm,
  ) {
    startTransition(() => {
      void sendAction(id, action, crmDetails);
    });
  }

  async function sendAction(
    id: string,
    action: "send_to_crm" | PropertyStatus,
    crmDetails?: typeof crmForm,
    options?: { showModalError?: boolean },
  ) {
    setError("");
    const response = await fetch(`/api/properties/${id}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...crmDetails }),
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      const message = body.error || "Action failed.";
      if (options?.showModalError) {
        setCrmError(message);
      } else {
        setError(message);
      }
      return false;
    }

    const body = (await response.json()) as { property: PropertyRecord };
    setProperties((current) =>
      current.map((property) => (property.id === id ? body.property : property)),
    );
    return true;
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
            <label className="summary-filter">
              <span>Window</span>
              <select
                onChange={(event) =>
                  setSummaryWindow(Number(event.target.value) as SummaryWindow)
                }
                value={summaryWindow}
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
              </select>
            </label>
            <div>Dashboard: {summaryStats.imported}</div>
            <button className="manual-link" onClick={openManualCrmForm} type="button">
              Manual
            </button>
            {activeTab === "sent_to_crm" ? (
              <div>Sent to CRM: {summaryStats.sentToCrm}</div>
            ) : null}
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
            placeholder="Search address or county"
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
                  <th>Acreage</th>
                  <th>County</th>
                  <th>State</th>
                  <th>List Price</th>
                  <th>Subdivide Estimate</th>
                  <th>Redfin Link</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((property) => (
                  <tr key={property.id}>
                    <td className="property-cell">
                      <div className="property-main">
                        {property.photoUrl ? (
                          <img
                            alt=""
                            className="property-photo"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            src={property.photoUrl}
                          />
                        ) : (
                          <div className="property-photo placeholder" aria-hidden="true" />
                        )}
                        <div>
                          <strong>{property.address}</strong>
                          <span className="subtle">
                            {[property.city, property.state, property.zip]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {property.acres ? `${property.acres.toLocaleString()} acres` : "Unknown"}
                    </td>
                    <td>{getCounty(property)}</td>
                    <td>{getState(property)}</td>
                    <td>
                      {property.price ? currency.format(property.price) : "Unknown"}
                    </td>
                    <td>
                      {property.subdivideEstimate
                        ? currency.format(property.subdivideEstimate)
                        : "Unknown"}
                    </td>
                    <td>
                      {property.listingUrl ? (
                        <a href={property.listingUrl} rel="noreferrer" target="_blank">
                          Click Here <ExternalLink size={12} />
                        </a>
                      ) : (
                        "Unavailable"
                      )}
                    </td>
                    <td>
                      <div className="actions">
                        {property.status === "needs_review" ? (
                          <>
                            <button
                              className="icon-button primary"
                              disabled={isPending}
                              onClick={() => openCrmForm(property)}
                              title="Send to CRM"
                              type="button"
                            >
                              <Send size={16} />
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
                          </>
                        ) : null}
                        {property.status === "discarded" ? (
                          <button
                            className="icon-button blue"
                            disabled={isPending}
                            onClick={() => act(property.id, "needs_review")}
                            title="Send back to Needs Review"
                            type="button"
                          >
                            <Undo2 size={17} />
                          </button>
                        ) : null}
                      </div>
                      <div className="action-date">
                        Imported {formatDateTime(property.importedAt)}
                      </div>
                      {property.status === "sent_to_crm" && property.sentToCrmAt ? (
                        <div className="action-date">
                          Sent to CRM {formatDateTime(property.sentToCrmAt)}
                        </div>
                      ) : null}
                      {property.status === "discarded" && property.discardedAt ? (
                        <div className="action-date">
                          Discarded {formatDateTime(property.discardedAt)}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {crmProperty ? (
        <div className="modal-backdrop" role="presentation">
          <form className="crm-modal" onSubmit={submitCrmForm}>
            <div className="modal-header">
              <div>
                <h2>Send to CRM</h2>
                <p>{buildDealTitle(crmProperty)}</p>
              </div>
              <button
                className="modal-close"
                onClick={() => setCrmProperty(null)}
                type="button"
              >
                x
              </button>
            </div>
            <label>
              Agent name
              <input
                onChange={(event) =>
                  setCrmForm((current) => ({ ...current, agentName: event.target.value }))
                }
                placeholder="Full agent name"
                required
                value={crmForm.agentName}
              />
            </label>
            <label>
              Agent phone number
              <input
                onChange={(event) =>
                  setCrmForm((current) => ({ ...current, agentPhone: event.target.value }))
                }
                placeholder="Agent phone"
                value={crmForm.agentPhone}
              />
            </label>
            <label>
              Acreage
              <input
                min="0"
                onChange={(event) =>
                  setCrmForm((current) => ({ ...current, acres: event.target.value }))
                }
                placeholder="Acreage"
                step="0.01"
                type="number"
                value={crmForm.acres}
              />
            </label>
            <label>
              Land ID / Land portal link
              <input
                onChange={(event) =>
                  setCrmForm((current) => ({
                    ...current,
                    landPortalLink: event.target.value,
                  }))
                }
                placeholder="Land portal link"
                value={crmForm.landPortalLink}
              />
            </label>
            <label>
              Parcel ID
              <input
                onChange={(event) =>
                  setCrmForm((current) => ({ ...current, parcelId: event.target.value }))
                }
                placeholder="Parcel number"
                value={crmForm.parcelId}
              />
            </label>
            <label>
              Deal notes
              <textarea
                onChange={(event) =>
                  setCrmForm((current) => ({ ...current, dealNotes: event.target.value }))
                }
                placeholder="Notes for this deal"
                rows={4}
                value={crmForm.dealNotes}
              />
            </label>
            {crmError ? <div className="modal-error">{crmError}</div> : null}
            <div className="modal-summary">
              <div>Agreement price: {crmProperty.price ? currency.format(crmProperty.price) : "Unknown"}</div>
              <div>Lead source: On Market Email list</div>
            </div>
            <div className="modal-actions">
              <button
                className="secondary-button"
                disabled={isSendingCrm}
                onClick={() => setCrmProperty(null)}
                type="button"
              >
                Cancel
              </button>
              <button className="submit-button" disabled={isSendingCrm} type="submit">
                {isSendingCrm ? "Sending..." : "Send to CRM"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {manualCrmOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="crm-modal" onSubmit={submitManualCrmForm}>
            <div className="modal-header">
              <div>
                <h2>Manual CRM</h2>
                <p>Create a deal directly in the CRM.</p>
              </div>
              <button
                className="modal-close"
                onClick={() => setManualCrmOpen(false)}
                type="button"
              >
                x
              </button>
            </div>
            <label>
              Deal name
              <input
                onChange={(event) =>
                  setManualCrmForm((current) => ({
                    ...current,
                    dealName: event.target.value,
                  }))
                }
                placeholder="Deal name"
                required
                value={manualCrmForm.dealName}
              />
            </label>
            <label>
              County, St
              <input
                onChange={(event) =>
                  setManualCrmForm((current) => ({
                    ...current,
                    countyState: event.target.value,
                  }))
                }
                placeholder="County, ST"
                value={manualCrmForm.countyState}
              />
            </label>
            <label>
              Agent name
              <input
                onChange={(event) =>
                  setManualCrmForm((current) => ({
                    ...current,
                    agentName: event.target.value,
                  }))
                }
                placeholder="Full agent name"
                required
                value={manualCrmForm.agentName}
              />
            </label>
            <label>
              Agent number
              <input
                onChange={(event) =>
                  setManualCrmForm((current) => ({
                    ...current,
                    agentPhone: event.target.value,
                  }))
                }
                placeholder="Agent number"
                value={manualCrmForm.agentPhone}
              />
            </label>
            <label>
              Acreage
              <input
                min="0"
                onChange={(event) =>
                  setManualCrmForm((current) => ({ ...current, acres: event.target.value }))
                }
                placeholder="Acreage"
                step="0.01"
                type="number"
                value={manualCrmForm.acres}
              />
            </label>
            <label>
              Purchase price
              <input
                min="0"
                onChange={(event) =>
                  setManualCrmForm((current) => ({
                    ...current,
                    purchasePrice: event.target.value,
                  }))
                }
                placeholder="Purchase price"
                step="1"
                type="number"
                value={manualCrmForm.purchasePrice}
              />
            </label>
            <label>
              On market link
              <input
                onChange={(event) =>
                  setManualCrmForm((current) => ({
                    ...current,
                    onMarketLink: event.target.value,
                  }))
                }
                placeholder="https://..."
                type="url"
                value={manualCrmForm.onMarketLink}
              />
            </label>
            <label>
              Land ID link
              <input
                onChange={(event) =>
                  setManualCrmForm((current) => ({
                    ...current,
                    landIdLink: event.target.value,
                  }))
                }
                placeholder="https://..."
                type="url"
                value={manualCrmForm.landIdLink}
              />
            </label>
            <label>
              Deal notes
              <textarea
                onChange={(event) =>
                  setManualCrmForm((current) => ({
                    ...current,
                    dealNotes: event.target.value,
                  }))
                }
                placeholder="Notes for this deal"
                rows={4}
                value={manualCrmForm.dealNotes}
              />
            </label>
            {manualCrmError ? <div className="modal-error">{manualCrmError}</div> : null}
            <div className="modal-actions">
              <button
                className="secondary-button"
                disabled={isSendingManualCrm}
                onClick={() => setManualCrmOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="submit-button" disabled={isSendingManualCrm} type="submit">
                {isSendingManualCrm ? "Sending..." : "Send to CRM"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateTime.format(parsed);
}

function countSince(
  properties: PropertyRecord[],
  dateKey: "importedAt" | "sentToCrmAt",
  cutoff: number,
) {
  return properties.filter((property) => {
    const value = property[dateKey];
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  }).length;
}

function getCounty(property: PropertyRecord) {
  return property.county || property.countyState?.split(",")[0]?.trim() || "Unknown";
}

function getState(property: PropertyRecord) {
  return property.state || property.countyState?.split(",")[1]?.trim() || "Unknown";
}

function buildDealTitle(property: PropertyRecord) {
  const acreage = property.acres ? `${formatNumber(property.acres)} Acre` : "Unknown Acreage";
  return `${acreage} / ${getCounty(property)}, ${getState(property)}`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}
