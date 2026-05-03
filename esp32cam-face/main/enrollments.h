#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

// face_id_t is the integer handle used by esp-who's face recogniser
typedef int16_t face_id_t;

/**
 * Load persisted face enrollments from NVS into the recogniser.
 * Call once at startup, after face_pipeline_init().
 */
esp_err_t enrollments_load(void);

/**
 * Save all current face IDs to NVS so they survive reboot.
 */
esp_err_t enrollments_save(void);

/**
 * Delete all stored enrollments from NVS and clear the recogniser list.
 */
esp_err_t enrollments_clear(void);

/** Returns the number of enrolled faces currently in the recogniser. */
int enrollments_count(void);
