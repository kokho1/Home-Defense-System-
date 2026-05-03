"""
bridge.py
─────────
Mosquitto MQTT bridge for the Home Defense System.

Responsibilities:
  1. Subscribe to face_recognition_result   (ESP32-CAM → bridge)
  2. Subscribe to handle_arm_status_send    (keypad MCU → bridge)
  3. On RECOGNIZED  → POST /api/disarm on the website
                    → publish "1" on handle_arm_status_receive (keypad MCU)
  4. On arm-status changes from the keypad MCU → forward to website REST
  5. Expose a thin HTTP API used by the website enrollment tab:
       POST /enroll/start   → publish "1"     on face_enroll_trigger
       POST /enroll/clear   → publish "clear" on face_enroll_trigger
       GET  /enroll/status  → current enrollment count + connection state

Run:
    python bridge.py

Requirements:
    pip install paho-mqtt flask flask-cors
"""

import threading
import logging
import time
import requests
import json

from flask import Flask, jsonify
from flask_cors import CORS

from mqtt import MQTTBridge
from config import (
    FLASK_HOST, FLASK_PORT,
    WEBSITE_BASE_URL,
    LOG_LEVEL,
)

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("bridge")

# ── Flask app (enrollment control API for the website) ───────────────────────
app = Flask(__name__)
CORS(app)   # website is on the same host but different port

# Shared bridge instance (set after init)
_bridge: MQTTBridge = None


@app.route("/enroll/start", methods=["POST"])
def enroll_start():
    if not _bridge.mqtt_connected():
        return jsonify({"ok": False, "error": "MQTT not connected"}), 503

    if _bridge.enrollment_count() >= _bridge.max_enrollments():
        return jsonify({"ok": False, "error": "Enrollment capacity full"}), 400

    _bridge.trigger_enrollment()
    return jsonify({"ok": True, "message": "Enrollment started on ESP32-CAM"})


@app.route("/enroll/clear", methods=["POST"])
def enroll_clear():
    if not _bridge.mqtt_connected():
        return jsonify({"ok": False, "error": "MQTT not connected"}), 503

    _bridge.clear_enrollments()
    return jsonify({"ok": True, "message": "All enrollments cleared"})


@app.route("/enroll/status", methods=["GET"])
def enroll_status():
    return jsonify({
        "ok": True,
        "mqtt_connected": _bridge.mqtt_connected(),
        "cam_connected": _bridge.cam_connected(),
        "enrolling": _bridge.is_enrolling(),
        "enrollment_count": _bridge.enrollment_count(),
        "max_enrollments": _bridge.max_enrollments(),
        "last_result": _bridge.last_face_result(),
        "arm_state": _bridge.arm_state(),
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})


# ── Website REST helpers ──────────────────────────────────────────────────────

def post_website(endpoint: str) -> bool:
    """POST to the locally-hosted website server."""
    url = f"{WEBSITE_BASE_URL}{endpoint}"
    try:
        r = requests.post(url, timeout=3)
        r.raise_for_status()
        log.info("Website %s → %s", endpoint, r.json())
        return True
    except Exception as exc:
        log.warning("Website call %s failed: %s", endpoint, exc)
        return False


# ── Bridge callbacks ──────────────────────────────────────────────────────────

def on_face_result(result: str):
    """Called by MQTTBridge when ESP32-CAM publishes a recognition result."""
    log.info("Face result: %s", result)

    if result == "RECOGNIZED":
        log.info("✔ Face recognised – disarming system")
        # Tell the website
        post_website("/api/disarm")
        # Tell the keypad MCU (it will physically disarm)
        _bridge.publish_arm_command(disarm=True)

    elif result == "UNKNOWN":
        log.debug("Face detected but not recognised")

    elif result == "ENROLL_FULL":
        log.warning("ESP32-CAM enrollment capacity is full")


def on_arm_status(is_disarmed: bool):
    """Called when the keypad MCU publishes its arm state."""
    endpoint = "/api/disarm" if is_disarmed else "/api/arm"
    log.info("Keypad MCU arm state → %s", "DISARMED" if is_disarmed else "ARMED")
    post_website(endpoint)


def on_enroll_done(count: int):
    """Called when ESP32-CAM finishes an enrollment sequence."""
    log.info("Enrollment complete – %d face(s) stored", count)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    global _bridge

    from config import (
        MQTT_BROKER_HOST, MQTT_BROKER_PORT,
        MQTT_CLIENT_ID,
    )

    _bridge = MQTTBridge(
        broker_host=MQTT_BROKER_HOST,
        broker_port=MQTT_BROKER_PORT,
        client_id=MQTT_CLIENT_ID,
        on_face_result=on_face_result,
        on_arm_status=on_arm_status,
        on_enroll_done=on_enroll_done,
    )
    _bridge.start()

    # Run Flask in a daemon thread so Ctrl-C kills everything
    flask_thread = threading.Thread(
        target=lambda: app.run(host=FLASK_HOST, port=FLASK_PORT, use_reloader=False),
        daemon=True,
    )
    flask_thread.start()
    log.info("Bridge HTTP API listening on %s:%d", FLASK_HOST, FLASK_PORT)
    log.info("Website base URL: %s", WEBSITE_BASE_URL)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Shutting down bridge")
        _bridge.stop()


if __name__ == "__main__":
    main()
