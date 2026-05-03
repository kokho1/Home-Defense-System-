#pragma once

// ── WiFi ─────────────────────────────────────────────────────────────────────
#define WIFI_SSID        "OnePlus 12R"
#define WIFI_PASSWORD    "michellengai"
#define WIFI_MAX_RETRY   4

// ── MQTT ──────────────────────────────────────────────────────────────────────
// Point this at your local Mosquitto broker IP (same machine as the website).
#define MQTT_BROKER_URI  "10.26.216.27"
#define MQTT_CLIENT_ID   "esp32cam-face"

// Topics
#define TOPIC_FACE_RESULT    "face_recognition_result"   // ESP32-CAM → broker
#define TOPIC_ENROLL_TRIGGER "face_enroll_trigger"       // broker    → ESP32-CAM
#define TOPIC_ENROLL_DONE    "face_enroll_done"          // ESP32-CAM → broker
#define TOPIC_ARM_RECEIVE    "handle_arm_status_receive" // broker    → ESP32-CAM (arm cmd)

// ── Camera (AI-Thinker ESP32-CAM pinout) ─────────────────────────────────────
#define CAM_PIN_PWDN    32
#define CAM_PIN_RESET   -1   // tied to EN on AI-Thinker board
#define CAM_PIN_XCLK     0
#define CAM_PIN_SIOD    26
#define CAM_PIN_SIOC    27
#define CAM_PIN_D7      35
#define CAM_PIN_D6      34
#define CAM_PIN_D5      39
#define CAM_PIN_D4      36
#define CAM_PIN_D3      21
#define CAM_PIN_D2      19
#define CAM_PIN_D1      18
#define CAM_PIN_D0       5
#define CAM_PIN_VSYNC   25
#define CAM_PIN_HREF    23
#define CAM_PIN_PCLK    22

// ── Onboard LED (active-LOW on AI-Thinker) ───────────────────────────────────
#define LED_PIN          33
#define LED_ACTIVE_LOW    1

// ── Face recognition tuning ──────────────────────────────────────────────────
// Cosine-similarity threshold [0.0 – 1.0].
// Lower  → stricter (fewer false accepts, more false rejects).
// Higher → looser  (more false accepts, fewer false rejects).
// 0.55 is a reasonable starting point; tune to your environment.
#define FACE_RECOGNITION_THRESHOLD  0.55f

// How many frames in a row must match before we accept (debounce).
#define FACE_CONFIRM_FRAMES   3

// How many face IDs can be stored in NVS.
#define MAX_FACE_ENROLLMENTS  7

// Milliseconds to ignore recognition after a successful unlock (cooldown).
#define UNLOCK_COOLDOWN_MS   5000

// ── Enrollment ───────────────────────────────────────────────────────────────
// Number of frames averaged together to build one enrollment vector.
#define ENROLL_SAMPLE_COUNT   5
