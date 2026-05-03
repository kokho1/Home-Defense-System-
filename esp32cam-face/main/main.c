#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"

#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "esp_netif.h"

#include "config.h"
#include "camera.h"
#include "face_pipeline.h"
#include "mqtt_client.h"
#include "enrollments.h"
#include "led.h"

static const char *TAG = "main";

// ── WiFi ──────────────────────────────────────────────────────────────────────
#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1

static EventGroupHandle_t s_wifi_events;
static int                s_wifi_retries = 0;

static void wifi_event_handler(void *arg,
                                esp_event_base_t base,
                                int32_t id,
                                void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();

    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_wifi_retries < WIFI_MAX_RETRY) {
            esp_wifi_connect();
            s_wifi_retries++;
            ESP_LOGW(TAG, "WiFi retry %d/%d", s_wifi_retries, WIFI_MAX_RETRY);
        } else {
            xEventGroupSetBits(s_wifi_events, WIFI_FAIL_BIT);
            ESP_LOGE(TAG, "WiFi connection failed after %d retries", WIFI_MAX_RETRY);
        }

    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
        s_wifi_retries = 0;
        xEventGroupSetBits(s_wifi_events, WIFI_CONNECTED_BIT);
    }
}

static esp_err_t wifi_init(void)
{
    s_wifi_events = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL));

    wifi_config_t wifi_cfg = {
        .sta = {
            .ssid     = WIFI_SSID,
            .password = WIFI_PASSWORD,
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
        },
    };

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg));
    ESP_ERROR_CHECK(esp_wifi_start());

    // Block until connected or failed
    EventBits_t bits = xEventGroupWaitBits(s_wifi_events,
                                           WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                                           pdFALSE, pdFALSE,
                                           pdMS_TO_TICKS(15000));

    if (bits & WIFI_CONNECTED_BIT) {
        ESP_LOGI(TAG, "WiFi connected");
        return ESP_OK;
    }

    ESP_LOGE(TAG, "WiFi failed");
    return ESP_FAIL;
}

// ── Main application task ─────────────────────────────────────────────────────

static void face_task(void *arg)
{
    // Confirm-frame debounce counter
    int     confirm_streak  = 0;
    int64_t last_unlock_us  = 0;

    ESP_LOGI(TAG, "Face recognition loop started");
    led_set(LED_BLINK_SLOW);

    while (1) {
        led_tick();

        // ── Handle incoming MQTT commands first ───────────────────────────
        mqtt_cmd_t cmd = mqtt_poll_command();

        if (cmd == MQTT_CMD_ENROLL_START) {
            ESP_LOGI(TAG, "Enrollment requested via MQTT");
            esp_err_t err = face_pipeline_start_enrollment();
            if (err != ESP_OK) {
                mqtt_publish_face_result("ENROLL_FULL");
            } else {
                led_set(LED_BLINK_FAST);
            }
        } else if (cmd == MQTT_CMD_ENROLL_CLEAR) {
            enrollments_clear();
            mqtt_publish_enroll_done(0);
            led_set(LED_BLINK_SLOW);
        }
        // ARM / DISARM commands from the website are informational for this
        // device; the keypad MCU owns arm state. We just log them.
        else if (cmd == MQTT_CMD_ARM) {
            ESP_LOGI(TAG, "System armed (notified via MQTT)");
        } else if (cmd == MQTT_CMD_DISARM) {
            ESP_LOGI(TAG, "System disarmed (notified via MQTT)");
        }

        // ── Capture frame ─────────────────────────────────────────────────
        camera_fb_t *fb = camera_capture();
        if (!fb) {
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }

        // ── Enrollment mode ───────────────────────────────────────────────
        if (face_pipeline_enrolling()) {
            bool done = face_pipeline_enroll_frame(fb);
            camera_frame_free(fb);

            if (done) {
                enrollments_save();
                mqtt_publish_enroll_done(enrollments_count());
                led_set(LED_BLINK_SLOW);
            }
            // Small delay between enrollment samples
            vTaskDelay(pdMS_TO_TICKS(200));
            continue;
        }

        // ── Recognition mode ──────────────────────────────────────────────
        int64_t now_us = esp_timer_get_time();
        bool in_cooldown = (now_us - last_unlock_us) < ((int64_t)UNLOCK_COOLDOWN_MS * 1000);

        if (in_cooldown) {
            camera_frame_free(fb);
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }

        int matched_id = -1;
        face_result_t result = face_pipeline_run(fb, &matched_id);
        camera_frame_free(fb);

        switch (result) {
        case FACE_RESULT_NO_FACE:
            confirm_streak = 0;
            // Don't spam MQTT on every empty frame – only publish
            // "NO_FACE" at most once per second via a simple gate.
            {
                static int64_t last_no_face_pub = 0;
                if (now_us - last_no_face_pub > 1000000LL) {
                    mqtt_publish_face_result("NO_FACE");
                    last_no_face_pub = now_us;
                }
            }
            break;

        case FACE_RESULT_UNKNOWN:
            confirm_streak = 0;
            mqtt_publish_face_result("UNKNOWN");
            ESP_LOGI(TAG, "Face detected but not recognised");
            break;

        case FACE_RESULT_RECOGNIZED:
            confirm_streak++;
            ESP_LOGI(TAG, "Recognised (slot %d) – streak %d/%d",
                     matched_id, confirm_streak, FACE_CONFIRM_FRAMES);

            if (confirm_streak >= FACE_CONFIRM_FRAMES) {
                confirm_streak = 0;
                last_unlock_us = now_us;

                // Tell the keypad MCU and the website to disarm
                mqtt_publish_face_result("RECOGNIZED");

                led_set(LED_FLASH_GREEN);
                ESP_LOGI(TAG, "✔ Face unlocked (slot %d)", matched_id);
            }
            break;
        }

        // ~10 fps recognition loop
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────

void app_main(void)
{
    ESP_LOGI(TAG, "ESP32-CAM Face Unlock starting");

    // ── NVS ──────────────────────────────────────────────────────────────
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES ||
        err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS partition wiped");
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    // ── LED ───────────────────────────────────────────────────────────────
    led_init();
    led_set(LED_BLINK_SLOW);

    // ── Camera ───────────────────────────────────────────────────────────
    ESP_ERROR_CHECK(camera_init());

    // ── Face models ───────────────────────────────────────────────────────
    ESP_ERROR_CHECK(face_pipeline_init());

    // ── WiFi ─────────────────────────────────────────────────────────────
    if (wifi_init() != ESP_OK) {
        ESP_LOGE(TAG, "Cannot continue without WiFi");
        return;
    }

    // ── MQTT ─────────────────────────────────────────────────────────────
    ESP_ERROR_CHECK(mqtt_app_init());

    // Wait briefly for MQTT to connect before starting recognition
    int mqtt_wait = 0;
    while (!mqtt_is_connected() && mqtt_wait < 50) {
        vTaskDelay(pdMS_TO_TICKS(100));
        mqtt_wait++;
    }

    // ── Load saved enrollments ────────────────────────────────────────────
    enrollments_load();
    ESP_LOGI(TAG, "%d face(s) enrolled at startup", enrollments_count());

    // ── Launch main task on core 1 (core 0 handles WiFi/MQTT) ────────────
    xTaskCreatePinnedToCore(
        face_task,
        "face_task",
        8192,       // 8 KB stack – face pipeline is stack-hungry
        NULL,
        5,          // priority
        NULL,
        1           // core 1
    );
}
