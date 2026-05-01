// Plane-specific default values not covered by MSP writes — must go
// through CLI `set ...` lines. Sourced from Betaflight discussion
// #14032 (limonspb's wing tuning draft for BF 4.6).
//
// These are universal plane defaults: they apply to every preset and
// every airframe. They run on every preset Apply (wizard or manual
// mixer Save), prepended to the existing mmix/resource CLI batch and
// after the auto-clean prefix from wingReset.js.
//
// Why these specifically:
//   anti_gravity_gain=0  — quad-only feature; off for planes
//   iterm_relax_cutoff=5 — plane-friendly response to quick stick moves
//   servo_pwm_rate=50    — universal safe rate (works on every analog
//                          and digital servo). 150/333 only work on some
//                          digital servos and can damage analog ones —
//                          users opt up via Tuning tab when they know
//                          their servos support it
//   gps_use_3d_speed=ON  — records 3D speed in blackbox for airspeed
//                          tuning workflows; harmless if no GPS

export function planeDefaultsCliLines() {
    return [
        "set anti_gravity_gain = 0",
        "set iterm_relax_cutoff = 5",
        "set servo_pwm_rate = 50",
        "set gps_use_3d_speed = ON",
    ];
}

// Tuning starting points (rates + PIDs + DMax + FF). Applied on
// every preset Save (wizard or manual mixer-tab). Rationale: clicking
// a different airframe preset is a major config change — tunings from
// the previous airframe wouldn't transfer correctly anyway, so resetting
// to plane-friendly safe values is the right baseline.
//
// Rates: stored ÷10 in CLI, so 50/25/15 = 500/250/150 deg/s in the
// configurator's Rates tab. Force `rates_type = ACTUAL` first so those
// values are interpreted as deg/s (not super-rate).
//
// PIDs: 10/10/5 across axes. Yaw I-term zeroed when DIFF_THRUST to
// avoid I-buildup at speed when motor differential drives yaw.
//
// D Max + Feedforward zeroed — quad defaults (D Max ~40-46, FF ~120)
// are noisy starting points for a plane. User tunes up from clean
// zero in the regular PID tab once they have a working baseline.
//
// @param {{diffThrust: boolean, tpaMaxVoltage: number}} opts
//   tpaMaxVoltage: cells × 4.20V × 100 (e.g. 1680 for 4S). Falls
//   back to 1680 (4S) if not provided. Mirrors the MSP-staged value
//   from the wizard's Step 2 cells dropdown so it persists on
//   firmwares without MSP2_WING_TUNING.
export function planeTuningStartingPoints({ diffThrust = false, tpaMaxVoltage = 1680 } = {}) {
    return [
        "set rates_type = ACTUAL",
        "set roll_srate = 50",
        "set pitch_srate = 25",
        "set yaw_srate = 15",
        "set p_roll = 10",
        "set i_roll = 10",
        "set d_roll = 5",
        "set p_pitch = 10",
        "set i_pitch = 10",
        "set d_pitch = 5",
        "set p_yaw = 10",
        `set i_yaw = ${diffThrust ? 0 : 10}`,
        "set d_yaw = 5",
        "set d_max_roll = 0",
        "set d_max_pitch = 0",
        "set d_max_yaw = 0",
        "set f_roll = 0",
        "set f_pitch = 0",
        "set f_yaw = 0",
        // S-term — also staged via MSP2_SET_WING_TUNING in applyPreset,
        // but mainline FCs don't support that MSP and silently drop the
        // write. CLI duplicate ensures values persist on both targets.
        // Without this, servos barely deflect on mainline.
        "set s_pitch = 50",
        "set s_roll = 50",
        `set s_yaw = ${diffThrust ? 0 : 50}`,
        // angle_earth_ref + tpa_mode + tpa_speed_max_voltage — same
        // MSP-fallback reason as s_*. If the CLI param doesn't exist
        // on a given firmware, the command silently no-ops; on
        // firmwares that do expose it the value persists.
        // tpa_speed_max_voltage flows from the wizard Step 2 cells
        // dropdown (cells × 420). Defaults to 1680 (4S) if unset.
        "set angle_earth_ref = 0",
        "set tpa_mode = PD",
        `set tpa_speed_max_voltage = ${tpaMaxVoltage}`,
        // SPA (Stick Position Attenuation) — safe starting point per
        // PR #13719's recommended defaults. I_FREEZE freezes I-term
        // when stick crosses the center band, which avoids I-buildup
        // during sharp inputs. Center/width values give a generous
        // dead zone around stick center.
        "set spa_roll_mode = I_FREEZE",
        "set spa_pitch_mode = I_FREEZE",
        "set spa_yaw_mode = I_FREEZE",
        "set spa_roll_center = 200",
        "set spa_roll_width = 70",
        "set spa_pitch_center = 150",
        "set spa_pitch_width = 70",
        "set spa_yaw_center = 150",
        "set spa_yaw_width = 70",
    ];
}
