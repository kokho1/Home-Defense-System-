# Home Defense – Python MQTT Bridge

Sits between Mosquitto, the ESP32-CAM, the keypad MCU, and the website.

## What it does

| Event | Action |
|-------|--------|
| ESP32-CAM publishes `RECOGNIZED` on `face_recognition_result` | POST `/api/disarm` → website; publish `1` → `handle_arm_status_receive` (keypad MCU) |
| Keypad MCU publishes on `handle_arm_status_send` | Forward to `/api/arm` or `/api/disarm` on website |
| Website enrollment tab calls `POST /enroll/start` | Publish `1` → `face_enroll_trigger` (ESP32-CAM starts enrolling) |
| Website enrollment tab calls `POST /enroll/clear` | Publish `clear` → `face_enroll_trigger` |

## Setup

```bash
pip install -r requirements.txt
```

Edit **`config.py`**:

| Setting | Default | Notes |
|---------|---------|-------|
| `MQTT_BROKER_HOST` | `127.0.0.1` | IP of your Mosquitto machine |
| `MQTT_BROKER_PORT` | `1883` | Standard unencrypted port |
| `WEBSITE_BASE_URL` | `http://127.0.0.1:3000` | Where the Express server runs |
| `FLASK_PORT` | `5050` | Bridge HTTP API (used by website enrollment tab) |
| `UNLOCK_COOLDOWN_SECS` | `6` | Ignore repeated recognitions within this window |

## Run

```bash
python bridge.py
```

## HTTP API (used by the website)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/enroll/start` | Start enrollment sequence on ESP32-CAM |
| `POST` | `/enroll/clear` | Delete all face enrollments |
| `GET`  | `/enroll/status` | Returns JSON with connection + enrollment state |
| `GET`  | `/health` | `{"ok": true}` liveness check |

## Mosquitto install (if not already running)

```bash
# Ubuntu / Debian
sudo apt install mosquitto mosquitto-clients
sudo systemctl enable --now mosquitto

# macOS
brew install mosquitto
brew services start mosquitto
```

Default Mosquitto config allows localhost connections on port 1883.
If your broker is on a different machine, add to `/etc/mosquitto/mosquitto.conf`:
```
listener 1883
allow_anonymous true
```
