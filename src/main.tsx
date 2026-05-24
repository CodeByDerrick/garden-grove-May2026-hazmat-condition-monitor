import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, Clock, ExternalLink, MapPin, Phone, RefreshCw, ShieldAlert, Thermometer, Wifi } from 'lucide-react';
import { fetchCurrentStatus } from './api';
import type { CurrentStatus, HazmatEvent } from './types';
import './styles.css';

const REFRESH_INTERVAL_MS = 15000;

function formatDateTime(value?: string, fallback = 'Unknown'): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function label(value?: string): string {
  return value ? value.replace(/_/g, ' ') : 'unknown';
}

function severityClass(severity?: string): string {
  return `severity severity-${severity ?? 'info'}`;
}

function CurrentConditions({ status }: { status: CurrentStatus }) {
  const tank = status.tankTemperature;
  const tankDisplay = tank?.value ? `${tank.value}°${tank.units ?? 'unknown'}` : 'No current numeric public update';

  return (
    <section className="card hero-card">
      <div className="section-heading">
        <ShieldAlert aria-hidden="true" />
        <div>
          <p className="eyebrow">Current Conditions</p>
          <h1>Garden Grove Hazmat Monitor</h1>
        </div>
      </div>

      <p className="summary">{status.physicalSituationSummary}</p>

      <div className="condition-grid">
        <ConditionItem label="Monitor checked" value={formatDateTime(status.generatedAt)} icon={<Clock />} />
        <ConditionItem label="Latest captured physical signal" value={formatDateTime(status.lastPhysicalUpdateAt)} icon={<Wifi />} />
        <ConditionItem label="Tank temperature" value={tankDisplay} icon={<Thermometer />} detail={tank?.sourceName} />
        <ConditionItem label="Temperature trend" value={label(tank?.trend)} detail={label(String(tank?.confidence ?? status.confidence ?? 'unknown'))} />
        <ConditionItem label="Leak / plume" value={status.leakPlumeStatus ?? 'No current public update'} />
        <ConditionItem label="Air monitoring" value={status.airMonitoringStatus ?? 'No current public update'} />
        <ConditionItem label="Containment" value={status.containmentStatus ?? 'No current public update'} />
        <ConditionItem label="Cooling / neutralization" value={status.coolingNeutralizationStatus ?? 'No current public update'} />
      </div>

      <div className="overall-status">
        <strong>Overall status:</strong> {status.overallStatus ?? 'No synthesized status yet'}
      </div>
    </section>
  );
}

function ConditionItem({ label: title, value, detail, icon }: { label: string; value: string; detail?: string; icon?: React.ReactNode }) {
  return (
    <div className="condition-item">
      <div className="condition-title">
        {icon ? <span className="condition-icon">{icon}</span> : null}
        <span>{title}</span>
      </div>
      <div className="condition-value">{value}</div>
      {detail ? <div className="condition-detail">{detail}</div> : null}
    </div>
  );
}

function EvacuationResourcesPanel({ status }: { status: CurrentStatus }) {
  const resources = status.resources;
  if (!resources) return null;

  return (
    <section className="card">
      <div className="section-heading compact">
        <MapPin aria-hidden="true" />
        <div>
          <p className="eyebrow">Official Public Instructions</p>
          <h2>Evacuation & Resident Resources</h2>
        </div>
      </div>

      <div className="resource-status">
        <strong>Status:</strong> {resources.status}
        <br />
        <strong>Incident site:</strong> {resources.incidentSite}
      </div>

      <div className="resource-columns">
        <div>
          <h3>Evacuation zone</h3>
          <ul>{resources.evacuationZone.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div>
          <h3>Affected cities</h3>
          <ul>{resources.affectedCities.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </div>

      <div className="hotline-grid">
        {resources.hotlines.map((hotline) => (
          <div className="hotline-item" key={hotline.label}>
            <Phone size={15} aria-hidden="true" />
            <div>
              <strong>{hotline.label}</strong>
              <p>{hotline.value}</p>
              {hotline.note ? <small>{hotline.note}</small> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="link-grid">
        {[...resources.officialLinks, ...resources.shelterLinks, ...resources.hotelLinks].map((link) => (
          <a className="resource-link" href={link.url} target="_blank" rel="noreferrer" key={`${link.label}-${link.url}`}>
            {link.label} <ExternalLink size={14} aria-hidden="true" />
            {link.note ? <small>{link.note}</small> : null}
          </a>
        ))}
      </div>

      <div className="resource-notes">
        <strong>Notes:</strong>
        <ul>{resources.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        <p>Languages available: {resources.languages.join(', ')}</p>
      </div>
    </section>
  );
}

function SourceFreshnessPanel({ status }: { status: CurrentStatus }) {
  const freshness = status.sourceFreshness;
  if (!freshness) return null;

  return (
    <section className="card">
      <div className="section-heading compact">
        <Clock aria-hidden="true" />
        <div>
          <p className="eyebrow">Freshness Check</p>
          <h2>Source Freshness & Telemetry</h2>
        </div>
      </div>
      <div className="condition-grid">
        <ConditionItem label="Official text update" value={freshness.latestOfficialTextUpdate ?? 'Not found'} />
        <ConditionItem label="Official video update" value={freshness.latestOfficialVideoUpdate ?? 'Not found'} />
        <ConditionItem label="Media physical update" value={formatDateTime(freshness.latestMediaPhysicalUpdate, 'Not found')} />
        <ConditionItem label="Monitor capture" value={formatDateTime(freshness.latestMonitorCapture, 'Unknown')} />
      </div>
      <div className="overall-status">
        <strong>Telemetry:</strong> {freshness.telemetryStatus}
        {freshness.freshnessWarning ? <><br /><strong>Freshness warning:</strong> {freshness.freshnessWarning}</> : null}
      </div>
    </section>
  );
}

function UpdateLog({ events }: { events: HazmatEvent[] }) {
  return (
    <section className="card">
      <div className="section-heading compact">
        <Clock aria-hidden="true" />
        <div>
          <p className="eyebrow">Newest Captured First</p>
          <h2>Timestamped Update Log</h2>
        </div>
      </div>

      <ol className="event-list">
        {events.map((event) => (
          <li key={event.id} className="event-item">
            <div className="event-topline">
              <span className={severityClass(event.severity)}>{label(event.severity)}</span>
              <span className="event-category">{label(event.category)}</span>
            </div>
            <p className="event-summary">{event.summary}</p>
            {event.excerpt ? <blockquote>{event.excerpt}</blockquote> : null}
            <div className="event-meta">
              <span>Captured by monitor: {formatDateTime(event.observedAt)}</span>
              <span>Source-published time: {formatDateTime(event.sourcePublishedAt, 'Not found in source')}</span>
              <span>Confidence: {label(event.confidence)}</span>
            </div>
            <a className="source-link" href={event.sourceUrl} target="_blank" rel="noreferrer">
              {event.sourceName} <ExternalLink size={14} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SourceHealthPanel({ status }: { status: CurrentStatus }) {
  return (
    <section className="card">
      <div className="section-heading compact">
        <Wifi aria-hidden="true" />
        <div>
          <p className="eyebrow">Source Monitoring</p>
          <h2>Source Health</h2>
        </div>
      </div>
      <div className="source-health-list">
        {status.sourceHealth.map((source) => (
          <div key={`${source.sourceName}-${source.sourceUrl ?? ''}`} className="source-health-item">
            <div>
              <strong>{source.sourceName}</strong>
              <p>Last checked: {formatDateTime(source.lastCheckedAt)}</p>
              {source.lastChangedAt ? <p>Last changed: {formatDateTime(source.lastChangedAt)}</p> : null}
              {source.error ? <p className="error-text">{source.error}</p> : null}
            </div>
            <span className={source.ok ? 'health-ok' : 'health-error'}>{source.ok ? 'OK' : 'Error'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function App() {
  const [status, setStatus] = useState<CurrentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      setError(null);
      const nextStatus = await fetchCurrentStatus();
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown dashboard fetch error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
    const interval = window.setInterval(() => void loadStatus(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const sortedEvents = useMemo(() => {
    return [...(status?.newestEvents ?? [])].sort(
      (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
    );
  }, [status?.newestEvents]);

  return (
    <main>
      <div className="app-shell">
        <div className="top-bar">
          <div>
            <p className="eyebrow">Public-source emergency monitor</p>
            <h1>Physical Condition Dashboard</h1>
          </div>
          <button className="refresh-button" onClick={() => void loadStatus()} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
        </div>

        <div className="disclaimer">
          <AlertTriangle aria-hidden="true" />
          <span>This monitor tracks public-source updates. It is not direct tank telemetry and does not replace official emergency instructions.</span>
        </div>

        {error ? <div className="error-banner">Fetch error: {error}</div> : null}
        {!status && loading ? <div className="card">Loading dashboard data…</div> : null}
        {status ? (
          <>
            <CurrentConditions status={status} />
            <EvacuationResourcesPanel status={status} />
            <SourceFreshnessPanel status={status} />
            <UpdateLog events={sortedEvents} />
            <SourceHealthPanel status={status} />
          </>
        ) : null}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
