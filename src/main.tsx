import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, Clock, ExternalLink, RefreshCw, ShieldAlert, Thermometer, Wifi } from 'lucide-react';
import { fetchCurrentStatus } from './api';
import type { CurrentStatus, HazmatEvent } from './types';
import './styles.css';

const REFRESH_INTERVAL_MS = 15000;

function formatDateTime(value?: string): string {
  if (!value) return 'Unknown';
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
  const tankDisplay = tank?.value ? `${tank.value}°${tank.units ?? 'F'}` : 'No current numeric public update';

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
        <ConditionItem label="Last checked" value={formatDateTime(status.generatedAt)} icon={<Clock />} />
        <ConditionItem label="Last physical update" value={formatDateTime(status.lastPhysicalUpdateAt)} icon={<Wifi />} />
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

function UpdateLog({ events }: { events: HazmatEvent[] }) {
  return (
    <section className="card">
      <div className="section-heading compact">
        <Clock aria-hidden="true" />
        <div>
          <p className="eyebrow">Newest First</p>
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
              <span>Observed: {formatDateTime(event.observedAt)}</span>
              <span>Source time: {formatDateTime(event.sourcePublishedAt)}</span>
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
            <UpdateLog events={sortedEvents} />
            <SourceHealthPanel status={status} />
          </>
        ) : null}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
