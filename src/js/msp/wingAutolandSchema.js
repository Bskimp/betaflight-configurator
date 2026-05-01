// Single source of truth for the MSP2_WING_AUTOLAND /
// MSP2_SET_WING_AUTOLAND wire format. Mirrors firmware
// msp_wing_autoland.c byte layout exactly.
//
// 32 bytes total (V2; V1 was 31 bytes, V2 appended stickCancelThreshold
// after the disengage redesign). Little-endian. All fields unsigned.
// Field order MUST match the firmware — schema doubles as the wire
// contract. Append-only: never reorder existing entries.

export const WING_AUTOLAND_SCHEMA = [
    // Master + per-trigger gating
    { name: "enabled", type: "u8" },
    { name: "triggerManual", type: "u8" },
    { name: "triggerRthTimeout", type: "u8" },
    { name: "triggerLowBatt", type: "u8" },
    { name: "triggerFailsafe", type: "u8" },

    // Timing
    { name: "loiterTimeoutS", type: "u16" },
    { name: "orbitsBeforeDescent", type: "u8" },

    // Approach pattern geometry
    { name: "approachAltitudeM", type: "u16" },
    { name: "downwindDistanceM", type: "u16" },
    { name: "baseRadiusM", type: "u16" },
    { name: "finalDistanceM", type: "u16" },
    { name: "commitAltitudeCm", type: "u16" },

    // Glide / flare
    { name: "glidePitchDeg", type: "u8" },
    { name: "throttleCutAltCm", type: "u16" },
    { name: "cruiseThrottlePct", type: "u8" },
    { name: "flareStartAltCm", type: "u16" },
    { name: "flarePitchDeg", type: "u8" },

    // Touchdown / post-land
    { name: "touchdownAccelThreshold", type: "u8" },
    { name: "touchdownAltThresholdCm", type: "u16" },
    { name: "touchdownQuiescenceMs", type: "u16" },
    { name: "minPatternSats", type: "u8" },

    // Pilot override (V2 append after first-flight disengage redesign)
    { name: "stickCancelThreshold", type: "u8" },
];

export function decodeWingAutoland(data) {
    const out = {};
    for (const f of WING_AUTOLAND_SCHEMA) {
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

export function crunchWingAutoland(buffer, t) {
    for (const f of WING_AUTOLAND_SCHEMA) {
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
