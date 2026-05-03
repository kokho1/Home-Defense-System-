#pragma once
#include "esp_camera.h"
#include "esp_err.h"

/**
 * Initialise the OV2640 camera.
 * Must be called once before any capture.
 * Returns ESP_OK on success.
 */
esp_err_t camera_init(void);

/**
 * Capture one frame.
 * Caller MUST call camera_frame_free() when done.
 * Returns NULL on failure.
 */
camera_fb_t *camera_capture(void);

/** Return a frame buffer to the driver. */
void camera_frame_free(camera_fb_t *fb);
