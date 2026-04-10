import React, { useEffect, useState } from 'react';

function toLocalDate(isoTime) {
  return new Date(isoTime).toLocaleString();
}

export function ControlPage() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');

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
  }

  useEffect(() => {
    loadStatus().catch((err) => setError(err.message));
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
    </>
  );
}
