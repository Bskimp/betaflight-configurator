import { describe, it, expect } from "vitest";
import {
    buildEndpointSlots,
    buildEndpointStops,
    clampPwm,
    adjustEndpoint,
    computeEndpointChanges,
    slotForServoN,
    END_MIN,
    END_MAX,
    PWM_FLOOR,
    PWM_CEIL,
} from "../../../src/js/utils/wingEndpoints";

// Standard plane: 4 surfaces. Servo N maps to slot N+1 (BF convention).
const STANDARD_AIRFRAME = [
    { servoN: 1, label: "Elevator" },
    { servoN: 2, label: "Aileron L" },
    { servoN: 3, label: "Aileron R" },
    { servoN: 4, label: "Rudder" },
];

// Synthetic FC.SERVO_CONFIG — slots 0 and 1 are reserved (non-servo
// smix channels), so real servo data starts at slot 2.
function makeConfigs() {
    return [
        { min: 1000, max: 2000 }, // slot 0 (reserved)
        { min: 1000, max: 2000 }, // slot 1 (reserved)
        { min: 1000, max: 2000 }, // slot 2 → SERVO 1 (Elevator)
        { min: 1100, max: 1900 }, // slot 3 → SERVO 2 (Aileron L)
        { min: 1050, max: 1950 }, // slot 4 → SERVO 3 (Aileron R)
        { min: 1200, max: 1800 }, // slot 5 → SERVO 4 (Rudder)
        { min: 1000, max: 2000 }, // slot 6 (unused on this plane)
        { min: 1000, max: 2000 }, // slot 7 (unused)
    ];
}

describe("slotForServoN", () => {
    it("maps silkscreen servo N to FC.SERVO_CONFIG slot", () => {
        expect(slotForServoN(1)).toBe(2);
        expect(slotForServoN(4)).toBe(5);
    });
});

describe("buildEndpointSlots", () => {
    it("snapshots current min/max per surface", () => {
        const slots = buildEndpointSlots(STANDARD_AIRFRAME, makeConfigs());
        expect(slots).toHaveLength(4);
        expect(slots[0]).toMatchObject({ min: 1000, max: 2000, origMin: 1000, origMax: 2000 });
        expect(slots[3]).toMatchObject({ min: 1200, max: 1800, origMin: 1200, origMax: 1800 });
    });

    it("skips surfaces whose slot is missing from configs", () => {
        const sparseConfigs = [
            { min: 1000, max: 2000 },
            { min: 1000, max: 2000 },
            { min: 1000, max: 2000 },
        ];
        const slots = buildEndpointSlots(STANDARD_AIRFRAME, sparseConfigs);
        // Only SERVO 1 (slot 2) has a config; the rest are dropped.
        expect(slots).toHaveLength(1);
        expect(slots[0].surface.label).toBe("Elevator");
    });
});

describe("buildEndpointStops", () => {
    it("walks MIN then MAX per surface in airframe order", () => {
        const slots = buildEndpointSlots(STANDARD_AIRFRAME, makeConfigs());
        const stops = buildEndpointStops(slots);
        expect(stops).toHaveLength(8); // 4 surfaces × 2 ends
        expect(stops[0]).toEqual({ slotIdx: 0, end: END_MIN });
        expect(stops[1]).toEqual({ slotIdx: 0, end: END_MAX });
        expect(stops[2]).toEqual({ slotIdx: 1, end: END_MIN });
        expect(stops[7]).toEqual({ slotIdx: 3, end: END_MAX });
    });
});

describe("clampPwm", () => {
    it("clamps below floor", () => {
        expect(clampPwm(500)).toBe(PWM_FLOOR);
    });
    it("clamps above ceiling", () => {
        expect(clampPwm(2500)).toBe(PWM_CEIL);
    });
    it("passes through values in range", () => {
        expect(clampPwm(1500)).toBe(1500);
        expect(clampPwm(PWM_FLOOR)).toBe(PWM_FLOOR);
        expect(clampPwm(PWM_CEIL)).toBe(PWM_CEIL);
    });
});

describe("adjustEndpoint", () => {
    it("nudges by delta", () => {
        expect(adjustEndpoint(1500, 1)).toBe(1501);
        expect(adjustEndpoint(1500, -10)).toBe(1490);
    });
    it("clamps positive overflow", () => {
        expect(adjustEndpoint(1995, 10)).toBe(PWM_CEIL);
    });
    it("clamps negative overflow", () => {
        expect(adjustEndpoint(1005, -10)).toBe(PWM_FLOOR);
    });
});

describe("computeEndpointChanges", () => {
    it("emits no entries when nothing changed", () => {
        const slots = buildEndpointSlots(STANDARD_AIRFRAME, makeConfigs());
        expect(computeEndpointChanges(slots)).toEqual([]);
    });

    it("emits only modified surfaces", () => {
        const slots = buildEndpointSlots(STANDARD_AIRFRAME, makeConfigs());
        // Tighten elevator min, expand rudder max.
        slots[0].min = 1100;
        slots[3].max = 1850;
        const changes = computeEndpointChanges(slots);
        expect(changes).toHaveLength(2);
        expect(changes[0]).toEqual({
            servoN: 1,
            label: "Elevator",
            oldMin: 1000,
            oldMax: 2000,
            newMin: 1100,
            newMax: 2000,
        });
        expect(changes[1]).toMatchObject({ servoN: 4, oldMax: 1800, newMax: 1850 });
    });

    it("reflects either-end change as a full row", () => {
        const slots = buildEndpointSlots(STANDARD_AIRFRAME, makeConfigs());
        slots[1].max = 1850;
        const changes = computeEndpointChanges(slots);
        // Min unchanged but max moved → full diff row emitted.
        expect(changes).toHaveLength(1);
        expect(changes[0]).toMatchObject({ oldMin: 1100, newMin: 1100, oldMax: 1900, newMax: 1850 });
    });
});
