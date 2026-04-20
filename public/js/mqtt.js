/*
 * mqtt-client.js
 * Paho MQTT integration for Home Defense System.
 *
 * Topics (mirrors arduinocode_mqtt.txt):
 *   SUBSCRIBE  password_login_time  – Arduino publishes login events
 *   PUBLISH    set_login_password   – Website sends new password to Arduino
 *
 * Broker: test.mosquitto.org  (WebSocket port 8080 for browser clients)
 *
 * This file is self-contained. It does NOT import from or modify any other
 * source file. Drop it alongside app.js and reference it from any page.
 */
 
(function (global) {
  'use strict';
 
  // ── Configuration ────────────────────────────────────────────────────────
  const BROKER_HOST = 'test.mosquitto.org';
  const BROKER_PORT = 8080;           // WebSocket port (browsers cannot use raw TCP 1883)
  const BROKER_PATH = '/mqtt';        // Mosquitto WebSocket path
  const TOPIC_LOGIN_EVENT  = 'password_login_time';   // Arduino → website
  const TOPIC_SET_PASSWORD = 'set_login_password';    // Website → Arduino
  const CLIENT_ID_PREFIX   = 'hds-web-';              // Random suffix appended at runtime
  const RECONNECT_DELAY_MS = 5000;
 
  // ── Internal state ───────────────────────────────────────────────────────
  let client       = null;
  let reconnectTimer = null;
  let messageHandlers = [];     // [{topic, fn}]
  let statusHandlers  = [];     // fn(status: 'connected'|'disconnected'|'error', msg?)
 
  // ── Public API ───────────────────────────────────────────────────────────
  const MQTTClient = {
    /**
     * Connect to the broker.
     * Safe to call multiple times – re-uses existing connection when live.
     */
    connect,
 
    /** Disconnect cleanly. */
    disconnect,
 
    /**
     * Publish a new password string to the Arduino.
     * @param {string} password  Plain string; e.g. "5678"
     * @returns {boolean} false when not connected
     */
    setPassword,
 
    /**
     * Register a callback for inbound messages on password_login_time.
     * @param {function} fn  Called with (parsedEvent: {raw, timestamp?, action?})
     */
    onLoginEvent,
 
    /**
     * Register a callback for connection-status changes.
     * @param {function} fn  Called with (status, message?)
     */
    onStatus,
 
    /** @returns {'connected'|'disconnected'} */
    get status() { return _status; },
  };
 
  let _status = 'disconnected';
 
  function _setStatus(status, msg) {
    _status = status;
    statusHandlers.forEach(fn => { try { fn(status, msg); } catch (_) {} });
  }
 
  // ── Paho loader ──────────────────────────────────────────────────────────
  function _loadPaho(callback) {
    if (global.Paho && global.Paho.MQTT) {
      callback();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.min.js';
    script.async = true;
    script.onload = callback;
    script.onerror = () => _setStatus('error', 'Failed to load Paho MQTT library');
    document.head.appendChild(script);
  }
 
  // ── Core connect logic ───────────────────────────────────────────────────
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
    // Subscribe to login events from the Arduino
    client.subscribe(TOPIC_LOGIN_EVENT, { qos: 0 });
  }
 
  function _onConnectionLost(response) {
    _setStatus('disconnected', response.errorMessage);
    // Auto-reconnect
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
  }
 
  function _onFailure(error) {
    _setStatus('error', error.errorMessage || 'Connection failed');
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
  }
 
  function _onMessageArrived(message) {
    if (message.destinationName !== TOPIC_LOGIN_EVENT) return;
 
    const raw = message.payloadString;
    // Arduino format: "LOGIN_SUCCESS:HH:MM:SS DD/MM/YY"  (see arduinocode_mqtt.txt)
    let parsed = { raw };
    const match = raw.match(/^([^:]+):(.+)$/);
    if (match) {
      parsed.action    = match[1].trim();
      parsed.timestamp = match[2].trim();
    }
 
    messageHandlers.forEach(fn => { try { fn(parsed); } catch (_) {} });
  }
 
  // ── Public helpers ───────────────────────────────────────────────────────
  function disconnect() {
    clearTimeout(reconnectTimer);
    if (client && client.isConnected()) {
      client.disconnect();
    }
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
 
  function onLoginEvent(fn) {
    if (typeof fn === 'function') messageHandlers.push(fn);
  }
 
  function onStatus(fn) {
    if (typeof fn === 'function') statusHandlers.push(fn);
  }
 
  // ── Export ───────────────────────────────────────────────────────────────
  global.MQTTClient = MQTTClient;
 
})(window);