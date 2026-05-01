// Pure endpoint-walking derivation for the Plane Setup Wizard's
// Endpoints step. Given the airframe's surfaces + current FC servo
// configs, builds per-(surface, end) walker slots, lets the user
// nudge values via ±1/±10 µs steppers, and emits a commit plan of
// changed (min, max) tuples on review.
//
// Each commit is MSP_SET_SERVO_CONFIGURATION + EEPROM_WRITE — runtime
// effective, no reboot needed (same as Direction's smix flips).
//
// SLOT convention: FC.SERVO_CONFIG is indexed by smix slot. Slot for
// silkscreen SERVO N = servoN + 1 (matches Direction step).
//
// Pure function — no MSP, no Vue, no I/O. Fully unit-testable.

export const END_MIN = "min";
export const END_MAX = "max";

// Safe PWM range. Matches `sendServoOverride`'s clamp so a Hold press
// during the walk never throws on out-of-range pwm — wizard can drive
// the same value it stages for commit. Pilots who need asymmetric
// throw past 1000/2000 can still set it manually in the Servos tab.
export const PWM_FLOOR = 1000;
export const PWM_CEIL = 2000;

// Slot index into FC.SERVO_CONFIG for a given silkscreen servo N.
// Slots 0-1 are reserved for non-servo smix channels by BF convention.
export function slotForServoN(servoN) {
    return servoN + 1;
}

// Build per-surface endpoint state from FC.SERVO_CONFIG.
// Returns: [{surface, min, max, origMin, origMax}, ...]
//   surface: airframe surface descriptor (has servoN, label, ...)
//   min/max: live working values (mutated by user as they step)
//   origMin/origMax: snapshot for diff detection on commit
export function buildEndpointSlots(airframeSurfaces, servoConfigs) {
    const slots = [];
    for (const surface of airframeSurfaces) {
        const cfg = servoConfigs[slotForServoN(surface.servoN)];
        if (!cfg) continue;
        slots.push({
            surface,
            min: cfg.min,
            max: cfg.max,
            origMin: cfg.min,
            origMax: cfg.max,
        });
    }
    return slots;
}

// Build the flat walker step list — one stop per (surface, end).
// Order: surface 1 MIN, surface 1 MAX, surface 2 MIN, surface 2 MAX, …
// Walking MIN-then-MAX per surface (rather than all MINs then all MAXs)
// lets the pilot finish each control surface before moving to the next.
export function buildEndpointStops(slots) {
    const stops = [];
    for (let i = 0; i < slots.length; i += 1) {
        stops.push({ slotIdx: i, end: END_MIN });
        stops.push({ slotIdx: i, end: END_MAX });
    }
    return stops;
}

// Clamp a candidate PWM value to the safe range.
export function clampPwm(value) {
    if (value < PWM_FLOOR) return PWM_FLOOR;
    if (value > PWM_CEIL) return PWM_CEIL;
    return value;
}

// Apply a delta to an existing endpoint value, clamped.
export function adjustEndpoint(value, delta) {
    return clampPwm(value + delta);
}

// Compute commit plan from final slot state. Only emits entries for
// surfaces whose min OR max changed from their original.
export function computeEndpointChanges(slots) {
    const changes = [];
    for (const s of slots) {
        if (s.min === s.origMin && s.max === s.origMax) continue;
        changes.push({
            servoN: s.surface.servoN,
            label: s.surface.label,
            oldMin: s.origMin,
            oldMax: s.origMax,
            newMin: s.min,
            newMax: s.max,
        });
    }
    return changes;
}
