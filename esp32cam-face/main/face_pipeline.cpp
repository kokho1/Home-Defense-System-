#include "face_pipeline.h"
#include "config.h"
#include "esp_log.h"

// esp-who headers (available after cloning into components/esp-who)
#include "human_face_detect_msr01.hpp"
#include "human_face_recognize_msr01.hpp"

#include <string.h>
#include <math.h>

static const char *TAG = "face_pipeline";

// ── Model instances (C++ objects wrapped behind C linkage) ───────────────────
static HumanFaceDetectMSR01   *s_detector   = NULL;
static HumanFaceRecognizeMSR01 *s_recognizer = NULL;

// ── Enrollment store ─────────────────────────────────────────────────────────
// Each enrollment is a 512-float L2-normalised embedding.
#define FEAT_LEN 512
static float s_enrollments[MAX_FACE_ENROLLMENTS][FEAT_LEN];
static int   s_enroll_count = 0;

// ── Enrollment-in-progress state ─────────────────────────────────────────────
static bool  s_enrolling      = false;
static int   s_enroll_samples = 0;
static float s_enroll_accum[FEAT_LEN];   // running sum

// ── Helpers ──────────────────────────────────────────────────────────────────

static void l2_normalize(float *v, int len)
{
    float sum = 0.0f;
    for (int i = 0; i < len; i++) sum += v[i] * v[i];
    float inv = 1.0f / (sqrtf(sum) + 1e-10f);
    for (int i = 0; i < len; i++) v[i] *= inv;
}

static float cosine_similarity(const float *a, const float *b, int len)
{
    float dot = 0.0f;
    for (int i = 0; i < len; i++) dot += a[i] * b[i];
    return dot;   // vectors are already L2-normalised
}

// ── Public API ───────────────────────────────────────────────────────────────

esp_err_t face_pipeline_init(void)
{
    // score_threshold, nms_threshold, top_k
    s_detector = new HumanFaceDetectMSR01(0.3f, 0.3f, 10, 0.3f);
    if (!s_detector) {
        ESP_LOGE(TAG, "Failed to allocate detector");
        return ESP_ERR_NO_MEM;
    }

    s_recognizer = new HumanFaceRecognizeMSR01();
    if (!s_recognizer) {
        ESP_LOGE(TAG, "Failed to allocate recognizer");
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "Face pipeline ready (threshold=%.2f, confirm=%d frames)",
             FACE_RECOGNITION_THRESHOLD, FACE_CONFIRM_FRAMES);
    return ESP_OK;
}

face_result_t face_pipeline_run(camera_fb_t *fb, int *matched_id)
{
    *matched_id = -1;

    if (!fb || fb->format != PIXFORMAT_RGB565) {
        return FACE_RESULT_NO_FACE;
    }

    // ── Step 1: detection ────────────────────────────────────────────────
    std::list<dl::detect::result_t> det_results =
        s_detector->infer((uint16_t *)fb->buf, {(int)fb->height, (int)fb->width, 3});

    if (det_results.empty()) {
        return FACE_RESULT_NO_FACE;
    }

    // Use the highest-confidence detection only
    auto &best = det_results.front();
    ESP_LOGD(TAG, "Face detected (score=%.2f)", best.score);

    if (s_enroll_count == 0) {
        // No enrollments yet – report unknown so the caller knows a face
        // was seen but there's nothing to match against.
        return FACE_RESULT_UNKNOWN;
    }

    // ── Step 2: feature extraction ───────────────────────────────────────
    float feat[FEAT_LEN];
    s_recognizer->get_feature((uint16_t *)fb->buf,
                              {(int)fb->height, (int)fb->width, 3},
                              best,
                              feat);
    l2_normalize(feat, FEAT_LEN);

    // ── Step 3: nearest-neighbour search ─────────────────────────────────
    float best_sim = -1.0f;
    int   best_idx = -1;

    for (int i = 0; i < s_enroll_count; i++) {
        float sim = cosine_similarity(feat, s_enrollments[i], FEAT_LEN);
        if (sim > best_sim) {
            best_sim = sim;
            best_idx = i;
        }
    }

    ESP_LOGD(TAG, "Best match: slot %d, similarity=%.3f (threshold=%.2f)",
             best_idx, best_sim, FACE_RECOGNITION_THRESHOLD);

    if (best_sim >= FACE_RECOGNITION_THRESHOLD) {
        *matched_id = best_idx;
        return FACE_RESULT_RECOGNIZED;
    }

    return FACE_RESULT_UNKNOWN;
}

esp_err_t face_pipeline_start_enrollment(void)
{
    if (s_enroll_count >= MAX_FACE_ENROLLMENTS) {
        ESP_LOGW(TAG, "Enrollment capacity full (%d/%d)",
                 s_enroll_count, MAX_FACE_ENROLLMENTS);
        return ESP_ERR_NO_MEM;
    }

    memset(s_enroll_accum, 0, sizeof(s_enroll_accum));
    s_enroll_samples = 0;
    s_enrolling      = true;

    ESP_LOGI(TAG, "Enrollment started – need %d samples", ENROLL_SAMPLE_COUNT);
    return ESP_OK;
}

bool face_pipeline_enrolling(void)
{
    return s_enrolling;
}

bool face_pipeline_enroll_frame(camera_fb_t *fb)
{
    if (!s_enrolling || !fb) return false;

    std::list<dl::detect::result_t> det_results =
        s_detector->infer((uint16_t *)fb->buf, {(int)fb->height, (int)fb->width, 3});

    if (det_results.empty()) {
        ESP_LOGD(TAG, "Enrollment frame: no face, skipping");
        return false;
    }

    float feat[FEAT_LEN];
    s_recognizer->get_feature((uint16_t *)fb->buf,
                              {(int)fb->height, (int)fb->width, 3},
                              det_results.front(),
                              feat);

    // Accumulate (will normalise once all samples are collected)
    for (int i = 0; i < FEAT_LEN; i++) {
        s_enroll_accum[i] += feat[i];
    }

    s_enroll_samples++;
    ESP_LOGI(TAG, "Enrollment sample %d/%d", s_enroll_samples, ENROLL_SAMPLE_COUNT);

    if (s_enroll_samples < ENROLL_SAMPLE_COUNT) {
        return false;   // still collecting
    }

    // ── All samples collected: average + normalise ────────────────────────
    for (int i = 0; i < FEAT_LEN; i++) {
        s_enroll_accum[i] /= (float)ENROLL_SAMPLE_COUNT;
    }
    l2_normalize(s_enroll_accum, FEAT_LEN);

    memcpy(s_enrollments[s_enroll_count], s_enroll_accum, sizeof(s_enroll_accum));
    s_enroll_count++;
    s_enrolling = false;

    ESP_LOGI(TAG, "Enrollment complete – %d face(s) stored", s_enroll_count);
    return true;   // done
}

// ── Enrollment management ─────────────────────────────────────────────────────

void face_pipeline_add_enrollment(const float *feat)
{
    if (s_enroll_count >= MAX_FACE_ENROLLMENTS) return;
    memcpy(s_enrollments[s_enroll_count], feat, FEAT_LEN * sizeof(float));
    s_enroll_count++;
}

const float *face_pipeline_get_enrollment(int i)
{
    if (i < 0 || i >= s_enroll_count) return NULL;
    return s_enrollments[i];
}

int face_pipeline_enrollment_count(void)
{
    return s_enroll_count;
}

void face_pipeline_clear_enrollments(void)
{
    s_enroll_count = 0;
    memset(s_enrollments, 0, sizeof(s_enrollments));
    ESP_LOGI(TAG, "Enrollments cleared from memory");
}
