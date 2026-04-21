import React, { useEffect, useRef, useState } from 'react';

export function PasswordPage() {
  const [name,       setName]       = useState('');
  const [password,   setPassword]   = useState('');
  const [feedback,   setFeedback]   = useState(null);   // { ok: bool, msg: string }
  const [mqttStatus, setMqttStatus] = useState('disconnected');
  const mqttReady = useRef(false);

  useEffect(() => {
    if (!window.MQTTClient) return;
    if (mqttReady.current) return;
    mqttReady.current = true;

    window.MQTTClient.onStatus((status) => setMqttStatus(status));
    window.MQTTClient.connect();
  }, []);

  function handleSet(e) {
    e.preventDefault();

    const trimmedPw = password.trim();

    if (!/^\d{4,6}$/.test(trimmedPw)) {
      setFeedback({ ok: false, msg: 'Password must be 4–6 digits.' });
      return;
    }

    // Payload: just the password string (matches Arduino handle_password_setting_logic).
    // If a name is provided it's included as metadata for the UI only — the Arduino
    // only reads the password portion before the first space.
    const payload = name.trim() ? `${trimmedPw} ${name.trim()}` : trimmedPw;
    const sent = window.MQTTClient?.setPassword(payload);

    if (sent) {
      setFeedback({
        ok: true,
        msg: name.trim()
          ? `Password for "${name.trim()}" set to ${trimmedPw}.`
          : `Password set to ${trimmedPw}.`,
      });
      setName('');
      setPassword('');
    } else {
      setFeedback({ ok: false, msg: 'Not connected to MQTT broker. Please wait and retry.' });
    }

    setTimeout(() => setFeedback(null), 5000);
  }

  const statusColor = {
    connected:    '#22c55e',
    disconnected: '#94a3b8',
    error:        '#ef4444',
  }[mqttStatus] || '#94a3b8';

  const isConnected = mqttStatus === 'connected';

  return (
    <>
      {/* Header card */}
      <section className="card hero">
        <div className="hero-copy">
          <p className="eyebrow">Access Control</p>
          <h2>Password Manager</h2>
          <p className="muted">
            Set the keypad password on your Arduino device remotely.
            Passwords must be 4–6 digits and are sent instantly via MQTT.
          </p>
        </div>
        <div className="hero-lock" aria-hidden="true">
          <span className="hero-lock-icon">🔑</span>
          <span className="hero-lock-label">Key Manager</span>
        </div>
      </section>

      {/* Form card */}
      <section className="card status-card" style={{ display: 'block' }}>

        {/* MQTT status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: statusColor, display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'capitalize' }}>
            MQTT {mqttStatus}
          </span>
        </div>

        <form onSubmit={handleSet} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Name field (optional) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              Name <span style={{ color: '#475569' }}>(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Alice"
              value={name}
              onChange={e => setName(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Password field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              Password <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{4,6}"
              maxLength={6}
              placeholder="4–6 digit code"
              value={password}
              onChange={e => setPassword(e.target.value.replace(/\D/g, ''))}
              style={inputStyle}
            />
            <span style={{ fontSize: '0.75rem', color: '#475569' }}>
              Numbers only · 4 to 6 digits
            </span>
          </div>

          {/* Feedback */}
          {feedback && (
            <p style={{
              fontSize: '0.85rem',
              color: feedback.ok ? '#22c55e' : '#ef4444',
              margin: 0,
            }}>
              {feedback.ok ? '✓ ' : '✕ '}{feedback.msg}
            </p>
          )}

          {/* Submit */}
          <div style={{ marginTop: '0.5rem' }}>
            <button
              type="submit"
              className="btn btn-arm"
              disabled={!isConnected || !password.trim()}
              style={{ minWidth: '120px' }}
            >
              <span className="btn-icon" aria-hidden="true">📡</span>
              Set Password
            </button>
            {!isConnected && (
              <span style={{ marginLeft: '0.75rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                Waiting for MQTT connection…
              </span>
            )}
          </div>

        </form>
      </section>
    </>
  );
}

const inputStyle = {
  padding: '0.6rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#f8fafc',
  fontSize: '0.95rem',
  width: '100%',
  boxSizing: 'border-box',
};