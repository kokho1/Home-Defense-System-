#include "camera.h"
#include "config.h"
#include "esp_log.h"

static const char *TAG = "camera";

esp_err_t camera_init(void)
{
    camera_config_t cfg = {
        .pin_pwdn     = CAM_PIN_PWDN,
        .pin_reset    = CAM_PIN_RESET,
        .pin_xclk     = CAM_PIN_XCLK,
        .pin_sccb_sda = CAM_PIN_SIOD,
        .pin_sccb_scl = CAM_PIN_SIOC,

        .pin_d7 = CAM_PIN_D7,
        .pin_d6 = CAM_PIN_D6,
        .pin_d5 = CAM_PIN_D5,
        .pin_d4 = CAM_PIN_D4,
        .pin_d3 = CAM_PIN_D3,
        .pin_d2 = CAM_PIN_D2,
        .pin_d1 = CAM_PIN_D1,
        .pin_d0 = CAM_PIN_D0,

        .pin_vsync = CAM_PIN_VSYNC,
        .pin_href  = CAM_PIN_HREF,
        .pin_pclk  = CAM_PIN_PCLK,

        // 20 MHz XCLK works reliably on AI-Thinker with OV2640
        .xclk_freq_hz = 20000000,
        .ledc_timer   = LEDC_TIMER_0,
        .ledc_channel = LEDC_CHANNEL_0,

        // QVGA (320x240) is the sweet spot for esp-who face detection:
        // large enough to detect at ~1 m, small enough for PSRAM budget.
        .pixel_format = PIXFORMAT_RGB565,
        .frame_size   = FRAMESIZE_QVGA,

        // 2 frame buffers in PSRAM prevents stalls during MQTT publish
        .jpeg_quality = 12,
        .fb_count     = 2,
        .fb_location  = CAMERA_FB_IN_PSRAM,
        .grab_mode    = CAMERA_GRAB_WHEN_EMPTY,
    };

    esp_err_t err = esp_camera_init(&cfg);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Camera init failed: %s", esp_err_to_name(err));
        return err;
    }

    // Improve image quality for face recognition
    sensor_t *s = esp_camera_sensor_get();
    if (s) {
        s->set_brightness(s, 1);       // slight brightness boost
        s->set_saturation(s, 0);
        s->set_sharpness(s, 2);
        s->set_denoise(s, 1);
        s->set_whitebal(s, 1);         // auto white balance
        s->set_awb_gain(s, 1);
        s->set_exposure_ctrl(s, 1);    // auto exposure
        s->set_aec2(s, 1);             // advanced auto exposure
        s->set_ae_level(s, 0);
        s->set_gain_ctrl(s, 1);        // auto gain
        s->set_agc_gain(s, 0);
        s->set_gainceiling(s, (gainceiling_t)6);
        s->set_bpc(s, 1);              // black pixel correction
        s->set_wpc(s, 1);              // white pixel correction
        s->set_raw_gma(s, 1);
        s->set_lenc(s, 1);             // lens correction
        s->set_hmirror(s, 0);
        s->set_vflip(s, 0);
        s->set_dcw(s, 1);
    }

    ESP_LOGI(TAG, "Camera ready (QVGA RGB565, 2 PSRAM buffers)");
    return ESP_OK;
}

camera_fb_t *camera_capture(void)
{
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        ESP_LOGE(TAG, "Frame capture failed");
    }
    return fb;
}

void camera_frame_free(camera_fb_t *fb)
{
    if (fb) {
        esp_camera_fb_return(fb);
    }
}
