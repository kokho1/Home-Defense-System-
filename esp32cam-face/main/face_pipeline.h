#pragma once
#include "esp_err.h"
#include "esp_camera.h"
#include <stdbool.h>

typedef enum {
    FACE_RESULT_NO_FACE,      // No face detected in frame
    FACE_RESULT_UNKNOWN,      // Face detected but not recognised
    FACE_RESULT_RECOGNIZED,   // Face detected and matched an enrollment
} face_result_t;

/**
 * Initialise the esp-who face detection + recognition models.
 * Must be called after camera_init() and before any other face_pipeline call.
 */
esp_err_t face_pipeline_init(void);

/**
 * Run detection + recognition on a single RGB565 frame.
 * Returns FACE_RESULT_* and writes the matched enrollment index into
 * *matched_id (-1 when not recognised).
 *
 * This function is synchronous and takes ~150–300 ms on ESP32 at 240 MHz.
 */
face_result_t face_pipeline_run(camera_fb_t *fb, int *matched_id);

/**
 * Start an enrollment sequence. The pipeline will average ENROLL_SAMPLE_COUNT
 * frames of the subject's face, then store the resulting embedding.
 * Returns ESP_OK if enrollment started, ESP_ERR_NO_MEM if at capacity.
 */
esp_err_t face_pipeline_start_enrollment(void);

/** Returns true while an enrollment sequence is in progress. */
bool face_pipeline_enrolling(void);

/**
 * Feed one frame into an active enrollment sequence.
 * Returns true when the sequence is complete (all samples collected).
 * Caller should then call enrollments_save().
 */
bool face_pipeline_enroll_frame(camera_fb_t *fb);

// ── Enrollment management (used by enrollments.c) ────────────────────────────

/** Add a pre-loaded embedding (called during NVS restore). */
void face_pipeline_add_enrollment(const float *feat);

/** Return the embedding for slot i, or NULL if out of range. */
const float *face_pipeline_get_enrollment(int i);

/** Return the number of enrolled faces. */
int face_pipeline_enrollment_count(void);

/** Remove all enrolled faces from memory. */
void face_pipeline_clear_enrollments(void);
