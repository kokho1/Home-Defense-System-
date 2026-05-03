#pragma once

typedef enum {
    LED_OFF,
    LED_ON,
    LED_BLINK_SLOW,   // 1 Hz  – waiting / idle
    LED_BLINK_FAST,   // 5 Hz  – enrolling
    LED_FLASH_GREEN,  // 3 quick flashes – recognized / unlocked
} led_mode_t;

void led_init(void);
void led_set(led_mode_t mode);

/** Call from the main loop tick to drive blink patterns. */
void led_tick(void);
