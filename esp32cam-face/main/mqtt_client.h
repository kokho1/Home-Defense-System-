#pragma once
#include "esp_err.h"
#include <stdbool.h>

typedef enum {
    MQTT_CMD_NONE,
    MQTT_CMD_ENROLL_START,   // received on face_enroll_trigger
    MQTT_CMD_ENROLL_CLEAR,   // received on face_enroll_trigger with payload "clear"
    MQTT_CMD_ARM,            // received on handle_arm_status_receive with "0"
    MQTT_CMD_DISARM,         // received on handle_arm_status_receive with "1"
} mqtt_cmd_t;

/**
 * Initialise and connect the MQTT client.
 * Subscribes to TOPIC_ENROLL_TRIGGER and TOPIC_ARM_RECEIVE.
 */
esp_err_t mqtt_app_init(void);

/** Publish face recognition result string to TOPIC_FACE_RESULT. */
void mqtt_publish_face_result(const char *result);

/** Publish enrollment-done confirmation to TOPIC_ENROLL_DONE. */
void mqtt_publish_enroll_done(int total_enrolled);

/**
 * Poll for the next pending command from a subscribed topic.
 * Returns MQTT_CMD_NONE when the queue is empty.
 * Non-blocking – safe to call every loop iteration.
 */
mqtt_cmd_t mqtt_poll_command(void);

/** Returns true once the client is connected to the broker. */
bool mqtt_is_connected(void);
