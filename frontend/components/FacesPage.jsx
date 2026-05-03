import React, { useCallback, useEffect, useRef, useState } from 'react';

// ── Config ────────────────────────────────────────────────────────────────────
// Bridge HTTP API (Python bridge.py running on the same machine)
const BRIDGE_URL = 'http://127.0.0.1:5050';

// How often to poll /enroll/status while the page is open (ms)
const POLL_INTERVAL_MS = 2000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatusDot({ on, color }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 10, height: 10,
      borderRadius: '50%',
      background: on ? color : '#475569',
      marginRight: '0.4rem',
      flexShrink: 0,
    }} />
  );
}

function Badge({ label, variant }) {
  const colors = {
    armed:      { bg: '#450a0a', color: '#fca5a5', border: '#7f1d1d' },
    disarmed:   { bg: '#052e16', color: '#86efac', border: '#14532d' },
    recognized: { bg: '#0c2340', color: '#7dd3fc', border: '#0369a1' },
    unknown:    { bg: '#2c1a00', color: '#fcd34d', border: '#92400e' },
    no_face:    { bg: '#1e293b', color: '#94a3b8', border: '#334155' },
  };
  const s = colors[variant] || colors.no_face;
  return (
    <span style={{
      padding: '0.2rem 0.6rem',
      borderRadius: '0.4rem',
      fontSize: '0.78rem',
      fontWeight: 600,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
    }}>
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function FacesPage() {
  // ── Bridge / device status ──────────────────────────────────────────────
  const [bridgeReachable,   setBridgeReachable]   = useState(false);
  const [mqttConnected,     setMqttConnected]     = useState(false);
  const [camConnected,      setCamConnected]      = useState(false);
  const [enrolling,         setEnrolling]         = useState(false);
  const [enrollmentCount,   setEnrollmentCount]   = useState(0);
  const [maxEnrollments,    setMaxEnrollments]    = useState(7);
  const [lastResult,        setLastResult]        = useState('NO_FACE');
  const [armState,          setArmState]          = useState('ARMED');

  // ── UI state ────────────────────────────────────────────────────────────
  const [actionMsg,  setActionMsg]  = useState('');
  const [actionErr,  setActionErr]  = useState('');
  const [showClear,  setShowClear]  = useState(false);
  const [clearing,   setClearing]   = useState(false);

  // ── Status polling ───────────────────────────────────────────────────────
  const pollStatus = useCallback(async () => {
    try {
      const r = await fetch(`${BRIDGE_URL}/enroll/status`, { signal: AbortSignal.timeout(2000) });
      if (!r.ok) throw new Error('Bad response');
      const d = await r.json();
      setBridgeReachable(true);
      setMqttConnected(d.mqtt_connected   ?? false);
      setCamConnected(d.cam_connected     ?? false);
      setEnrolling(d.enrolling            ?? false);
      setEnrollmentCount(d.enrollment_count ?? 0);
      setMaxEnrollments(d.max_enrollments  ?? 7);
      setLastResult(d.last_result          ?? 'NO_FACE');
      setArmState(d.arm_state              ?? 'ARMED');
    } catch {
      setBridgeReachable(false);
    }
  }, []);

  useEffect(() => {
    pollStatus();
    const id = setInterval(pollStatus, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollStatus]);

  // ── Actions ──────────────────────────────────────────────────────────────
  async function startEnrollment() {
    setActionMsg('');
    setActionErr('');
    try {
      const r = await fetch(`${BRIDGE_URL}/enroll/start`, { method: 'POST' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Unknown error');
      setActionMsg('Enrollment started – stand in front of the camera.');
      setEnrolling(true);
    } catch (e) {
      setActionErr(`Failed to start enrollment: ${e.message}`);
    }
  }

  async function clearEnrollments() {
    setClearing(true);
    setActionMsg('');
    setActionErr('');
    try {
      const r = await fetch(`${BRIDGE_URL}/enroll/clear`, { method: 'POST' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Unknown error');
      setActionMsg('All face enrollments cleared.');
      setEnrollmentCount(0);
      setShowClear(false);
    } catch (e) {
      setActionErr(`Failed to clear enrollments: ${e.message}`);
    } finally {
      setClearing(false);
    }
  }

  // ── Result badge ─────────────────────────────────────────────────────────
  const resultVariant = {
    RECOGNIZED: 'recognized',
    UNKNOWN:    'unknown',
    NO_FACE:    'no_face',
    ENROLL_FULL:'unknown',
  }[lastResult] ?? 'no_face';

  const capacity = maxEnrollments > 0
    ? Math.round((enrollmentCount / maxEnrollments) * 100)
    : 0;

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="card hero">
        <div className="hero-copy">
          <p className="eyebrow">Face Recognition</p>
          <h2>Manage enrolled faces</h2>
          <p className="muted">
            Enroll faces directly on the ESP32-CAM. Recognised faces
            automatically disarm the system.
          </p>
        </div>
        <div className={`hero-lock ${armState === 'DISARMED' ? 'disarmed' : 'armed'}`} aria-hidden="true">
          <span className="hero-lock-icon">{armState === 'DISARMED' ? '🔓' : '🔒'}</span>
          <span className="hero-lock-label">{armState}</span>
        </div>
      </section>

      {/* ── Connection status ────────────────────────────────────────── */}
      <section className="card">
        <p className="eyebrow" style={{ marginBottom: '0.75rem' }}>Connection Status</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <StatusDot on={bridgeReachable} color="#22c55e" />
            <span style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
              Python Bridge
              {!bridgeReachable && (
                <span style={{ color: '#ef4444', marginLeft: '0.4rem' }}>
                  — not reachable (is bridge.py running on port 5050?)
                </span>
              )}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <StatusDot on={mqttConnected} color="#22c55e" />
            <span style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
              MQTT Broker
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <StatusDot on={camConnected} color="#38bdf8" />
            <span style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
              ESP32-CAM
              {!camConnected && mqttConnected && (
                <span style={{ color: '#94a3b8', marginLeft: '0.4rem' }}>
                  — no messages received yet
                </span>
              )}
            </span>
          </div>
        </div>
      </section>

      {/* ── Live recognition status ──────────────────────────────────── */}
      <section className="card">
        <p className="eyebrow" style={{ marginBottom: '0.75rem' }}>Live Camera Status</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Last result:</span>
          <Badge label={lastResult.replace('_', ' ')} variant={resultVariant} />
          <span style={{ fontSize: '0.875rem', color: '#94a3b8', marginLeft: 'auto' }}>
            System: <Badge
              label={armState}
              variant={armState === 'DISARMED' ? 'disarmed' : 'armed'}
            />
          </span>
        </div>
        {enrolling && (
          <p style={{
            marginTop: '0.75rem', fontSize: '0.85rem',
            color: '#fcd34d', display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}>
            <span>⏳</span> Enrollment in progress – stand in front of the camera…
          </p>
        )}
      </section>

      {/* ── Enrollment management ────────────────────────────────────── */}
      <section className="card">
        <p className="eyebrow" style={{ marginBottom: '0.75rem' }}>Face Enrollments</p>

        {/* Capacity bar */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem',
          }}>
            <span>{enrollmentCount} of {maxEnrollments} slots used</span>
            <span>{capacity}%</span>
          </div>
          <div style={{
            height: 6, borderRadius: 3,
            background: '#1e293b', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${capacity}%`,
              borderRadius: 3,
              background: capacity >= 100 ? '#ef4444' : capacity > 70 ? '#f59e0b' : '#22c55e',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Feedback messages */}
        {actionMsg && (
          <p style={{ fontSize: '0.85rem', color: '#22c55e', marginBottom: '0.75rem' }}>
            ✓ {actionMsg}
          </p>
        )}
        {actionErr && (
          <p style={{ fontSize: '0.85rem', color: '#ef4444', marginBottom: '0.75rem' }}>
            ✗ {actionErr}
          </p>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-arm"
            onClick={startEnrollment}
            disabled={
              !bridgeReachable ||
              !mqttConnected   ||
              enrolling        ||
              enrollmentCount >= maxEnrollments
            }
          >
            <span className="btn-icon" aria-hidden="true">📸</span>
            {enrolling ? 'Enrolling…' : 'Enroll New Face'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setShowClear(true)}
            disabled={!bridgeReachable || !mqttConnected || enrollmentCount === 0}
          >
            <span className="btn-icon" aria-hidden="true">🗑</span>
            Clear All Faces
          </button>
        </div>

        {/* Enrollment instructions */}
        <div style={{
          marginTop: '1rem', padding: '0.75rem 1rem',
          background: '#0f172a', borderRadius: '0.5rem',
          border: '1px solid #1e293b', fontSize: '0.82rem', color: '#64748b',
          lineHeight: 1.6,
        }}>
          <strong style={{ color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
            How to enroll
          </strong>
          1. Click <em>Enroll New Face</em> — the ESP32-CAM LED will blink rapidly.<br />
          2. Stand ~50 cm in front of the camera, face forward, good lighting.<br />
          3. Hold still for ~2 seconds while {'{ENROLL_SAMPLE_COUNT}'} frames are captured.<br />
          4. The LED returns to slow-blink when done. Repeat for additional people.<br />
          5. To remove all faces, click <em>Clear All Faces</em>.
        </div>
      </section>

      {/* ── Clear confirmation modal ─────────────────────────────────── */}
      {showClear && (
        <div
          className="modal-overlay"
          onClick={() => !clearing && setShowClear(false)}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Clear enrollments confirmation"
            onClick={e => e.stopPropagation()}
          >
            <h3>Clear all face enrollments?</h3>
            <p className="muted">
              This deletes every stored face from the ESP32-CAM. The device will
              not recognise anyone until new faces are enrolled.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setShowClear(false)}
                disabled={clearing}
              >
                Cancel
              </button>
              <button
                className="btn btn-disarm btn-small"
                onClick={clearEnrollments}
                disabled={clearing}
              >
                {clearing ? 'Clearing…' : 'Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
