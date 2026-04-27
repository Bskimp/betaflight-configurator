// Single source of truth for the MSP2_WING_TUNING / MSP2_SET_WING_TUNING
// wire format. Field order is part of the MSP wire contract and must
// match firmware `.plan/WIRE_FORMAT.md`. Append-only: new fields may
// only be added at the end; type change or removal requires a new
// MSP2 code slot (e.g. MSP2_WING_TUNING_V2).
import { enumIndexToString, enumStringToIndex } from "../utils/wingEnumLookups.js";

export const WING_TUNING_SCHEMA = [
    { name: "s_roll", type: "u8" },
    { name: "s_pitch", type: "u8" },
    { name: "s_yaw", type: "u8" },
    { name: "yaw_type", type: "enum", table: "yaw_type" },
    { name: "angle_pitch_offset", type: "i16" },
    { name: "angle_earth_ref", type: "u8" },
    { name: "tpa_mode", type: "enum", table: "tpa_mode" },
    { name: "tpa_speed_type", type: "enum", table: "tpa_speed_type" },
    { name: "tpa_speed_basic_delay", type: "u16" },
    { name: "tpa_speed_basic_gravity", type: "u16" },
    { name: "tpa_speed_max_voltage", type: "u16" },
    { name: "tpa_speed_pitch_offset", type: "i16" },
    { name: "tpa_curve_type", type: "enum", table: "tpa_curve_type" },
    { name: "tpa_curve_stall_throttle", type: "u8" },
    { name: "tpa_curve_pid_thr0", type: "u16" },
    { name: "tpa_curve_pid_thr100", type: "u16" },
    { name: "tpa_curve_expo", type: "i8" },
    { name: "spa_roll_center", type: "u16" },
    { name: "spa_roll_width", type: "u16" },
    { name: "spa_roll_mode", type: "enum", table: "spa_mode" },
    { name: "spa_pitch_center", type: "u16" },
    { name: "spa_pitch_width", type: "u16" },
    { name: "spa_pitch_mode", type: "enum", table: "spa_mode" },
    { name: "spa_yaw_center", type: "u16" },
    { name: "spa_yaw_width", type: "u16" },
    { name: "spa_yaw_mode", type: "enum", table: "spa_mode" },
    // V2 append (yaw_type COMBINED): blend floor + crossover for the
    // airspeed-weighted yaw crossfade. `optional: true` tells decode to
    // treat a V1 (pre-COMBINED) 39-byte payload as having default values
    // rather than crashing on short read.
    { name: "yaw_blend_floor", type: "u8", optional: true, default: 20 },
    { name: "yaw_blend_crossover", type: "u8", optional: true, default: 50 },
];

// Returns true when `data` still has at least `n` bytes unread. Used
// to skip optional (V2-appended) fields if the firmware is V1.
function hasBytes(data, n) {
    // dataview helper exposes buffer + offset; fall back to length-offset
    // arithmetic since the API varies across codebases.
    if (typeof data.remaining === "function") return data.remaining() >= n;
    const len = data.buffer?.byteLength ?? data.data?.length ?? data.length ?? 0;
    const off = data.offset ?? data._offset ?? 0;
    return len - off >= n;
}

export function decodeWingTuning(data) {
    const out = {};
    for (const f of WING_TUNING_SCHEMA) {
        if (f.optional && !hasBytes(data, f.type === "u16" || f.type === "i16" ? 2 : 1)) {
            out[f.name] = f.default;
            continue;
        }
        switch (f.type) {
            case "u8":
                out[f.name] = data.readU8();
                break;
            case "u16":
                out[f.name] = data.readU16();
                break;
            case "i8":
                out[f.name] = data.read8();
                break;
            case "i16":
                out[f.name] = data.read16();
                break;
            case "enum":
                out[f.name] = enumIndexToString(f.table, data.readU8());
                break;
        }
    }
    return out;
}

// Push signed int16/int8 via unsigned mask so negative values serialize
// to the correct two's-complement byte sequence; the Array-based push16
// in injected_methods otherwise emits raw negative values that only get
// masked later at frame-assembly time.
export function crunchWingTuning(buffer, t) {
    for (const f of WING_TUNING_SCHEMA) {
        switch (f.type) {
            case "u8":
                buffer.push8(t[f.name]);
                break;
            case "u16":
                buffer.push16(t[f.name]);
                break;
            case "i8":
                buffer.push8(t[f.name] & 0xff);
                break;
            case "i16":
                buffer.push16(t[f.name] & 0xffff);
                break;
            case "enum":
                buffer.push8(enumStringToIndex(f.table, t[f.name]));
                break;
        }
    }
    return buffer;
}
