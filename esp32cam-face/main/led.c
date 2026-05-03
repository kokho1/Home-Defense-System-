#include "led.h"
#include "config.h"
#include "driver/gpio.h"
#include "esp_timer.h"

static led_mode_t s_mode      = LED_OFF;
static int        s_flash_cnt = 0;

static void raw_set(int on)
{
#if LED_ACTIVE_LOW
    gpio_set_level(LED_PIN, on ? 0 : 1);
#else
    gpio_set_level(LED_PIN, on ? 1 : 0);
#endif
}

void led_init(void)
{
    gpio_config_t cfg = {
        .pin_bit_mask = (1ULL << LED_PIN),
        .mode         = GPIO_MODE_OUTPUT,
        .pull_up_en   = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type    = GPIO_INTR_DISABLE,
    };
    gpio_config(&cfg);
    raw_set(0);
}

void led_set(led_mode_t mode)
{
    s_mode      = mode;
    s_flash_cnt = 0;

    if (mode == LED_OFF)  raw_set(0);
    if (mode == LED_ON)   raw_set(1);
    if (mode == LED_FLASH_GREEN) { raw_set(1); }
}

void led_tick(void)
{
    static int64_t last_us = 0;
    static int     state   = 0;

    int64_t now = esp_timer_get_time();

    switch (s_mode) {
    case LED_BLINK_SLOW:
        if (now - last_us > 500000) {   // 0.5 s
            state = !state;
            raw_set(state);
            last_us = now;
        }
        break;

    case LED_BLINK_FAST:
        if (now - last_us > 100000) {   // 100 ms
            state = !state;
            raw_set(state);
            last_us = now;
        }
        break;

    case LED_FLASH_GREEN:
        // 3 quick flashes then go back to slow blink
        if (now - last_us > 120000) {
            raw_set(s_flash_cnt % 2 == 0 ? 1 : 0);
            s_flash_cnt++;
            last_us = now;
            if (s_flash_cnt >= 6) {
                led_set(LED_BLINK_SLOW);
            }
        }
        break;

    default:
        break;
    }
}
