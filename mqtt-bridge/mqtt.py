"""
mqtt.py
───────
Thread-safe Paho MQTT wrapper for the bridge.
All callbacks are invoked on the Paho network thread; they are kept
short so they don't block the loop.
"""

import logging
import time
import threading
from typing import Callable, Optional

import paho.mqtt.client as mqtt

from config import (
    MQTT_RECONNECT_DELAY,
    TOPIC_FACE_RESULT,
    TOPIC_ENROLL_TRIGGER,
    TOPIC_ENROLL_DONE,
    TOPIC_ARM_STATUS_IN,
    TOPIC_ARM_STATUS_OUT,
    MAX_FACE_ENROLLMENTS,
    UNLOCK_COOLDOWN_SECS,
)

log = logging.getLogger("mqtt_bridge")


class MQTTBridge:
    def __init__(
        self,
        broker_host: str,
        broker_port: int,
        client_id: str,
        on_face_result: Callable[[str], None],
        on_arm_status: Callable[[bool], None],
        on_enroll_done: Callable[[int], None],
    ):
        self._broker_host    = broker_host
        self._broker_port    = broker_port
        self._on_face_result = on_face_result
        self._on_arm_status  = on_arm_status
        self._on_enroll_done = on_enroll_done

        self._lock            = threading.Lock()
        self._connected       = False
        self._cam_seen        = False       # True once we get any cam message
        self._enrolling       = False
        self._enrollment_count = 0
        self._last_result     = "NO_FACE"
        self._armed           = True        # default: assume armed at startup
        self._last_unlock_ts  = 0.0

        self._client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv5)
        self._client.on_connect    = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message    = self._on_message

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def start(self):
        """Connect and start the background network loop."""
        self._connect()
        self._client.loop_start()
        log.info("MQTT bridge started → %s:%d", self._broker_host, self._broker_port)

    def stop(self):
        self._client.loop_stop()
        self._client.disconnect()
        log.info("MQTT bridge stopped")

    def _connect(self):
        try:
            self._client.connect(self._broker_host, self._broker_port, keepalive=60)
        except Exception as exc:
            log.error("Initial MQTT connect failed: %s – will retry", exc)

    # ── Paho callbacks ────────────────────────────────────────────────────────

    def _on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            with self._lock:
                self._connected = True
            log.info("Connected to MQTT broker")

            # Subscribe to all inbound topics
            client.subscribe(TOPIC_FACE_RESULT,   qos=0)
            client.subscribe(TOPIC_ENROLL_DONE,   qos=0)
            client.subscribe(TOPIC_ARM_STATUS_IN,  qos=0)
            log.info("Subscribed to: %s, %s, %s",
                     TOPIC_FACE_RESULT, TOPIC_ENROLL_DONE, TOPIC_ARM_STATUS_IN)
        else:
            log.error("MQTT connect refused (rc=%d)", rc)

    def _on_disconnect(self, client, userdata, rc, properties=None):
        with self._lock:
            self._connected = False
        if rc != 0:
            log.warning("Unexpected disconnect (rc=%d) – reconnecting in %ds",
                        rc, MQTT_RECONNECT_DELAY)
            time.sleep(MQTT_RECONNECT_DELAY)
            self._connect()

    def _on_message(self, client, userdata, msg):
        topic   = msg.topic
        payload = msg.payload.decode("utf-8", errors="replace").strip()
        log.debug("MSG [%s] → %r", topic, payload)

        # ── face_recognition_result ───────────────────────────────────────
        if topic == TOPIC_FACE_RESULT:
            with self._lock:
                self._last_result = payload
                self._cam_seen    = True

            if payload == "RECOGNIZED":
                now = time.monotonic()
                with self._lock:
                    since_last = now - self._last_unlock_ts
                if since_last < UNLOCK_COOLDOWN_SECS:
                    log.debug("Recognition cooldown active (%.1fs remaining)",
                              UNLOCK_COOLDOWN_SECS - since_last)
                    return
                with self._lock:
                    self._last_unlock_ts = now
                    self._armed = False

            self._on_face_result(payload)

        # ── face_enroll_done ──────────────────────────────────────────────
        elif topic == TOPIC_ENROLL_DONE:
            try:
                count = int(payload)
            except ValueError:
                count = 0
            with self._lock:
                self._enrollment_count = count
                self._enrolling        = False
            log.info("Enrollment done – %d face(s) on device", count)
            self._on_enroll_done(count)

        # ── handle_arm_status_send (keypad MCU) ───────────────────────────
        elif topic == TOPIC_ARM_STATUS_IN:
            is_disarmed = payload == "1"
            with self._lock:
                self._armed = not is_disarmed
            self._on_arm_status(is_disarmed)

    # ── Publish helpers ───────────────────────────────────────────────────────

    def publish_arm_command(self, disarm: bool):
        """Publish arm ("0") or disarm ("1") to the keypad MCU and ESP32-CAM."""
        payload = "1" if disarm else "0"
        self._publish(TOPIC_ARM_STATUS_OUT, payload)
        log.info("Published arm command: %s (%s)",
                 payload, "DISARM" if disarm else "ARM")

    def trigger_enrollment(self):
        """Tell the ESP32-CAM to start an enrollment sequence."""
        with self._lock:
            self._enrolling = True
        self._publish(TOPIC_ENROLL_TRIGGER, "1")
        log.info("Enrollment triggered on ESP32-CAM")

    def clear_enrollments(self):
        """Tell the ESP32-CAM to wipe all stored face embeddings."""
        with self._lock:
            self._enrollment_count = 0
            self._enrolling        = False
        self._publish(TOPIC_ENROLL_TRIGGER, "clear")
        log.info("Enrollment clear command sent")

    def _publish(self, topic: str, payload: str):
        if not self._connected:
            log.warning("Cannot publish – not connected")
            return
        self._client.publish(topic, payload, qos=0)

    # ── State accessors (thread-safe) ─────────────────────────────────────────

    def mqtt_connected(self) -> bool:
        with self._lock:
            return self._connected

    def cam_connected(self) -> bool:
        """True if we have received at least one message from the ESP32-CAM."""
        with self._lock:
            return self._cam_seen

    def is_enrolling(self) -> bool:
        with self._lock:
            return self._enrolling

    def enrollment_count(self) -> int:
        with self._lock:
            return self._enrollment_count

    def max_enrollments(self) -> int:
        return MAX_FACE_ENROLLMENTS

    def last_face_result(self) -> str:
        with self._lock:
            return self._last_result

    def arm_state(self) -> str:
        with self._lock:
            return "ARMED" if self._armed else "DISARMED"
