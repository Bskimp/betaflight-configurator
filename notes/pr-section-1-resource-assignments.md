# Section 1 Draft: Servo Resource Assignments

## Summary

Adds configurator support for Betaflight's motor/servo resource MSP2 endpoints and exposes a Servo tab resource assignment panel for MOTOR and SERVO pins.

## Changes

- Add `MSP2_MOTOR_SERVO_RESOURCE` and `MSP2_SET_MOTOR_SERVO_RESOURCE` handling.
- Track motor and servo resource assignments in FC state.
- Parse and write motor/servo resource payloads, including malformed payload protection.
- Add generic Servo tab resource dropdowns for MOTOR/SERVO resources.
- Reuse timer-aware candidate ranking when hardware analysis is available.
- Fall back to stable current/resource pins when timer analysis is unavailable.

## Screenshots

- Add Servo tab screenshot showing the Resource Assignments panel.
- Add dropdown screenshot showing timer-aware candidate labels.

## Test Plan

- MSP resource parsing, write payloads, and malformed payload handling.
- Pin/ioTag conversion.
- Generic fallback candidates.
- Timer-aware candidate ranking.
- Existing wing analyzer and recommender tests.

## Upstream Risk Notes

- UI stays generic: wing intelligence only improves candidate ordering and labels.
- Resource assignment remains separate from servo mixer rules.
- Firmware support is feature-detected through MSP availability and fallback state.
