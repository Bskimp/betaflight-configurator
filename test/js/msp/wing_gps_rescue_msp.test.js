// Cross-repo wire contract test for MSP2_WING_GPS_RESCUE.
//
// Shares the 22-byte golden vector with the firmware unit test
// src/test/unit/wing_gps_rescue_msp_unittest.cc. Any field reorder
// or size flip on either side fails both suites in sync.

import { describe, it, expect } from "vitest";
import "../../../src/js/injected_methods";
import {
    decodeWingGpsRescue,
    crunchWingGpsRescue,
    WING_GPS_RESCUE_SCHEMA,
} from "../../../src/js/msp/wingGpsRescueSchema.js";

// 22-byte golden — matches firmware wing_gps_rescue_msp_unittest.cc.
// All fields unsigned; canonical values mirror pg/gps_rescue_wing.c
// PG_RESET_TEMPLATE defaults.
const WING_GPS_RESCUE_GOLDEN = new Uint8Array([
    0x00, // allowArmingWithoutFix = 0
    0x08, // minSats = 8
    0x19, // maxBankAngle = 25
    0x32,
    0x00, // orbitRadiusM = 50
    0x32,
    0x00, // returnAltitudeM = 50
    0x19,
    0x00, // minLoiterAltM = 25
    0x32, // cruiseThrottle = 50
    0x1e, // minThrottle = 30
    0x2d, // abortThrottle = 45
    0x1e, // navP = 30
    0x1e, // altP = 30
    0x32, // turnCompensation = 50
    0x90,
    0x01, // minHeadingSpeedCmS = 400
    0xc8,
    0x00, // stallSpeedCmS = 200
    0x1e,
    0x00, // minStartDistM = 30
    0x01, // sanityChecks = 1
]);

const WING_GPS_RESCUE_CANONICAL = {
    allowArmingWithoutFix: 0,
    minSats: 8,
    maxBankAngle: 25,
    orbitRadiusM: 50,
    returnAltitudeM: 50,
    minLoiterAltM: 25,
    cruiseThrottle: 50,
    minThrottle: 30,
    abortThrottle: 45,
    navP: 30,
    altP: 30,
    turnCompensation: 50,
    minHeadingSpeedCmS: 400,
    stallSpeedCmS: 200,
    minStartDistM: 30,
    sanityChecks: 1,
};

function makeDataView(uint8Array) {
    const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    view.offset = 0;
    return view;
}

// push16/push8 may emit negative raw values via injected_methods' Array
// path; normalise to unsigned bytes so the golden comparison is
// byte-for-byte clean (same coercion MSP.send_message applies). Not
// strictly needed here — all fields are unsigned — but matches the
// wing_launch test so the helpers stay interchangeable.
function crunchToUnsignedBytes(t) {
    return crunchWingGpsRescue([], t).map((b) => b & 0xff);
}

describe("WING_GPS_RESCUE_SCHEMA", () => {
    it("has the expected 16 fields in firmware order", () => {
        expect(WING_GPS_RESCUE_SCHEMA.map((f) => f.name)).toEqual([
            "allowArmingWithoutFix",
            "minSats",
            "maxBankAngle",
            "orbitRadiusM",
            "returnAltitudeM",
            "minLoiterAltM",
            "cruiseThrottle",
            "minThrottle",
            "abortThrottle",
            "navP",
            "altP",
            "turnCompensation",
            "minHeadingSpeedCmS",
            "stallSpeedCmS",
            "minStartDistM",
            "sanityChecks",
        ]);
    });

    it("has no signed fields", () => {
        for (const f of WING_GPS_RESCUE_SCHEMA) {
            expect(f.type).not.toBe("i16");
            expect(f.type).not.toBe("i8");
        }
    });
});

describe("MSP2_WING_GPS_RESCUE golden vector", () => {
    it("decodes the 22-byte golden to canonical values", () => {
        const view = makeDataView(WING_GPS_RESCUE_GOLDEN);
        const decoded = decodeWingGpsRescue(view);
        expect(decoded).toEqual(WING_GPS_RESCUE_CANONICAL);
    });

    it("crunches canonical values back to the golden bytes", () => {
        const bytes = crunchToUnsignedBytes(WING_GPS_RESCUE_CANONICAL);
        expect(new Uint8Array(bytes)).toEqual(WING_GPS_RESCUE_GOLDEN);
    });

    it("payload is exactly 22 bytes", () => {
        expect(WING_GPS_RESCUE_GOLDEN.byteLength).toBe(22);
        expect(crunchToUnsignedBytes(WING_GPS_RESCUE_CANONICAL).length).toBe(22);
    });

    it("u16 fields round-trip full range values", () => {
        // Pick values that exercise both u16 bytes to catch any byte-swap
        // or truncation bug. 0x0BB8 = 3000; 0x3E7 = 999.
        const stress = {
            ...WING_GPS_RESCUE_CANONICAL,
            orbitRadiusM: 3000,
            returnAltitudeM: 999,
            minHeadingSpeedCmS: 1999,
            stallSpeedCmS: 1500,
            minStartDistM: 501,
        };
        const bytes = crunchToUnsignedBytes(stress);
        const view = makeDataView(new Uint8Array(bytes));
        const decoded = decodeWingGpsRescue(view);
        expect(decoded).toEqual(stress);
    });
});
