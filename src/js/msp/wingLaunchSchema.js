// Single source of truth for the MSP2_WING_LAUNCH / MSP2_SET_WING_LAUNCH
// wire format. Mirrors firmware msp_wing_launch.c byte layout exactly.
//
// 15 bytes total, little-endian. wing_launch_climb_angle is signed int16;
// everything else is unsigned. Field order MUST match the firmware —
// schema doubles as the wire contract.

export const WING_LAUNCH_SCHEMA = [
    { name: "wing_launch_accel_thresh", type: "u8" },
    { name: "wing_launch_motor_delay", type: "u16" },
    { name: "wing_launch_motor_ramp", type: "u16" },
    { name: "wing_launch_throttle", type: "u8" },
    { name: "wing_launch_climb_time", type: "u16" },
    { name: "wing_launch_climb_angle", type: "i16" },
    { name: "wing_launch_transition", type: "u16" },
    { name: "wing_launch_max_tilt", type: "u8" },
    { name: "wing_launch_idle_thr", type: "u8" },
    { name: "wing_launch_stick_override", type: "u8" },
];

export function decodeWingLaunch(data) {
    const out = {};
    for (const f of WING_LAUNCH_SCHEMA) {
        switch (f.type) {
            case "u8":
                out[f.name] = data.readU8();
                break;
            case "u16":
                out[f.name] = data.readU16();
                break;
            case "i16":
                out[f.name] = data.read16();
                break;
        }
    }
    return out;
}

// int16 masked to 0xFFFF before push16 so negative values serialize to
// the correct two's-complement byte sequence (matches the masking
// pattern in wingTuningSchema.js).
export function crunchWingLaunch(buffer, t) {
    for (const f of WING_LAUNCH_SCHEMA) {
        switch (f.type) {
            case "u8":
                buffer.push8(t[f.name]);
                break;
            case "u16":
                buffer.push16(t[f.name]);
                break;
            case "i16":
                buffer.push16(t[f.name] & 0xffff);
                break;
        }
    }
    return buffer;
}
