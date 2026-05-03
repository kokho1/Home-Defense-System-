#include "enrollments.h"
#include "face_pipeline.h"
#include "config.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "nvs.h"
#include <string.h>

static const char *TAG        = "enrollments";
static const char *NVS_NS     = "face_ids";
static const char *NVS_COUNT  = "count";
static const char *NVS_KEY_FMT = "id_%d";   // id_0 … id_N

// Face feature vector length from esp-who MobileNet model
#define FACE_FEAT_LEN  512

esp_err_t enrollments_load(void)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NS, NVS_READONLY, &h);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGI(TAG, "No saved enrollments found");
        return ESP_OK;
    }
    if (err != ESP_OK) return err;

    uint8_t count = 0;
    nvs_get_u8(h, NVS_COUNT, &count);
    ESP_LOGI(TAG, "Loading %d enrollment(s) from NVS", count);

    for (int i = 0; i < count && i < MAX_FACE_ENROLLMENTS; i++) {
        char key[16];
        snprintf(key, sizeof(key), NVS_KEY_FMT, i);

        float feat[FACE_FEAT_LEN];
        size_t len = sizeof(feat);
        err = nvs_get_blob(h, key, feat, &len);
        if (err != ESP_OK || len != sizeof(feat)) {
            ESP_LOGW(TAG, "Slot %d: read error or size mismatch, skipping", i);
            continue;
        }

        face_pipeline_add_enrollment(feat);
        ESP_LOGI(TAG, "Loaded enrollment slot %d", i);
    }

    nvs_close(h);
    return ESP_OK;
}

esp_err_t enrollments_save(void)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NS, NVS_READWRITE, &h);
    if (err != ESP_OK) return err;

    int count = face_pipeline_enrollment_count();
    nvs_set_u8(h, NVS_COUNT, (uint8_t)count);

    for (int i = 0; i < count; i++) {
        char key[16];
        snprintf(key, sizeof(key), NVS_KEY_FMT, i);

        const float *feat = face_pipeline_get_enrollment(i);
        if (!feat) continue;

        err = nvs_set_blob(h, key, feat, FACE_FEAT_LEN * sizeof(float));
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "Slot %d: write error %s", i, esp_err_to_name(err));
        }
    }

    err = nvs_commit(h);
    nvs_close(h);
    ESP_LOGI(TAG, "Saved %d enrollment(s) to NVS", count);
    return err;
}

esp_err_t enrollments_clear(void)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NS, NVS_READWRITE, &h);
    if (err != ESP_OK) return err;

    nvs_erase_all(h);
    nvs_commit(h);
    nvs_close(h);

    face_pipeline_clear_enrollments();
    ESP_LOGI(TAG, "All enrollments cleared");
    return ESP_OK;
}

int enrollments_count(void)
{
    return face_pipeline_enrollment_count();
}
