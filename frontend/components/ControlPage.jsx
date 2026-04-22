import React, { useEffect, useRef, useState } from 'react';

// ── MQTT Panel ────────────────────────────────────────────────────────────────
// Uses window.MQTTClient from /js/mqtt-client.js (loaded in the HTML shell).
// Completely isolated from the arm/disarm REST logic above.
function MQTTPanel() {
  const [mqttStatus, setMqttStatus]     = useState('disconnected');
  const [mqttError,  setMqttError]      = useState('');
  const [loginEvents, setLoginEvents]   = useState([]);
  const [newPassword, setNewPassword]   = useState('');
  const [pwFeedback,  setPwFeedback]    = useState('');
  const mqttReady = useRef(false);
 
  useEffect(() => {
    // Guard: mqtt-client.js may not be injected in test/SSR environments
    if (!window.MQTTClient) return;
    if (mqttReady.current) return;
    mqttReady.current = true;
 
    window.MQTTClient.onStatus((status, msg) => {
      setMqttStatus(status);
      setMqttError(status === 'error' ? (msg || 'Unknown error') : '');
    });
 
    window.MQTTClient.onLoginEvent((event) => {
      setLoginEvents(prev => [event, ...prev].slice(0, 50));
    });
 
    window.MQTTClient.connect();
 
    return () => {
      // Only disconnect if this component is unmounting for good (page nav).
      // MQTTClient will auto-reconnect; explicit disconnect is optional.
    };
  }, []);
 
  function handleSetPassword(e) {
    e.preventDefault();
    if (!newPassword.trim()) return;
    const sent = window.MQTTClient?.setPassword(newPassword.trim());
    if (sent) {
      setPwFeedback(`Password "${newPassword}" sent to Arduino ✓`);
      setNewPassword('');
    } else {
      setPwFeedback('Not connected – password not sent.');
    }
    setTimeout(() => setPwFeedback(''), 4000);
  }
 
  const statusColor = { connected: '#22c55e', disconnected: '#94a3b8', error: '#ef4444' }[mqttStatus] || '#94a3b8';
 
  return (
    <section className="card" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
        <p className="eyebrow" style={{ margin: 0 }}>MQTT Bridge</p>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'capitalize' }}>
          {mqttStatus}{mqttError ? ` – ${mqttError}` : ''}
        </span>
      </div>
 
      {/* Set Arduino Password */}
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
          Send a new keypad password to the Arduino via MQTT:
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="New password (e.g. 5678)"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            style={{
              flex: '1', minWidth: '160px', padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem', border: '1px solid #334155',
              background: '#0f172a', color: '#f8fafc', fontSize: '0.9rem',
            }}
          />
          <button
            className="btn"
            onClick={handleSetPassword}
            disabled={mqttStatus !== 'connected' || !newPassword.trim()}
            style={{ whiteSpace: 'nowrap' }}
          >
            Set Password
          </button>
        </div>
        {pwFeedback && (
          <p style={{ fontSize: '0.8rem', marginTop: '0.4rem', color: '#22c55e' }}>{pwFeedback}</p>
        )}
      </div>
 
      {/* Login Event Log */}
      <div>
        <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
          Live login events from Arduino (password_login_time):
        </p>
        <ul style={{
          listStyle: 'none', margin: 0, padding: 0,
          maxHeight: '180px', overflowY: 'auto',
          background: '#0f172a', borderRadius: '0.5rem', border: '1px solid #1e293b',
        }}>
          {loginEvents.length === 0 ? (
            <li style={{ padding: '0.6rem 0.75rem', fontSize: '0.8rem', color: '#475569' }}>
              Waiting for Arduino login events…
            </li>
          ) : loginEvents.map((ev, i) => (
            <li key={i} style={{
              padding: '0.4rem 0.75rem', fontSize: '0.8rem',
              borderBottom: i < loginEvents.length - 1 ? '1px solid #1e293b' : 'none',
              color: '#cbd5e1',
            }}>
              <span style={{ color: '#38bdf8', marginRight: '0.5rem' }}>{ev.action || '—'}</span>
              {ev.timestamp || ev.raw}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const TOPIC_LOGIN_EVENT = 'password_login_time';
function toLocalDate(isoTime) {
  return new Date(isoTime).toLocaleString();
}

export function ControlPage() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const mqttReady = useRef(false);

  async function loadStatus() {
    const response = await fetch('/api/status');
    if (!response.ok) {
      throw new Error('Failed to fetch system status.');
    }

    const payload = await response.json();
    setState(payload);
  }

  async function toggleSystem(mode) {
    setError('');
    const response = await fetch(`/api/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to ${mode} system.`);
    }

    const payload = await response.json();
    setState(payload.state);
    // mode === 'disarm'  → send "1" (disarmed)
    // mode === 'arm'     → send "0" (armed)
    window.MQTTClient?.sendArmStatus(mode === 'disarm');
  }


  useEffect(() => {
    loadStatus().catch((err) => setError(err.message));

    // Subscribe to arm-status updates pushed by the Arduino.
    // Fires when Arduino publishes on handle_arm_status_send ("1" = disarmed).
    if (!window.MQTTClient) return;
    if (mqttReady.current) return;
    mqttReady.current = true;

    window.MQTTClient.onArmStatus((isDisarmed) => {
      // Re-fetch state from the server (mqtt.js has already synced it via REST)
      loadStatus().catch(() => {});
    });

    // Connect only if not already connected (MQTTPanel also calls connect, but
    // MQTTClient.connect() is idempotent – safe to call twice)
    window.MQTTClient.connect();

  }, []);

  const armed = Boolean(state?.armed);

  return (
    <>
      <section className="card hero">
        <div className="hero-copy">
          <p className="eyebrow">System Overview</p>
          <h2>Smart protection for your home</h2>
          <p className="muted">
            Monitor and manage your security mode in real time. Arm when you leave,
            disarm when you return.
          </p>
        </div>

        <div className={`hero-lock ${armed ? 'armed' : 'disarmed'}`} aria-hidden="true">
          <span className="hero-lock-icon">{armed ? '🔒' : '🔓'}</span>
          <span className="hero-lock-label">{armed ? 'Locked' : 'Unlocked'}</span>
        </div>
      </section>

      <section className="card status-card">
        <div>
          <p className="eyebrow">Current Status</p>
          <h3 className={`status ${armed ? 'armed' : 'disarmed'}`}>
            {state ? (armed ? 'ARMED' : 'DISARMED') : 'Loading...'}
          </h3>
          <div className={`status-chip ${armed ? 'armed' : 'disarmed'}`}>
            <span className="status-chip-dot" />
            <span>{armed ? 'Key Locked' : 'Key Unlocked'}</span>
          </div>
          <p className="muted">
            {error
              ? error
              : state
                ? `Last updated: ${toLocalDate(state.updatedAt)}`
                : 'Checking system time...'}
          </p>
        </div>

        <div className="actions">
          <button
            className="btn btn-arm btn-action-lock"
            disabled={!state || armed}
            onClick={() => toggleSystem('arm').catch((err) => setError(err.message))}
          >
            <span className="btn-icon" aria-hidden="true">🔒</span>
            Arm System
          </button>
          <button
            className="btn btn-disarm btn-action-unlock"
            disabled={!state || !armed}
            onClick={() =>
              toggleSystem('disarm').catch((err) => setError(err.message))
            }
          >
            <span className="btn-icon" aria-hidden="true">🔓</span>
            Disarm System
          </button>
        </div>
      </section>
      <MQTTPanel />
    </>
  );
}
