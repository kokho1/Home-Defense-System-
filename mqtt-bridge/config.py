"""
config.py
─────────
All user-editable settings for the MQTT bridge.
"""

# ── MQTT broker ───────────────────────────────────────────────────────────────
# Point at whichever machine is running Mosquitto.
# If Mosquitto is on the same laptop as the website, use 127.0.0.1.
MQTT_BROKER_HOST = "127.0.0.1"
MQTT_BROKER_PORT = 1883
MQTT_CLIENT_ID   = "hds-python-bridge"

# Reconnect delay in seconds when the broker drops
MQTT_RECONNECT_DELAY = 5

# ── MQTT topics (must match config.h and mqtt.js exactly) ────────────────────
TOPIC_FACE_RESULT    = "face_recognition_result"   # ESP32-CAM → bridge
TOPIC_ENROLL_TRIGGER = "face_enroll_trigger"       # bridge    → ESP32-CAM
TOPIC_ENROLL_DONE    = "face_enroll_done"          # ESP32-CAM → bridge
TOPIC_ARM_STATUS_IN  = "handle_arm_status_send"    # keypad    → bridge
TOPIC_ARM_STATUS_OUT = "handle_arm_status_receive" # bridge    → keypad + cam

# ── Website ───────────────────────────────────────────────────────────────────
# Base URL of the locally-hosted Express server.
WEBSITE_BASE_URL = "http://127.0.0.1:3000"

# ── Bridge HTTP API ───────────────────────────────────────────────────────────
# The website enrollment tab POSTs to these endpoints.
FLASK_HOST = "0.0.0.0"
FLASK_PORT = 5050

# ── Face recognition settings ─────────────────────────────────────────────────
# Maximum face enrollments the ESP32-CAM supports (mirrors config.h)
MAX_FACE_ENROLLMENTS = 7

# Seconds after a successful recognition before we accept another unlock.
# Prevents a single recognition event flooding the system.
UNLOCK_COOLDOWN_SECS = 6

# ── Logging ───────────────────────────────────────────────────────────────────
# DEBUG / INFO / WARNING / ERROR
LOG_LEVEL = "INFO"
