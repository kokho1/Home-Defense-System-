#include "mqtt_client.h"
#include "config.h"
#include "esp_log.h"
#include "mqtt_client.h"   // IDF's own esp-mqtt header
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include <string.h>

// Disambiguate our header from IDF's esp_mqtt_client.h
// (IDF header is included via the component; our functions are declared above)

static const char *TAG = "mqtt";

static esp_mqtt_client_handle_t s_client  = NULL;
static QueueHandle_t            s_cmd_q   = NULL;
static volatile bool            s_connected = false;

// ── Event handler ─────────────────────────────────────────────────────────────

static void mqtt_event_handler(void *arg,
                                esp_event_base_t base,
                                int32_t event_id,
                                void *event_data)
{
    esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;

    switch (event->event_id) {

    case MQTT_EVENT_CONNECTED:
        s_connected = true;
        ESP_LOGI(TAG, "Connected to broker");

        esp_mqtt_client_subscribe(s_client, TOPIC_ENROLL_TRIGGER, 0);
        esp_mqtt_client_subscribe(s_client, TOPIC_ARM_RECEIVE,    0);

        ESP_LOGI(TAG, "Subscribed to %s, %s",
                 TOPIC_ENROLL_TRIGGER, TOPIC_ARM_RECEIVE);
        break;

    case MQTT_EVENT_DISCONNECTED:
        s_connected = false;
        ESP_LOGW(TAG, "Disconnected – will auto-reconnect");
        break;

    case MQTT_EVENT_DATA: {
        // Null-terminate topic and payload for safe string comparison
        char topic[64]   = {0};
        char payload[64] = {0};

        int tlen = event->topic_len   < (int)sizeof(topic)   - 1
                   ? event->topic_len   : (int)sizeof(topic)   - 1;
        int plen = event->data_len    < (int)sizeof(payload)  - 1
                   ? event->data_len    : (int)sizeof(payload)  - 1;

        memcpy(topic,   event->topic, tlen);
        memcpy(payload, event->data,  plen);

        ESP_LOGI(TAG, "MSG [%s] → \"%s\"", topic, payload);

        mqtt_cmd_t cmd = MQTT_CMD_NONE;

        if (strcmp(topic, TOPIC_ENROLL_TRIGGER) == 0) {
            if (strcmp(payload, "clear") == 0) {
                cmd = MQTT_CMD_ENROLL_CLEAR;
            } else {
                cmd = MQTT_CMD_ENROLL_START;
            }
        } else if (strcmp(topic, TOPIC_ARM_RECEIVE) == 0) {
            if (strcmp(payload, "1") == 0) {
                cmd = MQTT_CMD_DISARM;
            } else if (strcmp(payload, "0") == 0) {
                cmd = MQTT_CMD_ARM;
            }
        }

        if (cmd != MQTT_CMD_NONE) {
            xQueueSendToBack(s_cmd_q, &cmd, 0);
        }
        break;
    }

    case MQTT_EVENT_ERROR:
        ESP_LOGE(TAG, "MQTT error");
        break;

    default:
        break;
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

esp_err_t mqtt_app_init(void)
{
    s_cmd_q = xQueueCreate(8, sizeof(mqtt_cmd_t));
    if (!s_cmd_q) return ESP_ERR_NO_MEM;

    esp_mqtt_client_config_t cfg = {
        .broker.address.uri = MQTT_BROKER_URI,
        .credentials.client_id = MQTT_CLIENT_ID,
    };

    s_client = esp_mqtt_client_init(&cfg);
    if (!s_client) return ESP_FAIL;

    esp_mqtt_client_register_event(s_client,
                                   ESP_EVENT_ANY_ID,
                                   mqtt_event_handler,
                                   NULL);
    return esp_mqtt_client_start(s_client);
}

void mqtt_publish_face_result(const char *result)
{
    if (!s_connected || !result) return;
    esp_mqtt_client_publish(s_client, TOPIC_FACE_RESULT, result, 0, 0, 0);
    ESP_LOGI(TAG, "Published [%s] → \"%s\"", TOPIC_FACE_RESULT, result);
}

void mqtt_publish_enroll_done(int total_enrolled)
{
    if (!s_connected) return;
    char buf[16];
    snprintf(buf, sizeof(buf), "%d", total_enrolled);
    esp_mqtt_client_publish(s_client, TOPIC_ENROLL_DONE, buf, 0, 0, 0);
    ESP_LOGI(TAG, "Published [%s] → \"%s\"", TOPIC_ENROLL_DONE, buf);
}

mqtt_cmd_t mqtt_poll_command(void)
{
    mqtt_cmd_t cmd = MQTT_CMD_NONE;
    xQueueReceive(s_cmd_q, &cmd, 0);
    return cmd;
}

bool mqtt_is_connected(void)
{
    return s_connected;
}
