// Single source of truth for the MSP2_WING_GPS_RESCUE /
// MSP2_SET_WING_GPS_RESCUE wire format. Mirrors firmware
// msp_wing_gps_rescue.c byte layout exactly.
//
// 22 bytes total, little-endian. All fields unsigned — no signed
// variants. Field order MUST match the firmware — schema doubles
// as the wire contract.

export const WING_GPS_RESCUE_SCHEMA = [
    { name: "allowArmingWithoutFix", type: "u8" },
    { name: "minSats", type: "u8" },
    { name: "maxBankAngle", type: "u8" },
    { name: "orbitRadiusM", type: "u16" },
    { name: "returnAltitudeM", type: "u16" },
    { name: "minLoiterAltM", type: "u16" },
    { name: "cruiseThrottle", type: "u8" },
    { name: "minThrottle", type: "u8" },
    { name: "abortThrottle", type: "u8" },
    { name: "navP", type: "u8" },
    { name: "altP", type: "u8" },
    { name: "turnCompensation", type: "u8" },
    { name: "minHeadingSpeedCmS", type: "u16" },
    { name: "stallSpeedCmS", type: "u16" },
    { name: "minStartDistM", type: "u16" },
    { name: "sanityChecks", type: "u8" },
];

export function decodeWingGpsRescue(data) {
    const out = {};
    for (const f of WING_GPS_RESCUE_SCHEMA) {
        switch (f.type) {
            case "u8":
                out[f.name] = data.readU8();
                break;
            case "u16":
                out[f.name] = data.readU16();
                break;
        }
    }
    return out;
}

export function crunchWingGpsRescue(buffer, t) {
    for (const f of WING_GPS_RESCUE_SCHEMA) {
        switch (f.type) {
            case "u8":
                buffer.push8(t[f.name]);
                break;
            case "u16":
                buffer.push16(t[f.name]);
                break;
        }
    }
    return buffer;
}
