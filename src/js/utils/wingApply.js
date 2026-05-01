// Low-level wing config commit utility. Used by the Plane Setup Wizard
// (Apply + Done steps) to push a chosen airframe preset to the FC and
// persist it through reboot.
//
// Caller pre-populates FC.WING_TUNING / FC.MIXER_CONFIG / FC.SERVO_RULES
// with the intended values BEFORE calling. We orchestrate the MSP write
// sequence + EEPROM_WRITE + optional CLI batch + reboot in the right order
// (mirroring WingTuningTab.save()'s discipline at line 2914-3043).
//
// Live-data pause/resume is the CALLER's responsibility — error paths
// might want to leave it paused; we don't make that decision here.
//
// Phase 7 follow-up: WingTuningTab.save() still inlines its own version
// of this flow with extra dirty-gating + launch/gps_rescue/autoland
// commits. Consolidate when both paths are battle-tested.

import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import mspHelper from "../msp/MSPHelper";
import { applyCliLines } from "./wingMixerCli";
import { autoCleanCliLines } from "./wingReset";

// Apply a wing configuration to the FC. Returns once MSP/CLI commits
// have flushed. If a CLI batch is supplied, the FC reboots at the end
// of that batch — caller should expect a brief connection drop.
//
// @param {Object}        opts
// @param {Array<string>} [opts.cliBatch]      - resource + mmix lines.
//                                               null/empty skips CLI step.
// @param {boolean}       [opts.writeWingTuning=true]   - MSP2_SET_WING_TUNING
// @param {boolean}       [opts.writeMixerConfig=true]  - MSP_SET_MIXER_CONFIG
// @param {boolean}       [opts.writeServoRules=true]   - MSP_SET_SERVO_MIX_RULE
//
// Throws on MSP error or CLI batch error.
export async function applyWingConfig({
    cliBatch = null,
    writeWingTuning = true,
    writeMixerConfig = true,
    writeServoRules = true,
} = {}) {
    if (writeWingTuning) {
        await MSP.promise(MSPCodes.MSP2_SET_WING_TUNING, mspHelper.crunch(MSPCodes.MSP2_SET_WING_TUNING));
    }

    if (writeMixerConfig) {
        await MSP.promise(MSPCodes.MSP_SET_MIXER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MIXER_CONFIG));
    }

    if (writeServoRules) {
        await new Promise((resolve, reject) => {
            try {
                mspHelper.sendServoMixRules(resolve);
            } catch (err) {
                reject(err);
            }
        });
    }

    // EEPROM commit. After this point MSP-side state is persisted.
    // The CLI batch (if any) appends `save` + reboot which is fine —
    // resource changes need a reboot to take effect anyway.
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);

    if (cliBatch && cliBatch.length > 0) {
        // Auto-clean prefix: clears stale mmix entries + SERVO/MOTOR
        // resource binds from any prior preset so the user batch's
        // fresh mmix/resource lines populate cleanly. Servo configs
        // (min/max/middle/rate) are preserved — see wingReset.js.
        const fullBatch = [...autoCleanCliLines(), ...cliBatch];
        await applyCliLines(fullBatch);
    }
}
