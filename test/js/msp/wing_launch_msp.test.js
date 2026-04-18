// Cross-repo wire contract test for MSP2_WING_LAUNCH.
//
// Shares the 15-byte golden vector with the firmware unit test
// src/test/unit/wing_launch_msp_unittest.cc. Any field reorder or
// signed/unsigned flip on either side fails both tests in sync.

import { describe, it, expect } from "vitest";
import "../../../src/js/injected_methods";
import { decodeWingLaunch, crunchWingLaunch, WING_LAUNCH_SCHEMA } from "../../../src/js/msp/wingLaunchSchema.js";

// 15-byte golden — matches firmware wing_launch_msp_unittest.cc verbatim.
// Canonical values include wing_launch_climb_angle = -15 to catch
// readU16 vs read16 regressions.
const WING_LAUNCH_GOLDEN = new Uint8Array([
    0x19, // wing_launch_accel_thresh = 25
    0x64,
    0x00, // wing_launch_motor_delay = 100
    0xf4,
    0x01, // wing_launch_motor_ramp = 500
    0x4b, // wing_launch_throttle = 75
    0xb8,
    0x0b, // wing_launch_climb_time = 3000
    0xf1,
    0xff, // wing_launch_climb_angle = -15 (signed int16)
    0xe8,
    0x03, // wing_launch_transition = 1000
    0x2d, // wing_launch_max_tilt = 45
    0x00, // wing_launch_idle_thr = 0
    0x14, // wing_launch_stick_override = 20
]);

const WING_LAUNCH_CANONICAL = {
    wing_launch_accel_thresh: 25,
    wing_launch_motor_delay: 100,
    wing_launch_motor_ramp: 500,
    wing_launch_throttle: 75,
    wing_launch_climb_time: 3000,
    wing_launch_climb_angle: -15,
    wing_launch_transition: 1000,
    wing_launch_max_tilt: 45,
    wing_launch_idle_thr: 0,
    wing_launch_stick_override: 20,
};

function makeDataView(uint8Array) {
    const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    view.offset = 0;
    return view;
}

// push16/push8 may emit negative raw values via injected_methods' Array
// path; normalise to unsigned bytes so the golden comparison is
// byte-for-byte clean (same coercion MSP.send_message applies).
function crunchToUnsignedBytes(t) {
    return crunchWingLaunch([], t).map((b) => b & 0xff);
}

describe("WING_LAUNCH_SCHEMA", () => {
    it("has the expected 10 fields in firmware order", () => {
        expect(WING_LAUNCH_SCHEMA.map((f) => f.name)).toEqual([
            "wing_launch_accel_thresh",
            "wing_launch_motor_delay",
            "wing_launch_motor_ramp",
            "wing_launch_throttle",
            "wing_launch_climb_time",
            "wing_launch_climb_angle",
            "wing_launch_transition",
            "wing_launch_max_tilt",
            "wing_launch_idle_thr",
            "wing_launch_stick_override",
        ]);
    });

    it("wing_launch_climb_angle is signed (i16)", () => {
        const angleField = WING_LAUNCH_SCHEMA.find((f) => f.name === "wing_launch_climb_angle");
        expect(angleField.type).toBe("i16");
    });
});

describe("MSP2_WING_LAUNCH golden vector", () => {
    it("decodes the 15-byte golden to canonical values", () => {
        const view = makeDataView(WING_LAUNCH_GOLDEN);
        const decoded = decodeWingLaunch(view);
        expect(decoded).toEqual(WING_LAUNCH_CANONICAL);
    });

    it("crunches canonical values back to the golden bytes", () => {
        const bytes = crunchToUnsignedBytes(WING_LAUNCH_CANONICAL);
        expect(new Uint8Array(bytes)).toEqual(WING_LAUNCH_GOLDEN);
    });

    it("payload is exactly 15 bytes", () => {
        expect(WING_LAUNCH_GOLDEN.byteLength).toBe(15);
        expect(crunchToUnsignedBytes(WING_LAUNCH_CANONICAL).length).toBe(15);
    });

    it("preserves negative wing_launch_climb_angle on round-trip", () => {
        const view = makeDataView(WING_LAUNCH_GOLDEN);
        const decoded = decodeWingLaunch(view);
        expect(decoded.wing_launch_climb_angle).toBe(-15);

        // And round-trip a different negative to catch off-by-one:
        const weirdAngle = { ...WING_LAUNCH_CANONICAL, wing_launch_climb_angle: -1 };
        const weirdBytes = crunchToUnsignedBytes(weirdAngle);
        const weirdView = makeDataView(new Uint8Array(weirdBytes));
        const weirdDecoded = decodeWingLaunch(weirdView);
        expect(weirdDecoded.wing_launch_climb_angle).toBe(-1);
    });
});
