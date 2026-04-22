/*
 * mqtt.js
 * Paho MQTT integration for Home Defense System.
 *
 * Topics:
 *   SUBSCRIBE  password_login_time      – Arduino publishes login events → website adds history entry
 *   SUBSCRIBE  handle_arm_status_send   – Arduino publishes arm state    → website updates status display
 *   PUBLISH    set_login_password       – Website sends new password to Arduino
 *   PUBLISH    handle_arm_status_receive– Website sends arm/disarm command to Arduino
 *
 * Broker: test.mosquitto.org  (WebSocket port 8080 for browser clients)
 */

(function (global) {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────────────
  const BROKER_HOST = '10.26.216.27';
  const BROKER_PORT = 8080;
  const BROKER_PATH = '/mqtt';

  const TOPIC_LOGIN_EVENT       = 'password_login_time';       // Arduino → website (history)
  const TOPIC_ARM_STATUS_IN     = 'handle_arm_status_send';    // Arduino → website (status)
  const TOPIC_ARM_STATUS_OUT    = 'handle_arm_status_receive'; // Website → Arduino (command)
  const TOPIC_SET_PASSWORD      = 'set_login_password';        // Website → Arduino (password)

  const CLIENT_ID_PREFIX   = 'hds-web-';
  const RECONNECT_DELAY_MS = 5000;

  // ── Internal state ─────────────────────────────────────────────────────
  let client         = null;
  let reconnectTimer = null;
  let loginHandlers  = [];   // fn(parsedEvent)
  let statusHandlers = [];   // fn(status, msg?)
  let armHandlers    = [];   // fn(isDisarmed: boolean)

  let _status = 'disconnected';

  // ── Public API ─────────────────────────────────────────────────────────
  const MQTTClient = {
    connect,
    disconnect,
    setPassword,
    sendArmStatus,
    onLoginEvent,
    onArmStatus,
    onStatus,
    get status() { return _status; },
  };

  function _setStatus(status, msg) {
    _status = status;
    statusHandlers.forEach(fn => { try { fn(status, msg); } catch (_) {} });
  }

  // ── Paho loader ────────────────────────────────────────────────────────
  function _loadPaho(callback) {
    if (global.Paho && global.Paho.MQTT) { callback(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.min.js';
    script.async = true;
    script.onload = callback;
    script.onerror = () => _setStatus('error', 'Failed to load Paho MQTT library');
    document.head.appendChild(script);
  }

  // ── Core connect logic ─────────────────────────────────────────────────
  function connect() {
    clearTimeout(reconnectTimer);
    _loadPaho(_doConnect);
  }

  function _doConnect() {
    if (client && client.isConnected()) return;

    const clientId = CLIENT_ID_PREFIX + Math.random().toString(36).slice(2, 10);
    client = new global.Paho.MQTT.Client(BROKER_HOST, BROKER_PORT, BROKER_PATH, clientId);

    client.onConnectionLost = _onConnectionLost;
    client.onMessageArrived = _onMessageArrived;

    client.connect({
      useSSL: false,
      timeout: 10,
      onSuccess: _onConnect,
      onFailure: _onFailure,
    });
  }

  function _onConnect() {
    _setStatus('connected');
    client.subscribe(TOPIC_LOGIN_EVENT,   { qos: 0 });
    client.subscribe(TOPIC_ARM_STATUS_IN, { qos: 0 });
  }

  function _onConnectionLost(response) {
    _setStatus('disconnected', response.errorMessage);
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
  }

  function _onFailure(error) {
    _setStatus('error', error.errorMessage || 'Connection failed');
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
  }

  function _onMessageArrived(message) {
    const topic = message.destinationName;
    const raw   = message.payloadString;

    // ── password_login_time → history entry ─────────────────────────────
    if (topic === TOPIC_LOGIN_EVENT) {
      let parsed = { raw };
      const match = raw.match(/^([^:]+):(.+)$/);
      if (match) {
        parsed.action    = match[1].trim();   // e.g. "LOGIN_SUCCESS"
        parsed.timestamp = match[2].trim();   // e.g. "2025-04-19 14:35:02"
      }
      loginHandlers.forEach(fn => { try { fn(parsed); } catch (_) {} });

      // Persist to server so HistoryPage shows the new entry
      fetch('/api/history/mqtt-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw, action: parsed.action, timestamp: parsed.timestamp }),
      }).catch(() => {});
    }

    // ── handle_arm_status_send → status update ───────────────────────────
    if (topic === TOPIC_ARM_STATUS_IN) {
      // Arduino sends "1" = successfully disarmed, "0" = armed
      const isDisarmed = raw.trim() === '1';
      armHandlers.forEach(fn => { try { fn(isDisarmed); } catch (_) {} });

      // Keep REST state in sync with Arduino ground truth
      const endpoint = isDisarmed ? '/api/disarm' : '/api/arm';
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .catch(() => {});
    }
  }

  // ── Public helpers ─────────────────────────────────────────────────────
  function disconnect() {
    clearTimeout(reconnectTimer);
    if (client && client.isConnected()) client.disconnect();
    _setStatus('disconnected');
  }

  function setPassword(password) {
    if (!client || !client.isConnected()) return false;
    const msg = new global.Paho.MQTT.Message(String(password));
    msg.destinationName = TOPIC_SET_PASSWORD;
    msg.qos = 0;
    client.send(msg);
    return true;
  }

  /**
   * Publish arm/disarm command to the Arduino.
   * @param {boolean} disarm  true → send "1" (disarm), false → send "0" (arm)
   */
  function sendArmStatus(disarm) {
    if (!client || !client.isConnected()) return false;
    const msg = new global.Paho.MQTT.Message(disarm ? '1' : '0');
    msg.destinationName = TOPIC_ARM_STATUS_OUT;
    msg.qos = 0;
    client.send(msg);
    return true;
  }

  function onLoginEvent(fn)  { if (typeof fn === 'function') loginHandlers.push(fn);  }
  function onArmStatus(fn)   { if (typeof fn === 'function') armHandlers.push(fn);    }
  function onStatus(fn)      { if (typeof fn === 'function') statusHandlers.push(fn); }

  // ── Export ─────────────────────────────────────────────────────────────
  global.MQTTClient = MQTTClient;

})(window);