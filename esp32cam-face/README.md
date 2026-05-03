# ESP32-CAM Face Unlock Firmware

Face detection + recognition node for the Home Defense System.
Publishes results via MQTT; integrates with the existing keypad MCU and website.

---

## Hardware

| Item | Notes |
|------|-------|
| AI-Thinker ESP32-CAM | OV2640 camera, 4 MB flash, 4 MB PSRAM |
| FTDI USB-Serial adapter (3.3 V) | For flashing (board has no USB) |
| Jumper wire | IO0 → GND during flash only |

### Wiring for flash
```
FTDI TX  → ESP32-CAM U0R (pin 3)
FTDI RX  → ESP32-CAM U0T (pin 1)
FTDI GND → ESP32-CAM GND
FTDI 3V3 → ESP32-CAM 3V3
IO0      → GND            (boot mode – remove after flash)
```

---

## Prerequisites

1. **ESP-IDF v5.1+** installed and sourced (`get_idf` alias or `idf.py` on PATH).
2. **VSCode** with the *Espressif IDF* extension.
3. Clone `esp-who` into `components/`:
   ```bash
   cd components
   git clone --recursive https://github.com/espressif/esp-who.git
   ```

---

## Configuration

Edit **`main/config.h`** — the only file you need to touch:

| Constant | What to change |
|----------|---------------|
| `WIFI_SSID` / `WIFI_PASSWORD` | Your network credentials |
| `MQTT_BROKER_URI` | IP of your local Mosquitto machine, e.g. `mqtt://192.168.1.100:1883` |
| `FACE_RECOGNITION_THRESHOLD` | Raise for stricter matching (start at `0.55`) |
| `FACE_CONFIRM_FRAMES` | Frames in a row required to accept (default `3`) |
| `UNLOCK_COOLDOWN_MS` | Milliseconds before the camera can unlock again (default `5000`) |

---

## Build & Flash

```bash
# From the project root
idf.py set-target esp32
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

Or use the VSCode ESP-IDF extension buttons (Build → Flash → Monitor).

---

## MQTT Topics

| Topic | Direction | Payload | Meaning |
|-------|-----------|---------|---------|
| `face_recognition_result` | ESP32-CAM → broker | `RECOGNIZED` | Known face – disarm |
| `face_recognition_result` | ESP32-CAM → broker | `UNKNOWN` | Face seen, not matched |
| `face_recognition_result` | ESP32-CAM → broker | `NO_FACE` | No face in frame (1 Hz max) |
| `face_recognition_result` | ESP32-CAM → broker | `ENROLL_FULL` | Max enrollments reached |
| `face_enroll_trigger` | broker → ESP32-CAM | `1` | Start enrollment sequence |
| `face_enroll_trigger` | broker → ESP32-CAM | `clear` | Delete all enrollments |
| `face_enroll_done` | ESP32-CAM → broker | `<count>` | Enrollment complete |
| `handle_arm_status_receive` | broker → ESP32-CAM | `0` / `1` | Arm / disarm notification |

The Python bridge subscribes to `face_recognition_result` and, on `RECOGNIZED`,
publishes `1` to `handle_arm_status_receive` (keypad MCU) and calls `/api/disarm`
on the website server.

---

## LED Patterns (GPIO 33, active-LOW)

| Pattern | Meaning |
|---------|---------|
| Slow blink (1 Hz) | Idle – scanning |
| Fast blink (5 Hz) | Enrollment in progress |
| 3 quick flashes | Face recognised – unlocking |
| Solid on | Connected, waiting |

---

## Enrollment Flow

1. Website sends `1` to `face_enroll_trigger` (new Faces tab → Enroll button).
2. ESP32-CAM enters enrollment mode (fast-blink LED).
3. Subject stands in front of camera for ~1 second.
4. ESP32-CAM averages `ENROLL_SAMPLE_COUNT` frames → stores embedding in NVS.
5. Publishes count to `face_enroll_done`.
6. To clear all faces: website sends `clear` to `face_enroll_trigger`.

---

## Tuning Tips

- **Too many false rejects** → lower `FACE_RECOGNITION_THRESHOLD` (e.g. `0.50`)
- **Too many false accepts** → raise threshold (e.g. `0.60`) or increase `FACE_CONFIRM_FRAMES`
- **Slow recognition** → normal; esp-who runs at ~5–8 fps on ESP32 at 240 MHz
- **Good lighting matters most** – enroll in the same lighting you'll use for recognition
