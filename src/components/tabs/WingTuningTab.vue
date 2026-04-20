<template>
    <BaseTab tab-name="wing_tuning">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabWingTuning") }}</div>

            <!-- Firmware too old for MSP path — tab is effectively disabled. -->
            <div v-if="!apiOk" class="grid-row">
                <div class="grid-col col12">
                    <div class="gui_box">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("wingTuningStatus") }}</div>
                        </div>
                        <div class="spacer">
                            <p>{{ $t("wingTuningApiRequired") }}</p>
                        </div>
                    </div>
                </div>
            </div>

            <template v-else>
                <!-- Status panel -->
                <div class="grid-row">
                    <div class="grid-col col12">
                        <div class="gui_box">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title">{{ $t("wingTuningStatus") }}</div>
                            </div>
                            <div class="spacer">
                                <p v-if="loading">{{ $t("wingTuningLoading") }}</p>
                                <p v-else-if="error" style="color: #c00">{{ error }}</p>
                                <p v-else-if="saving">{{ $t("wingTuningSaving") }}</p>
                                <p v-else>
                                    <span v-if="dirty">{{ $t("wingTuningDirty") }}</span>
                                    <span v-else>{{ $t("wingTuningClean") }}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Sub-tab navigation -->
                <div class="subtab_bar">
                    <button
                        v-for="id in SUB_TAB_IDS"
                        :key="id"
                        type="button"
                        class="subtab_button"
                        :class="{ active: activeSubTab === id }"
                        @click="activeSubTab = id"
                    >
                        {{ $t("wingSubTab_" + id) }}
                    </button>
                </div>

                <!-- ═══ Mixer sub-tab ═══ -->
                <template v-if="activeSubTab === 'mixer'">
                    <!-- Aircraft Setup (airframe + presets) -->
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingMixerAirframeTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <p>{{ $t("wingMixerAirframeDesc") }}</p>

                                    <p class="mixer_info">
                                        <strong>{{ $t("wingMixerCurrentMixer") }}:</strong>
                                        {{
                                            mixerState.airframe === CUSTOM_AIRPLANE_MIXER
                                                ? $t("wingMixerCustomAirplane")
                                                : $t("wingMixerOtherMixer", { n: mixerState.airframe })
                                        }}
                                    </p>

                                    <p style="margin-top: 10px">{{ $t("wingMixerPresets") }}</p>
                                    <div class="preset_buttons">
                                        <button
                                            v-for="id in presetIds"
                                            :key="id"
                                            type="button"
                                            class="preset_button"
                                            :disabled="loading || applyingPreset"
                                            :title="presets[id].description"
                                            @click="applyPreset(id)"
                                        >
                                            {{ presets[id].label }}
                                        </button>
                                    </div>
                                    <p class="preset_hint">{{ $t("wingMixerPresetHint") }}</p>

                                    <div class="wiring_panel">
                                        <div class="wiring_header">
                                            <strong>{{ $t("wingMixerWiringTitle") }}</strong>
                                            <label class="wiring_selector_label">
                                                {{ $t("wingMixerWiringSelectLabel") }}
                                                <select v-model="wiringPresetId" class="wiring_selector">
                                                    <option v-for="id in presetIds" :key="id" :value="id">
                                                        {{ presets[id].label }}
                                                    </option>
                                                </select>
                                            </label>
                                        </div>
                                        <table v-if="currentWiring" class="wiring_table">
                                            <thead>
                                                <tr>
                                                    <th>{{ $t("wingMixerWiringPad") }}</th>
                                                    <th>{{ $t("wingMixerWiringSignal") }}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr v-for="w in currentWiring" :key="w.pad">
                                                    <td class="wiring_pad">{{ w.pad }}</td>
                                                    <td>{{ w.fn }}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        <p class="wiring_hint">{{ $t("wingMixerWiringHint") }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Yaw Type (moved from Tuning — shapes motor count + rudder expectation) -->
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingYawTypeTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <p>{{ $t("wingYawTypeDesc") }}</p>
                                    <select v-model="fields.yaw_type" :disabled="loading">
                                        <option value="RUDDER">RUDDER</option>
                                        <option value="DIFF_THRUST">DIFF_THRUST</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Function → Output mapping editor -->
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingMixerRulesTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <p>{{ $t("wingMixerRulesDesc") }}</p>

                                    <div v-if="yawConflict" class="yaw_conflict_banner">
                                        ⚠ {{ $t("wingMixerYawConflict") }}
                                    </div>

                                    <table class="fields">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>{{ $t("wingMixerOutput") }}</th>
                                                <th>{{ $t("wingMixerInput") }}</th>
                                                <th>{{ $t("wingMixerRate") }}</th>
                                                <th>{{ $t("wingMixerSpeed") }}</th>
                                                <th>{{ $t("wingMixerMin") }}</th>
                                                <th>{{ $t("wingMixerMax") }}</th>
                                                <th :title="$t('wingMixerBoxHelp')">{{ $t("wingMixerBox") }} ⓘ</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="(rule, idx) in mixerState.rules" :key="idx">
                                                <td>{{ idx + 1 }}</td>
                                                <td>
                                                    <select v-model.number="rule.target" :disabled="loading">
                                                        <option
                                                            v-for="opt in PLANE_SLOT_OPTIONS"
                                                            :key="opt.value"
                                                            :value="opt.value"
                                                        >
                                                            {{ opt.label }}
                                                        </option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <select v-model.number="rule.input" :disabled="loading">
                                                        <option v-for="(lbl, i) in INPUT_LABELS" :key="i" :value="i">
                                                            {{ lbl }}
                                                        </option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        :min="-125"
                                                        :max="125"
                                                        v-model.number="rule.rate"
                                                        :disabled="loading"
                                                        style="width: 4em"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="255"
                                                        v-model.number="rule.speed"
                                                        :disabled="loading"
                                                        style="width: 4em"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        :min="-100"
                                                        :max="100"
                                                        v-model.number="rule.min"
                                                        :disabled="loading"
                                                        style="width: 4em"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        :min="-100"
                                                        :max="100"
                                                        v-model.number="rule.max"
                                                        :disabled="loading"
                                                        style="width: 4em"
                                                    />
                                                </td>
                                                <td>
                                                    <select v-model.number="rule.box" :disabled="loading">
                                                        <option v-for="(lbl, i) in BOX_LABELS" :key="i" :value="i">
                                                            {{ lbl }}
                                                        </option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        class="rule_delete"
                                                        :disabled="loading"
                                                        :title="$t('wingMixerDeleteRule')"
                                                        @click="removeRule(idx)"
                                                    >
                                                        ×
                                                    </button>
                                                </td>
                                            </tr>
                                            <tr v-if="mixerState.rules.length === 0">
                                                <td colspan="9" class="empty_row">
                                                    {{ $t("wingMixerNoRules") }}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <div class="rule_actions">
                                        <span class="quick_add_label">{{ $t("wingMixerQuickAddLabel") }}</span>
                                        <button
                                            v-for="tpl in QUICK_ADD_TEMPLATES"
                                            :key="tpl.id"
                                            type="button"
                                            class="quick_add_button"
                                            :disabled="
                                                loading || mixerState.rules.length + tpl.rules.length > MAX_SERVO_RULES
                                            "
                                            :title="$t(tpl.labelKey)"
                                            @click="addTemplate(tpl.id)"
                                        >
                                            + {{ $t(tpl.labelKey) }}
                                        </button>
                                        <span class="rule_count">
                                            {{ mixerState.rules.length }} / {{ MAX_SERVO_RULES }}
                                        </span>
                                    </div>
                                    <p class="quick_add_hint">{{ $t("wingMixerQuickAddHint") }}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ───── Pin Assignment panel ─────
                         Surfaces the exact MOTOR/SERVO pads the selected
                         wiring preset would bind on Apply. Dropdown per
                         slot; picks feed into applyPreset as overrides
                         whenever the clicked preset matches this panel. -->
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingPinAssignTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <div class="pin_assign_header">
                                        <p class="pin_assign_desc">{{ $t("wingPinAssignDesc") }}</p>
                                        <a
                                            class="pin_assign_reload"
                                            href="#"
                                            :class="{
                                                disabled: hardwareLoading || applyingPreset || applyingPinAssignment,
                                            }"
                                            @click.prevent="loadHardware"
                                            :title="$t('wingHardwareReload')"
                                        >
                                            <span v-if="hardwareLoading">⟳ …</span>
                                            <span v-else>⟳ {{ $t("wingHardwareReload") }}</span>
                                        </a>
                                    </div>
                                    <p v-if="hardwareError" class="hw_error">{{ hardwareError }}</p>

                                    <p v-if="!hardwareAnalysis" class="hw_muted">
                                        {{ $t("wingPinAssignNoHw") }}
                                    </p>

                                    <!-- Pad mapping: where each default MOTOR/LED slot lives now.
                                         Captured on first sight of this target, persists across
                                         reboots so the silkscreen → current-role lookup stays
                                         intact even after preset applies wipe the live map. -->
                                    <div v-if="padMappingRows.length > 0" class="pin_assign_mapping">
                                        <strong>{{ $t("wingPinAssignMappingTitle") }}</strong>
                                        <table class="pin_assign_mapping_table">
                                            <thead>
                                                <tr>
                                                    <th>{{ $t("wingPinAssignMappingDefault") }}</th>
                                                    <th>{{ $t("wingPinAssignMappingPad") }}</th>
                                                    <th>{{ $t("wingPinAssignMappingNow") }}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr
                                                    v-for="row in padMappingRows"
                                                    :key="row.defaultLabel + ':' + row.pad"
                                                >
                                                    <td class="pin_assign_label">{{ row.defaultLabel }}</td>
                                                    <td class="pin_assign_current">{{ row.pad }}</td>
                                                    <td>{{ row.currentLabel }}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    <template v-if="hardwareAnalysis && pinAssignmentPlan">
                                        <table class="pin_assign_table">
                                            <thead>
                                                <tr>
                                                    <th>{{ $t("wingPinAssignResource") }}</th>
                                                    <th>{{ $t("wingPinAssignCurrent") }}</th>
                                                    <th>{{ $t("wingPinAssignPickedPad") }}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr v-for="row in pinAssignmentRows" :key="row.kind + ':' + row.index">
                                                    <td class="pin_assign_label">{{ row.label }}</td>
                                                    <td class="pin_assign_current">
                                                        {{ row.currentPad ?? $t("wingPinAssignNone") }}
                                                    </td>
                                                    <td>
                                                        <select
                                                            :value="row.pickedPad ?? ''"
                                                            @change="
                                                                setPadOverride(row.kind, row.index, $event.target.value)
                                                            "
                                                            :disabled="loading || applyingPreset"
                                                        >
                                                            <option v-if="!row.pickedPad" value="" disabled>
                                                                {{ $t("wingPinAssignNoCandidate") }}
                                                            </option>
                                                            <option
                                                                v-for="c in row.kind === 'motor'
                                                                    ? candidatesForMotor(row.index)
                                                                    : candidatesForServo(row.index)"
                                                                :key="c.pad"
                                                                :value="c.pad"
                                                            >
                                                                {{ c.pad }}
                                                                <template v-if="c.timer">
                                                                    — TIM{{ c.timer
                                                                    }}<template v-if="c.channel">
                                                                        CH{{ c.channel }}</template
                                                                    >
                                                                </template>
                                                                ({{ candidateSourceLabel(c) }})
                                                            </option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>

                                        <!-- Extras: currently bound resources the preset doesn't use.
                                             Informational; they're auto-released on apply for a clean
                                             final state. -->
                                        <div
                                            v-if="
                                                pinAssignmentExtras.motors.length + pinAssignmentExtras.servos.length >
                                                0
                                            "
                                            class="pin_assign_extras"
                                        >
                                            <strong>{{ $t("wingPinAssignExtrasTitle") }}</strong>
                                            <ul>
                                                <li v-for="m in pinAssignmentExtras.motors" :key="'m' + m.index">
                                                    MOTOR {{ m.index }} ({{ m.pad }}) → NONE
                                                </li>
                                                <li v-for="s in pinAssignmentExtras.servos" :key="'s' + s.index">
                                                    SERVO {{ s.index }} ({{ s.pad }}) → NONE
                                                </li>
                                            </ul>
                                        </div>

                                        <!-- Notice surfaces only when a pick actually resolves to the
                                             LED_STRIP pad — tells the user RGB will be released. The
                                             pad is always a candidate (no opt-in checkbox); user can
                                             override the dropdown if they want to keep the LED. -->
                                        <p
                                            v-for="(line, idx) in pinAssignmentPlan.cliLines.filter(
                                                (l) => l === 'resource LED_STRIP 1 NONE',
                                            )"
                                            :key="'led-notice-' + idx"
                                            class="hw_severity_warn"
                                        >
                                            ⚠ {{ $t("wingPinAssignLedNotice") }}
                                        </p>
                                        <div
                                            v-if="hardwareAnalysis.spareUarts && hardwareAnalysis.spareUarts.length > 0"
                                            class="pin_assign_optin"
                                        >
                                            <label v-for="u in hardwareAnalysis.spareUarts" :key="u.index">
                                                <input
                                                    type="checkbox"
                                                    :checked="allowUartPads.has(u.index)"
                                                    @change="toggleUartPadAllow(u.index)"
                                                />
                                                {{
                                                    $t("wingPinAssignAllowUart", {
                                                        n: u.index,
                                                        pads: [u.txPad, u.rxPad].filter(Boolean).join(" / "),
                                                    })
                                                }}
                                            </label>
                                        </div>

                                        <!-- CLI preview + warnings -->
                                        <p
                                            v-for="(w, i) in pinAssignmentPlan.warnings"
                                            :key="'w' + i"
                                            class="hw_severity_warn"
                                        >
                                            ⚠ {{ w.message }}
                                        </p>
                                        <pre v-if="pinAssignmentPlan.cliLines.length > 0" class="hw_cli_preview">{{
                                            pinAssignmentPlan.cliLines.join("\n")
                                        }}</pre>
                                        <p v-else-if="pinAssignmentPlan.warnings.length === 0" class="hw_muted">
                                            {{ $t("wingPinAssignNoop") }}
                                        </p>

                                        <div class="pin_assign_actions" v-if="pinAssignmentPlan.cliLines.length > 0">
                                            <a
                                                class="update"
                                                href="#"
                                                :class="{
                                                    disabled:
                                                        applyingPinAssignment || applyingPreset || loading || saving,
                                                }"
                                                @click.prevent="applyPinAssignment"
                                                >{{ $t("wingPinAssignApply") }}</a
                                            >
                                        </div>

                                        <p class="pin_assign_hint">{{ $t("wingPinAssignHint") }}</p>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
                <!-- ═══ /Mixer sub-tab ═══ -->

                <!-- ═══ Tuning sub-tab ═══ -->
                <template v-if="activeSubTab === 'tuning'">
                    <!-- Angle Mode (Yaw Type moved to Mixer sub-tab) -->
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingAngleModeTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <p>{{ $t("wingAngleModeDesc") }}</p>
                                    <table class="fields">
                                        <thead>
                                            <tr>
                                                <th>{{ $t("wingParameter") }}</th>
                                                <th>{{ $t("wingValue") }}</th>
                                                <th>{{ $t("wingSlider") }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td
                                                    title="Trims pitch attitude in Angle mode. Units of 0.1°. Negative pitches the nose down. See BF PR #14009."
                                                >
                                                    angle_pitch_offset (0.1°)
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        :min="-1000"
                                                        :max="1000"
                                                        v-model.number="fields.angle_pitch_offset"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="range"
                                                        :min="-1000"
                                                        :max="1000"
                                                        v-model.number="fields.angle_pitch_offset"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                            </tr>
                                            <tr>
                                                <td
                                                    title="Earth-reference strength for Angle mode axis mixing. Set 0 to disable mixing for wings (often preferable)."
                                                >
                                                    angle_earth_ref
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        v-model.number="fields.angle_earth_ref"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="100"
                                                        v-model.number="fields.angle_earth_ref"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- S-term -->
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingSTermTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <p>{{ $t("wingSTermDesc") }}</p>
                                    <table class="fields">
                                        <thead>
                                            <tr>
                                                <th>{{ $t("wingAxis") }}</th>
                                                <th>{{ $t("wingValue") }}</th>
                                                <th>{{ $t("wingSlider") }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="axis in ['pitch', 'roll', 'yaw']" :key="axis">
                                                <td>{{ axis.charAt(0).toUpperCase() + axis.slice(1) }}</td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        :max="PID_GAIN_MAX"
                                                        v-model.number="fields[`s_${axis}`]"
                                                        :disabled="loading || (axis === 'yaw' && diffThrustMode)"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        :max="PID_GAIN_MAX"
                                                        v-model.number="fields[`s_${axis}`]"
                                                        :disabled="loading || (axis === 'yaw' && diffThrustMode)"
                                                    />
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <p v-if="diffThrustMode" style="color: #c80">{{ $t("wingSYawForcedZero") }}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- TPA Mode + Airspeed -->
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingTpaAirspeedTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <p>{{ $t("wingTpaAirspeedDesc") }}</p>
                                    <table class="fields">
                                        <thead>
                                            <tr>
                                                <th>{{ $t("wingParameter") }}</th>
                                                <th>{{ $t("wingValue") }}</th>
                                                <th>{{ $t("wingSlider") }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td
                                                    title="PID scaling mode. PDS enables S-term scaling at low speeds for wings. See BF PR #14010."
                                                >
                                                    tpa_mode
                                                </td>
                                                <td colspan="2">
                                                    <select v-model="fields.tpa_mode" :disabled="loading">
                                                        <option value="PD">PD</option>
                                                        <option value="D">D</option>
                                                        <option value="PDS">PDS (wing)</option>
                                                    </select>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td
                                                    title="Airspeed estimation model. BASIC works for most pilots. ADVANCED uses additional params (adv_prop_pitch, adv_mass, adv_drag_k, adv_thrust) that must be set via CLI. See BF PR #13895."
                                                >
                                                    tpa_speed_type
                                                </td>
                                                <td colspan="2">
                                                    <select v-model="fields.tpa_speed_type" :disabled="loading">
                                                        <option value="BASIC">BASIC</option>
                                                        <option value="ADVANCED">ADVANCED (CLI only)</option>
                                                    </select>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td
                                                    title="BASIC airspeed model filter delay. See BF PR #13895 for tuning procedure."
                                                >
                                                    tpa_speed_basic_delay
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="65535"
                                                        v-model.number="fields.tpa_speed_basic_delay"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td></td>
                                            </tr>
                                            <tr>
                                                <td
                                                    title="BASIC airspeed model gravity term. See BF PR #13895 for tuning."
                                                >
                                                    tpa_speed_basic_gravity
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="65535"
                                                        v-model.number="fields.tpa_speed_basic_gravity"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td></td>
                                            </tr>
                                            <tr>
                                                <td
                                                    title="Battery full-charge voltage × 100. Example: 3S = 1260 (12.6V), 6S = 2520 (25.2V). Use the cell-count dropdown to set correctly."
                                                >
                                                    tpa_speed_max_voltage
                                                    <small>(V × 100)</small>
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="3360"
                                                        v-model.number="fields.tpa_speed_max_voltage"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <select
                                                        @change="onCellCountChange"
                                                        :value="detectedCellCount"
                                                        :disabled="loading"
                                                        title="Pick your cell count to auto-fill max_voltage."
                                                    >
                                                        <option value="">— cells —</option>
                                                        <option v-for="n in [2, 3, 4, 5, 6, 7, 8]" :key="n" :value="n">
                                                            {{ n }}S ({{ (n * 4.2).toFixed(1) }}V)
                                                        </option>
                                                    </select>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td
                                                    title="Pitch offset for BASIC airspeed estimation, in units of 0.1° (firmware comment: 'pitch offset in degrees*10 for craft speed estimation'). Compensates for FC mounting angle relative to the wing's aero-zero reference. Default 0."
                                                >
                                                    tpa_speed_pitch_offset (0.1°)
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="-32768"
                                                        max="32767"
                                                        v-model.number="fields.tpa_speed_pitch_offset"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <p v-if="fields.tpa_speed_type === 'ADVANCED'" style="color: #c80">
                                        {{ $t("wingTpaAdvancedHint") }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- TPA Curve -->
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingTpaCurveTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <p>{{ $t("wingTpaCurveDesc") }}</p>
                                    <table class="fields">
                                        <thead>
                                            <tr>
                                                <th>{{ $t("wingParameter") }}</th>
                                                <th>{{ $t("wingValue") }}</th>
                                                <th>{{ $t("wingSlider") }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td
                                                    title="Curve shape. HYPERBOLIC is recommended for planes. CLASSIC uses tpa_low_* params (CLI only) instead of this curve. See BF PR #13805."
                                                >
                                                    tpa_curve_type
                                                </td>
                                                <td colspan="2">
                                                    <select v-model="fields.tpa_curve_type" :disabled="loading">
                                                        <option value="CLASSIC">CLASSIC</option>
                                                        <option value="HYPERBOLIC">HYPERBOLIC</option>
                                                    </select>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td
                                                    title="Throttle % below which PID multiplier stays at pid_thr0. Dashed yellow line on the curve."
                                                >
                                                    tpa_curve_stall_throttle
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        v-model.number="fields.tpa_curve_stall_throttle"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="100"
                                                        v-model.number="fields.tpa_curve_stall_throttle"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                            </tr>
                                            <tr>
                                                <td
                                                    title="PID multiplier % at zero throttle / stall. Typical: 200 (2.0×) for planes."
                                                >
                                                    tpa_curve_pid_thr0
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="1000"
                                                        v-model.number="fields.tpa_curve_pid_thr0"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="1000"
                                                        v-model.number="fields.tpa_curve_pid_thr0"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                            </tr>
                                            <tr>
                                                <td
                                                    title="PID multiplier % at full throttle. Typical: 70 (0.7×) for planes."
                                                >
                                                    tpa_curve_pid_thr100
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="1000"
                                                        v-model.number="fields.tpa_curve_pid_thr100"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="1000"
                                                        v-model.number="fields.tpa_curve_pid_thr100"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                            </tr>
                                            <tr>
                                                <td
                                                    title="Curve slope parameter. Divided by 10 in the formula. Values near 10 approach a step; negative values invert curvature."
                                                >
                                                    tpa_curve_expo
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="-100"
                                                        max="100"
                                                        v-model.number="fields.tpa_curve_expo"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="range"
                                                        min="-100"
                                                        max="100"
                                                        v-model.number="fields.tpa_curve_expo"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <!-- TPA curve live preview (HYPERBOLIC math from Limon's PR #13805) -->
                                    <div v-if="fields.tpa_curve_type === 'HYPERBOLIC'" class="curve_container">
                                        <svg :width="tpaChart.width" :height="tpaChart.height" class="curve_svg">
                                            <!-- axes -->
                                            <line
                                                :x1="tpaChart.padLeft"
                                                :y1="tpaChart.padTop"
                                                :x2="tpaChart.padLeft"
                                                :y2="tpaChart.height - tpaChart.padBottom"
                                                stroke="#888"
                                                stroke-width="1"
                                            />
                                            <line
                                                :x1="tpaChart.padLeft"
                                                :y1="tpaChart.height - tpaChart.padBottom"
                                                :x2="tpaChart.width - tpaChart.padRight"
                                                :y2="tpaChart.height - tpaChart.padBottom"
                                                stroke="#888"
                                                stroke-width="1"
                                            />
                                            <!-- stall threshold vertical line -->
                                            <line
                                                :x1="tpaChart.stallX"
                                                :y1="tpaChart.padTop"
                                                :x2="tpaChart.stallX"
                                                :y2="tpaChart.height - tpaChart.padBottom"
                                                stroke="#c80"
                                                stroke-width="1"
                                                stroke-dasharray="4 3"
                                            />
                                            <text
                                                :x="tpaChart.stallX + 3"
                                                :y="tpaChart.padTop + 10"
                                                fill="#c80"
                                                font-size="10"
                                            >
                                                stall
                                            </text>
                                            <!-- curve -->
                                            <path :d="tpaChart.pathD" fill="none" stroke="#ffb800" stroke-width="2" />
                                            <!-- labels -->
                                            <text
                                                :x="tpaChart.padLeft - 4"
                                                :y="tpaChart.padTop + 4"
                                                text-anchor="end"
                                                fill="#aaa"
                                                font-size="10"
                                            >
                                                {{ tpaChart.yMax }}
                                            </text>
                                            <text
                                                :x="tpaChart.padLeft - 4"
                                                :y="tpaChart.height - tpaChart.padBottom"
                                                text-anchor="end"
                                                fill="#aaa"
                                                font-size="10"
                                            >
                                                {{ tpaChart.yMin }}
                                            </text>
                                            <text
                                                :x="tpaChart.padLeft"
                                                :y="tpaChart.height - 4"
                                                fill="#aaa"
                                                font-size="10"
                                            >
                                                0%
                                            </text>
                                            <text
                                                :x="tpaChart.width - tpaChart.padRight"
                                                :y="tpaChart.height - 4"
                                                text-anchor="end"
                                                fill="#aaa"
                                                font-size="10"
                                            >
                                                100% throttle
                                            </text>
                                        </svg>
                                    </div>
                                    <p v-else class="curve_hint">
                                        {{ $t("wingTpaClassicNoPreview") }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- SPA -->
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingSpaTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <p>{{ $t("wingSpaDesc") }}</p>
                                    <table class="fields">
                                        <thead>
                                            <tr>
                                                <th>{{ $t("wingAxis") }}</th>
                                                <th>Center</th>
                                                <th></th>
                                                <th>Width</th>
                                                <th></th>
                                                <th>Mode</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <template v-for="axis in ['roll', 'pitch', 'yaw']" :key="axis">
                                                <tr>
                                                    <td>{{ axis }}</td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="65535"
                                                            v-model.number="fields[`spa_${axis}_center`]"
                                                            :disabled="loading"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            :max="SPA_SETPOINT_MAX"
                                                            v-model.number="fields[`spa_${axis}_center`]"
                                                            :disabled="loading"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="65535"
                                                            v-model.number="fields[`spa_${axis}_width`]"
                                                            :disabled="loading"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            :max="SPA_WIDTH_SLIDER_MAX"
                                                            v-model.number="fields[`spa_${axis}_width`]"
                                                            :disabled="loading"
                                                        />
                                                    </td>
                                                    <td>
                                                        <select
                                                            v-model="fields[`spa_${axis}_mode`]"
                                                            :disabled="loading"
                                                        >
                                                            <option value="OFF">OFF</option>
                                                            <option value="I_FREEZE">I_FREEZE</option>
                                                            <option value="I">I</option>
                                                            <option value="PID">PID</option>
                                                            <option value="PD_I_FREEZE">PD_I_FREEZE</option>
                                                        </select>
                                                    </td>
                                                </tr>
                                                <tr v-if="fields[`spa_${axis}_mode`] !== 'OFF'">
                                                    <td colspan="6">
                                                        <div class="curve_container">
                                                            <svg
                                                                :width="spaChart(axis).width"
                                                                :height="spaChart(axis).height"
                                                                class="curve_svg"
                                                            >
                                                                <!-- gridlines at 0.5 PID -->
                                                                <line
                                                                    :x1="spaChart(axis).padLeft"
                                                                    :y1="spaChart(axis).midY"
                                                                    :x2="spaChart(axis).width - spaChart(axis).padRight"
                                                                    :y2="spaChart(axis).midY"
                                                                    stroke="#444"
                                                                    stroke-width="1"
                                                                    stroke-dasharray="2 3"
                                                                />
                                                                <!-- axes -->
                                                                <line
                                                                    :x1="spaChart(axis).padLeft"
                                                                    :y1="spaChart(axis).padTop"
                                                                    :x2="spaChart(axis).padLeft"
                                                                    :y2="
                                                                        spaChart(axis).height - spaChart(axis).padBottom
                                                                    "
                                                                    stroke="#888"
                                                                    stroke-width="1"
                                                                />
                                                                <line
                                                                    :x1="spaChart(axis).padLeft"
                                                                    :y1="
                                                                        spaChart(axis).height - spaChart(axis).padBottom
                                                                    "
                                                                    :x2="spaChart(axis).width - spaChart(axis).padRight"
                                                                    :y2="
                                                                        spaChart(axis).height - spaChart(axis).padBottom
                                                                    "
                                                                    stroke="#888"
                                                                    stroke-width="1"
                                                                />
                                                                <!-- left limit (green dashed) -->
                                                                <line
                                                                    :x1="spaChart(axis).leftLimitX"
                                                                    :y1="spaChart(axis).padTop"
                                                                    :x2="spaChart(axis).leftLimitX"
                                                                    :y2="
                                                                        spaChart(axis).height - spaChart(axis).padBottom
                                                                    "
                                                                    stroke="#3c3"
                                                                    stroke-width="1"
                                                                    stroke-dasharray="4 3"
                                                                />
                                                                <!-- right limit (green dashed) -->
                                                                <line
                                                                    :x1="spaChart(axis).rightLimitX"
                                                                    :y1="spaChart(axis).padTop"
                                                                    :x2="spaChart(axis).rightLimitX"
                                                                    :y2="
                                                                        spaChart(axis).height - spaChart(axis).padBottom
                                                                    "
                                                                    stroke="#3c3"
                                                                    stroke-width="1"
                                                                    stroke-dasharray="4 3"
                                                                />
                                                                <!-- center (red dashed) -->
                                                                <line
                                                                    :x1="spaChart(axis).centerX"
                                                                    :y1="spaChart(axis).padTop"
                                                                    :x2="spaChart(axis).centerX"
                                                                    :y2="
                                                                        spaChart(axis).height - spaChart(axis).padBottom
                                                                    "
                                                                    stroke="#e44"
                                                                    stroke-width="1"
                                                                    stroke-dasharray="4 3"
                                                                />
                                                                <!-- curve -->
                                                                <path
                                                                    :d="spaChart(axis).pathD"
                                                                    fill="none"
                                                                    stroke="#3af"
                                                                    stroke-width="2"
                                                                />
                                                                <!-- labels -->
                                                                <text
                                                                    :x="spaChart(axis).padLeft - 4"
                                                                    :y="spaChart(axis).padTop + 4"
                                                                    text-anchor="end"
                                                                    fill="#aaa"
                                                                    font-size="10"
                                                                >
                                                                    1.0
                                                                </text>
                                                                <text
                                                                    :x="spaChart(axis).padLeft - 4"
                                                                    :y="
                                                                        spaChart(axis).height - spaChart(axis).padBottom
                                                                    "
                                                                    text-anchor="end"
                                                                    fill="#aaa"
                                                                    font-size="10"
                                                                >
                                                                    0.0
                                                                </text>
                                                                <text
                                                                    :x="spaChart(axis).padLeft"
                                                                    :y="spaChart(axis).height - 4"
                                                                    fill="#aaa"
                                                                    font-size="10"
                                                                >
                                                                    0
                                                                </text>
                                                                <text
                                                                    :x="spaChart(axis).width - spaChart(axis).padRight"
                                                                    :y="spaChart(axis).height - 4"
                                                                    text-anchor="end"
                                                                    fill="#aaa"
                                                                    font-size="10"
                                                                >
                                                                    {{ SPA_SETPOINT_MAX }} setpoint
                                                                </text>
                                                                <text
                                                                    :x="spaChart(axis).centerX + 3"
                                                                    :y="spaChart(axis).padTop + 10"
                                                                    fill="#e44"
                                                                    font-size="10"
                                                                >
                                                                    center
                                                                </text>
                                                            </svg>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </template>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- Servo Autotrim (info-only — mode-driven, no CLI params) -->
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingAutotrimTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <p>{{ $t("wingAutotrimDesc") }}</p>
                                    <p class="autotrim_heading">{{ $t("wingAutotrimHowTo") }}</p>
                                    <ol class="autotrim_list">
                                        <li>{{ $t("wingAutotrimStep1") }}</li>
                                        <li>{{ $t("wingAutotrimStep2") }}</li>
                                        <li>{{ $t("wingAutotrimStep3") }}</li>
                                        <li>{{ $t("wingAutotrimStep4") }}</li>
                                    </ol>
                                    <p class="autotrim_heading">{{ $t("wingAutotrimGatesTitle") }}</p>
                                    <ul class="autotrim_list">
                                        <li>{{ $t("wingAutotrimGateStick") }}</li>
                                        <li>{{ $t("wingAutotrimGateAttitude") }}</li>
                                        <li>{{ $t("wingAutotrimGateGyro") }}</li>
                                        <li>{{ $t("wingAutotrimGateSamples") }}</li>
                                    </ul>
                                    <p class="autotrim_hint">{{ $t("wingAutotrimHint") }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
                <!-- ═══ /Tuning sub-tab ═══ -->

                <!-- ═══ Launch sub-tab ═══ -->
                <template v-if="activeSubTab === 'launch'">
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingSubTabLaunchTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <p>{{ $t("wingLaunchDesc") }}</p>
                                    <table class="fields">
                                        <thead>
                                            <tr>
                                                <th>{{ $t("wingParameter") }}</th>
                                                <th>{{ $t("wingValue") }}</th>
                                                <th>{{ $t("wingSlider") }}</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="def in LAUNCH_FIELD_DEFS" :key="def.name">
                                                <td :title="$t('wingLaunchHelp_' + def.name)">
                                                    {{ $t("wingLaunchLabel_" + def.name) }}
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        :min="def.min"
                                                        :max="def.max"
                                                        v-model.number="launchFields[def.name]"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="range"
                                                        :min="def.min"
                                                        :max="def.max"
                                                        v-model.number="launchFields[def.name]"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td class="launch_unit">{{ def.unit }}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <p class="launch_hint">{{ $t("wingLaunchHint") }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>

                <!-- ═══ GPS Rescue sub-tab — 16 wing-specific rescue fields. ═══
                     Identical editor shape to Launch: schema-driven rows with
                     number input + range slider, plus help tooltips. All
                     fields unsigned so no sign-aware handling needed. -->
                <template v-if="activeSubTab === 'gps_rescue'">
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingSubTabGpsRescueTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <p>{{ $t("wingGpsRescueDesc") }}</p>
                                    <table class="fields">
                                        <thead>
                                            <tr>
                                                <th>{{ $t("wingParameter") }}</th>
                                                <th>{{ $t("wingValue") }}</th>
                                                <th>{{ $t("wingSlider") }}</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="def in GPS_RESCUE_FIELD_DEFS" :key="def.name">
                                                <td :title="$t('wingGpsRescueHelp_' + def.name)">
                                                    {{ $t("wingGpsRescueLabel_" + def.name) }}
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        :min="def.min"
                                                        :max="def.max"
                                                        v-model.number="gpsRescueFields[def.name]"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="range"
                                                        :min="def.min"
                                                        :max="def.max"
                                                        v-model.number="gpsRescueFields[def.name]"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td class="launch_unit">{{ def.unit }}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <p class="launch_hint">{{ $t("wingGpsRescueHint") }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>

                <!-- ═══ Hardware sub-tab — live view of what the firmware has claimed.
                     Parses resource show / timer show / dma show via cliOneShot.js.
                     Read-only; no remap buttons in Phase 1. -->
                <template v-if="activeSubTab === 'hardware'">
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingSubTabHardwareTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <p>{{ $t("wingHardwareDesc") }}</p>
                                    <p>
                                        <a
                                            class="update"
                                            href="#"
                                            :class="{ disabled: hardwareLoading }"
                                            @click.prevent="loadHardware"
                                            >{{ $t("wingHardwareReload") }}</a
                                        >
                                        <span v-if="hardwareLoading" class="hw_status">
                                            {{ $t("wingHardwareLoading") }}
                                        </span>
                                    </p>

                                    <p v-if="hardwareError" class="hw_error">{{ hardwareError }}</p>

                                    <template v-if="hardwareAnalysis">
                                        <!-- Motors -->
                                        <h3>{{ $t("wingHardwareMotors") }}</h3>
                                        <table v-if="hardwareAnalysis.motors.length > 0" class="fields">
                                            <thead>
                                                <tr>
                                                    <th>Motor</th>
                                                    <th>Pad</th>
                                                    <th>Timer</th>
                                                    <th>DMA / Mode</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr v-for="m in hardwareAnalysis.motors" :key="m.index">
                                                    <td>M{{ m.index }}</td>
                                                    <td>{{ m.pad }}</td>
                                                    <td>
                                                        <span v-if="m.timer != null"
                                                            >TIM{{ m.timer }}
                                                            <span v-if="m.channel != null"
                                                                >CH{{ m.channel }}</span
                                                            ></span
                                                        >
                                                        <span v-else class="hw_muted">—</span>
                                                    </td>
                                                    <td>
                                                        <span v-if="m.bidirBurst" class="hw_ok">TIMUP burst ✓</span>
                                                        <span v-else-if="m.dmaStream"
                                                            >DMA{{ m.dmaStream.controller }}/S{{
                                                                m.dmaStream.stream
                                                            }}</span
                                                        >
                                                        <span v-else class="hw_warn">no DMA</span>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        <p v-else class="hw_muted">{{ $t("wingHardwareNoMotors") }}</p>

                                        <!-- Servos -->
                                        <h3>{{ $t("wingHardwareServos") }}</h3>
                                        <table v-if="hardwareAnalysis.servos.length > 0" class="fields">
                                            <thead>
                                                <tr>
                                                    <th>Servo</th>
                                                    <th>Pad</th>
                                                    <th>Timer</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr v-for="s in hardwareAnalysis.servos" :key="s.index">
                                                    <td>S{{ s.index }}</td>
                                                    <td>{{ s.pad }}</td>
                                                    <td>
                                                        <span v-if="s.timer != null"
                                                            >TIM{{ s.timer }}
                                                            <span v-if="s.channel != null"
                                                                >CH{{ s.channel }}</span
                                                            ></span
                                                        >
                                                        <span v-else class="hw_muted">—</span>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        <p v-else class="hw_muted">{{ $t("wingHardwareNoServos") }}</p>

                                        <!-- LED strip (resource cost; not auto-remapped by default) -->
                                        <template v-if="hardwareAnalysis.ledStrips.length > 0">
                                            <h3>{{ $t("wingHardwareLed") }}</h3>
                                            <table class="fields">
                                                <tbody>
                                                    <tr v-for="ls in hardwareAnalysis.ledStrips" :key="ls.pad">
                                                        <td>LED_STRIP</td>
                                                        <td>{{ ls.pad }}</td>
                                                        <td>
                                                            <span v-if="ls.timer != null"
                                                                >TIM{{ ls.timer }}
                                                                <span v-if="ls.channel != null"
                                                                    >CH{{ ls.channel }}</span
                                                                ></span
                                                            >
                                                        </td>
                                                        <td>
                                                            <span v-if="ls.dmaStream"
                                                                >DMA{{ ls.dmaStream.controller }}/S{{
                                                                    ls.dmaStream.stream
                                                                }}</span
                                                            >
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </template>

                                        <!-- UARTs -->
                                        <h3>{{ $t("wingHardwareSerials") }}</h3>
                                        <table v-if="hardwareAnalysis.serials.length > 0" class="fields">
                                            <thead>
                                                <tr>
                                                    <th>UART</th>
                                                    <th>TX pad</th>
                                                    <th>RX pad</th>
                                                    <th>DMA</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr v-for="u in hardwareAnalysis.serials" :key="u.index">
                                                    <td>UART{{ u.index }}</td>
                                                    <td>{{ u.txPad || "—" }}</td>
                                                    <td>{{ u.rxPad || "—" }}</td>
                                                    <td>
                                                        <span v-if="u.txDma" class="hw_ok"
                                                            >TX DMA{{ u.txDma.controller }}/S{{ u.txDma.stream }}</span
                                                        >
                                                        <span v-if="u.txDma && u.rxDma"> · </span>
                                                        <span v-if="u.rxDma" class="hw_ok"
                                                            >RX DMA{{ u.rxDma.controller }}/S{{ u.rxDma.stream }}</span
                                                        >
                                                        <span v-if="!u.txDma && !u.rxDma" class="hw_muted"
                                                            >interrupt-driven</span
                                                        >
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>

                                        <!-- Summary stats -->
                                        <h3>{{ $t("wingHardwareSummary") }}</h3>
                                        <ul class="hw_summary">
                                            <li>
                                                {{
                                                    $t("wingHardwareFreePads", {
                                                        n: hardwareAnalysis.freePadsCount,
                                                    })
                                                }}
                                            </li>
                                            <li>
                                                {{
                                                    $t("wingHardwareFreeDma", {
                                                        n: hardwareAnalysis.freeDmaStreams.length,
                                                    })
                                                }}
                                            </li>
                                            <li>
                                                {{
                                                    $t("wingHardwareFixed", {
                                                        n: hardwareAnalysis.hardwareFixedPads.length,
                                                    })
                                                }}
                                            </li>
                                        </ul>

                                        <!-- Warnings / hints -->
                                        <template v-if="hardwareAnalysis.warnings.length > 0">
                                            <h3>{{ $t("wingHardwareNotices") }}</h3>
                                            <ul class="hw_notices">
                                                <li
                                                    v-for="(w, i) in hardwareAnalysis.warnings"
                                                    :key="i"
                                                    :class="`hw_severity_${w.severity}`"
                                                >
                                                    {{ w.message }}
                                                </li>
                                            </ul>
                                        </template>

                                        <!-- Hardware tab is read-only in Phase 2.5. Pin assignment
                                             moved to the Mixer sub-tab where the rules live; this tab
                                             stays as a quick-glance diagnostic of what firmware has
                                             actually claimed. Use Mixer → Pin Assignment to change it. -->
                                    </template>

                                    <p class="launch_hint">{{ $t("wingHardwareHint") }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
            </template>
        </div>

        <!-- Sticky bottom-right toolbar, matching ServosTab / PortsTab / etc.
             Global `a.disabled` CSS (main.less:47) greys out + disables
             pointer-events, so click is blocked automatically. -->
        <div class="content_toolbar toolbar_fixed_bottom" v-if="apiOk">
            <div class="btn save_btn">
                <a class="update" href="#" :class="{ disabled: loading || saving || !dirty }" @click.prevent="save">{{
                    $t("wingTuningSave")
                }}</a>
            </div>
            <div class="btn save_btn">
                <a class="update" href="#" :class="{ disabled: loading || saving }" @click.prevent="reload">{{
                    $t("wingTuningReload")
                }}</a>
            </div>

            <!-- Preset-apply modal. Covers the tab while MSP writes +
                 CLI mmix + reboot are in flight. -->
            <div v-if="applyingPreset" class="preset_modal_overlay">
                <div class="preset_modal_box">
                    <p class="preset_modal_title">{{ $t("wingMixerApplying") }}</p>
                    <p class="preset_modal_sub">{{ $t("wingMixerRebooting") }}</p>
                </div>
            </div>

            <!-- Pin Assignment apply modal. Covers the tab while the
                 resource CLI batch + reboot are in flight. -->
            <div v-if="applyingPinAssignment" class="preset_modal_overlay">
                <div class="preset_modal_box">
                    <p class="preset_modal_title">{{ $t("wingPinAssignApplying") }}</p>
                    <p class="preset_modal_sub">{{ $t("wingMixerRebooting") }}</p>
                </div>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, reactive, ref, computed, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { computeTpaCurve, computeSpaCurve, SPA_SETPOINT_MAX } from "../../js/utils/wing_math.js";
import {
    PLANE_PRESETS,
    PRESET_IDS,
    INPUT_SOURCES,
    PLANE_SLOT_MIN,
    PLANE_SLOT_MAX,
} from "../../js/utils/planePresets.js";
import { applyCliLines } from "../../js/utils/wingMixerCli.js";
import { readCli, parseResourceShow, parseTimerShow, parseDmaShow, parseTimerDump } from "../../js/utils/cliOneShot.js";
import { analyzeWingResources } from "../../js/utils/wingResourceAnalyzer.js";
import { computePresetResourcePlan, candidatePadsForSlot } from "../../js/utils/wingRemapRecommender.js";
import { useConnectionStore } from "../../stores/connection";

const PID_GAIN_MAX = 200;

// Field definitions: name → parse/format type. "int" and "string" only.
// Enums (lookup tables) are strings; everything else is int.
const FIELD_DEFS = [
    // S-term
    { name: "s_pitch", type: "int" },
    { name: "s_roll", type: "int" },
    { name: "s_yaw", type: "int" },
    // Yaw type
    { name: "yaw_type", type: "string" },
    // Angle mode
    { name: "angle_pitch_offset", type: "int" },
    { name: "angle_earth_ref", type: "int" },
    // TPA mode + airspeed
    { name: "tpa_mode", type: "string" },
    { name: "tpa_speed_type", type: "string" },
    { name: "tpa_speed_basic_delay", type: "int" },
    { name: "tpa_speed_basic_gravity", type: "int" },
    { name: "tpa_speed_max_voltage", type: "int" },
    { name: "tpa_speed_pitch_offset", type: "int" },
    // TPA curve
    { name: "tpa_curve_type", type: "string" },
    { name: "tpa_curve_stall_throttle", type: "int" },
    { name: "tpa_curve_pid_thr0", type: "int" },
    { name: "tpa_curve_pid_thr100", type: "int" },
    { name: "tpa_curve_expo", type: "int" },
    // SPA
    { name: "spa_roll_center", type: "int" },
    { name: "spa_roll_width", type: "int" },
    { name: "spa_roll_mode", type: "string" },
    { name: "spa_pitch_center", type: "int" },
    { name: "spa_pitch_width", type: "int" },
    { name: "spa_pitch_mode", type: "string" },
    { name: "spa_yaw_center", type: "int" },
    { name: "spa_yaw_width", type: "int" },
    { name: "spa_yaw_mode", type: "string" },
];

// Wing auto-launch fields — order and types match firmware
// src/main/msp/msp_wing_launch.c + FC.WING_LAUNCH defaults in fc.js.
// min/max/default are UI-only bounds; wire is always int (u8/u16/i16).
const LAUNCH_FIELD_DEFS = [
    { name: "wing_launch_accel_thresh", min: 10, max: 100, default: 25, unit: "0.1G" },
    { name: "wing_launch_motor_delay", min: 0, max: 500, default: 100, unit: "ms" },
    { name: "wing_launch_motor_ramp", min: 100, max: 2000, default: 500, unit: "ms" },
    { name: "wing_launch_throttle", min: 25, max: 100, default: 75, unit: "%" },
    { name: "wing_launch_climb_time", min: 1000, max: 20000, default: 3000, unit: "ms" },
    { name: "wing_launch_climb_angle", min: 10, max: 60, default: 45, unit: "°" },
    { name: "wing_launch_transition", min: 200, max: 3000, default: 1000, unit: "ms" },
    { name: "wing_launch_max_tilt", min: 5, max: 90, default: 45, unit: "°" },
    { name: "wing_launch_idle_thr", min: 0, max: 25, default: 0, unit: "%" },
    { name: "wing_launch_stick_override", min: 0, max: 100, default: 0, unit: "%" },
];

function defaultLaunchFields() {
    const f = {};
    for (const def of LAUNCH_FIELD_DEFS) {
        f[def.name] = def.default;
    }
    return f;
}

// Wing GPS rescue fields — order and types match firmware
// pg/gps_rescue_wing.h + FC.WING_GPS_RESCUE defaults in fc.js.
// min/max/default are UI-only bounds; wire is always unsigned int
// (u8/u16). allowArmingWithoutFix is a u8 bool (0/1); we leave it
// rendered as a 0/1 numeric input for consistency with the other
// schema-driven rows — users who want the toggle can type 1.
const GPS_RESCUE_FIELD_DEFS = [
    { name: "allowArmingWithoutFix", min: 0, max: 1, default: 0, unit: "" },
    { name: "minSats", min: 4, max: 15, default: 8, unit: "" },
    { name: "maxBankAngle", min: 10, max: 60, default: 25, unit: "°" },
    { name: "orbitRadiusM", min: 10, max: 500, default: 50, unit: "m" },
    { name: "returnAltitudeM", min: 10, max: 500, default: 50, unit: "m" },
    { name: "minLoiterAltM", min: 5, max: 200, default: 25, unit: "m" },
    { name: "cruiseThrottle", min: 10, max: 100, default: 50, unit: "%" },
    { name: "minThrottle", min: 5, max: 100, default: 30, unit: "%" },
    { name: "abortThrottle", min: 10, max: 100, default: 45, unit: "%" },
    { name: "navP", min: 1, max: 200, default: 30, unit: "" },
    { name: "altP", min: 1, max: 200, default: 30, unit: "" },
    { name: "turnCompensation", min: 0, max: 100, default: 50, unit: "%" },
    { name: "minHeadingSpeedCmS", min: 100, max: 2000, default: 400, unit: "cm/s" },
    { name: "stallSpeedCmS", min: 50, max: 1500, default: 200, unit: "cm/s" },
    { name: "minStartDistM", min: 5, max: 500, default: 30, unit: "m" },
    { name: "sanityChecks", min: 0, max: 2, default: 1, unit: "" },
];

function defaultGpsRescueFields() {
    const f = {};
    for (const def of GPS_RESCUE_FIELD_DEFS) {
        f[def.name] = def.default;
    }
    return f;
}

function defaultFields() {
    const f = {};
    for (const def of FIELD_DEFS) {
        f[def.name] = def.type === "string" ? "" : 0;
    }
    return f;
}

// Servo mixer input source labels — matches firmware inputSource_e at
// src/main/flight/servos.h. Order is the wire contract.
const INPUT_LABELS = [
    "STABILIZED_ROLL",
    "STABILIZED_PITCH",
    "STABILIZED_YAW",
    "STABILIZED_THROTTLE",
    "RC_ROLL",
    "RC_PITCH",
    "RC_YAW",
    "RC_THROTTLE",
    "RC_AUX1",
    "RC_AUX2",
    "RC_AUX3",
    "RC_AUX4",
];

// Mixer box modes. 0 = always-on, 1-3 = BOXSERVO1-3 flight-mode-gated.
const BOX_LABELS = ["Always", "BOXSERVO1", "BOXSERVO2", "BOXSERVO3"];

const MAX_SERVO_RULES = 16; // firmware: 2 * MAX_SUPPORTED_SERVOS
const CUSTOM_AIRPLANE_MIXER = 24; // MIXER_CUSTOM_AIRPLANE, see flight/mixer.h

// Plane servo slot dropdown. Target channels for MIXER_CUSTOM_AIRPLANE
// must be in the plane slot range (servos.c:383-385). Shown as S1..S6
// but stored as the underlying slot index 2..7.
const PLANE_SLOT_OPTIONS = [];
for (let slot = PLANE_SLOT_MIN; slot <= PLANE_SLOT_MAX; slot++) {
    PLANE_SLOT_OPTIONS.push({ value: slot, label: `S${slot - PLANE_SLOT_MIN + 1}` });
}

// Quick-add rule templates. Each template writes 1 or more rules that
// together implement a single plane function (aileron pair, elevon pair,
// V-tail, etc). Users still edit individual rules after if they want,
// but the templates encode the slot + input + rate conventions so
// newcomers don't have to know MIXER_CUSTOM_AIRPLANE slot semantics.
//
// SLOT constants match planePresets.js:SLOT (2=elevator, 3=flapperon L,
// 4=flapperon R, 5=rudder, 6/7=aux). FULL = 100% (single axis), MIX = 50%
// (shared-axis, prevents saturation when both inputs hit max).
const Q_SLOT_ELEVATOR = 2;
const Q_SLOT_FLAPPERON_L = 3;
const Q_SLOT_FLAPPERON_R = 4;
const Q_SLOT_RUDDER = 5;
const Q_FULL_RATE = 100;
const Q_MIX_RATE = 50;
const Q_INPUT_ROLL = 0;
const Q_INPUT_PITCH = 1;
const Q_INPUT_YAW = 2;

function qRule(target, input, rate) {
    return { target, input, rate, speed: 0, min: -100, max: 100, box: 0 };
}

const QUICK_ADD_TEMPLATES = [
    {
        id: "aileron_pair",
        labelKey: "wingMixerQuickAileron",
        rules: [
            qRule(Q_SLOT_FLAPPERON_L, Q_INPUT_ROLL, +Q_FULL_RATE),
            qRule(Q_SLOT_FLAPPERON_R, Q_INPUT_ROLL, -Q_FULL_RATE),
        ],
    },
    {
        id: "elevator",
        labelKey: "wingMixerQuickElevator",
        rules: [qRule(Q_SLOT_ELEVATOR, Q_INPUT_PITCH, +Q_FULL_RATE)],
    },
    {
        id: "rudder",
        labelKey: "wingMixerQuickRudder",
        rules: [qRule(Q_SLOT_RUDDER, Q_INPUT_YAW, +Q_FULL_RATE)],
    },
    {
        id: "elevons",
        labelKey: "wingMixerQuickElevons",
        rules: [
            qRule(Q_SLOT_FLAPPERON_L, Q_INPUT_ROLL, +Q_MIX_RATE),
            qRule(Q_SLOT_FLAPPERON_L, Q_INPUT_PITCH, +Q_MIX_RATE),
            qRule(Q_SLOT_FLAPPERON_R, Q_INPUT_ROLL, -Q_MIX_RATE),
            qRule(Q_SLOT_FLAPPERON_R, Q_INPUT_PITCH, +Q_MIX_RATE),
        ],
    },
    {
        id: "v_tail",
        labelKey: "wingMixerQuickVTail",
        rules: [
            qRule(Q_SLOT_ELEVATOR, Q_INPUT_PITCH, +Q_MIX_RATE),
            qRule(Q_SLOT_ELEVATOR, Q_INPUT_YAW, +Q_MIX_RATE),
            qRule(Q_SLOT_RUDDER, Q_INPUT_PITCH, +Q_MIX_RATE),
            qRule(Q_SLOT_RUDDER, Q_INPUT_YAW, -Q_MIX_RATE),
        ],
    },
    {
        id: "raw",
        labelKey: "wingMixerQuickRaw",
        rules: [qRule(Q_SLOT_FLAPPERON_L, Q_INPUT_ROLL, +Q_FULL_RATE)],
    },
];

function emptyMixerState() {
    return { airframe: 0, reverseMotorDir: 0, rules: [] };
}

function cloneMixerState(state) {
    return {
        airframe: state.airframe,
        reverseMotorDir: state.reverseMotorDir,
        rules: state.rules.map((r) => ({ ...r })),
    };
}

function mixerStatesEqual(a, b) {
    if (a.airframe !== b.airframe || a.reverseMotorDir !== b.reverseMotorDir) {
        return false;
    }
    if (a.rules.length !== b.rules.length) {
        return false;
    }
    for (let i = 0; i < a.rules.length; i++) {
        const r1 = a.rules[i];
        const r2 = b.rules[i];
        if (
            r1.target !== r2.target ||
            r1.input !== r2.input ||
            r1.rate !== r2.rate ||
            r1.speed !== r2.speed ||
            r1.min !== r2.min ||
            r1.max !== r2.max ||
            r1.box !== r2.box
        ) {
            return false;
        }
    }
    return true;
}

export default defineComponent({
    name: "WingTuningTab",
    components: { BaseTab },

    setup() {
        const connectionStore = useConnectionStore();

        const fields = reactive(defaultFields());
        const initialFields = ref({ ...fields });

        const launchFields = reactive(defaultLaunchFields());
        const initialLaunchFields = ref({ ...launchFields });

        const gpsRescueFields = reactive(defaultGpsRescueFields());
        const initialGpsRescueFields = ref({ ...gpsRescueFields });

        // Hardware sub-tab state. Lazy-loaded on first activation
        // via CLI one-shot (resource show / timer show / dma show).
        // Read-only — no writes from this panel in Phase 1.
        const hardwareAnalysis = ref(null);
        const hardwareLoading = ref(false);
        const hardwareError = ref(null);

        async function loadHardware() {
            if (hardwareLoading.value) return;
            hardwareLoading.value = true;
            hardwareError.value = null;
            try {
                // Sequential: MSP.cli_callback is singular; running in
                // parallel would have the second call overwrite the first's
                // pending callback.
                const rs = await readCli("resource show");
                const ts = await readCli("timer show");
                const ds = await readCli("dma show");
                // `timer` (dump form) exposes the board's full
                // TIMER_PIN_MAP — the set of PWM-capable pads regardless
                // of current claim state. AIO remap picks from these
                // when motor pads can't be reused as servos.
                const td = await readCli("timer");
                hardwareAnalysis.value = analyzeWingResources({
                    resourceShow: parseResourceShow(rs.lines),
                    timerShow: parseTimerShow(ts.lines),
                    dmaShow: parseDmaShow(ds.lines),
                    timerDump: parseTimerDump(td.lines),
                    // Serial port function assignments (MSP_SERIAL_CONFIG, fetched
                    // at connect by serial_backend.js). Used to identify unused
                    // UARTs whose pads can be repurposed as servo outputs.
                    serialPorts: FC.SERIAL_CONFIG?.ports || [],
                });

                // Capture the original pad layout for this target on first
                // sight, persist to localStorage. Lets the Pin Assignment
                // panel render a "default pad → currently" table even after
                // preset applies have rewritten the live resource map.
                ensurePadDefaultsForCurrentBoard();
            } catch (e) {
                console.error("[WingTuning] Hardware load failed:", e);
                hardwareError.value = e.message || String(e);
            } finally {
                hardwareLoading.value = false;
            }
        }

        // Phase 2.5 Pin Assignment state — actual helpers and watcher
        // live below wiringPresetId's declaration to avoid TDZ issues
        // (watch() subscribes eagerly at setup-time).
        const padOverrides = reactive({ servo: {}, motor: {} });
        // LED_STRIP pad is always a candidate (no opt-in needed) — most users
        // would rather lose the RGB than be unable to fit a servo. A notice
        // appears in the panel if a pick actually resolves to the LED pad.
        const allowLedStripPad = ref(true);
        const allowUartPads = reactive(new Set());

        function toggleUartPadAllow(index) {
            if (allowUartPads.has(index)) allowUartPads.delete(index);
            else allowUartPads.add(index);
        }

        // ─── Pad-defaults snapshot (per-board) ───
        // Persists the original MOTOR/LED_STRIP pad layout the first time we
        // see a given board. Lets us render a "MOTOR 3 was on A03 — currently
        // SERVO 1" table after preset applies wipe the live resource map.
        const padDefaults = ref(null); // { motors: [{index, pad}], ledStrips: [{pad}] } | null

        function padDefaultsKey(target) {
            return target ? `wing.padDefaults.${target}` : null;
        }
        function loadPadDefaults(target) {
            const key = padDefaultsKey(target);
            if (!key || typeof window === "undefined") return null;
            try {
                const raw = window.localStorage?.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch {
                return null;
            }
        }
        function savePadDefaults(target, snapshot) {
            const key = padDefaultsKey(target);
            if (!key || typeof window === "undefined") return;
            try {
                window.localStorage?.setItem(key, JSON.stringify(snapshot));
            } catch {
                /* quota / privacy mode — harmless */
            }
        }
        function ensurePadDefaultsForCurrentBoard() {
            const target = FC.CONFIG?.boardName || FC.CONFIG?.targetName || null;
            if (!target) return;
            let cached = loadPadDefaults(target);
            if (!cached && hardwareAnalysis.value) {
                // First sight of this target — capture current motors + LED_STRIP
                // pads as the canonical default layout. If the user is on
                // factory defaults at first connect, this matches the silkscreen.
                cached = {
                    target,
                    motors: (hardwareAnalysis.value.motors ?? []).map((m) => ({
                        index: m.index,
                        pad: m.pad,
                    })),
                    ledStrips: (hardwareAnalysis.value.ledStrips ?? []).map((l) => ({
                        pad: l.pad,
                    })),
                };
                savePadDefaults(target, cached);
            }
            padDefaults.value = cached;
        }

        // Mapping rows: one per default MOTOR / LED_STRIP slot, showing where
        // its pad is bound right now. Driven by the cached defaults snapshot
        // crossed with the live analyzer state. Used by the "Pad mapping"
        // table in the Pin Assignment panel.
        const padMappingRows = computed(() => {
            if (!padDefaults.value || !hardwareAnalysis.value) return [];
            const currentByPad = new Map();
            for (const m of hardwareAnalysis.value.motors ?? []) {
                currentByPad.set(m.pad, `MOTOR ${m.index}`);
            }
            for (const s of hardwareAnalysis.value.servos ?? []) {
                currentByPad.set(s.pad, `SERVO ${s.index}`);
            }
            for (const l of hardwareAnalysis.value.ledStrips ?? []) {
                currentByPad.set(l.pad, "LED_STRIP");
            }
            const rows = [];
            for (const m of padDefaults.value.motors ?? []) {
                rows.push({
                    defaultLabel: `MOTOR ${m.index}`,
                    pad: m.pad,
                    currentLabel: currentByPad.get(m.pad) || "(free)",
                });
            }
            for (const l of padDefaults.value.ledStrips ?? []) {
                rows.push({
                    defaultLabel: "LED_STRIP",
                    pad: l.pad,
                    currentLabel: currentByPad.get(l.pad) || "(free)",
                });
            }
            return rows;
        });

        const mixerState = reactive(emptyMixerState());
        const initialMixerState = ref(cloneMixerState(mixerState));

        const loading = ref(false);
        const saving = ref(false);
        const error = ref(null);

        const diffThrustMode = computed(() => fields.yaw_type === "DIFF_THRUST");

        watch(diffThrustMode, (isDiff) => {
            if (isDiff && fields.s_yaw !== 0) {
                fields.s_yaw = 0;
            }
        });

        const mixerDirty = computed(() => !mixerStatesEqual(mixerState, initialMixerState.value));

        const launchDirty = computed(() =>
            LAUNCH_FIELD_DEFS.some((def) => launchFields[def.name] !== initialLaunchFields.value[def.name]),
        );

        const gpsRescueDirty = computed(() =>
            GPS_RESCUE_FIELD_DEFS.some((def) => gpsRescueFields[def.name] !== initialGpsRescueFields.value[def.name]),
        );

        const applyingPreset = ref(false);

        // Sub-tab state. Keeps the Wing Tuning page navigable as more
        // features land (Launch, GPS Rescue, eventually VTOL). Persists
        // the last-visited sub-tab across remount via localStorage so
        // returning to the tab opens where the user left off.
        const SUB_TAB_STORAGE_KEY = "wingTuningActiveSubTab";
        const SUB_TAB_IDS = ["tuning", "mixer", "launch", "gps_rescue", "hardware"];
        const activeSubTab = ref(
            (() => {
                try {
                    const stored = globalThis.localStorage?.getItem(SUB_TAB_STORAGE_KEY);
                    return SUB_TAB_IDS.includes(stored) ? stored : "tuning";
                } catch {
                    return "tuning";
                }
            })(),
        );
        watch(activeSubTab, (v) => {
            try {
                globalThis.localStorage?.setItem(SUB_TAB_STORAGE_KEY, v);
            } catch {
                /* no-op: localStorage unavailable / quota exceeded */
            }
            // Lazy-load the Hardware panel on first visit. Cached across
            // sub-tab switches; explicit Reload button refetches.
            if (v === "hardware" && hardwareAnalysis.value === null && !hardwareLoading.value) {
                loadHardware();
            }
        });

        // Wiring reference selector. Defaults to the first preset so
        // the reference panel is visible immediately on tab load —
        // users can pick any preset to see where to plug signal wires
        // without committing, and the panel stays put across preset
        // applies + FC reboot + reconnect (component remount picks up
        // the same default).
        // Persist across remount so the Pin Assignment panel keeps
        // tracking the last-applied preset after the FC reboot + reconnect
        // cycle (otherwise the panel defaults to Standard Plane and
        // misreports what the current state actually matches).
        const WIRING_PRESET_STORAGE_KEY = "wing.wiringPresetId";
        const _storedWiring =
            typeof window !== "undefined" ? window.localStorage?.getItem(WIRING_PRESET_STORAGE_KEY) : null;
        const wiringPresetId = ref(
            _storedWiring && PRESET_IDS.includes(_storedWiring) ? _storedWiring : PRESET_IDS[0] || null,
        );
        watch(wiringPresetId, (id) => {
            if (typeof window !== "undefined" && id) {
                try {
                    window.localStorage?.setItem(WIRING_PRESET_STORAGE_KEY, id);
                } catch {
                    /* quota or privacy mode — harmless */
                }
            }
        });

        const currentWiring = computed(() => {
            if (!wiringPresetId.value) {
                return null;
            }
            return PLANE_PRESETS[wiringPresetId.value]?.wiring || null;
        });

        // ─── Phase 2.5 Pin Assignment helpers (must be after wiringPresetId) ───
        const pinAssignmentPreset = computed(() => PLANE_PRESETS[wiringPresetId.value] ?? null);

        const pinAssignmentPlan = computed(() => {
            if (!hardwareAnalysis.value || !pinAssignmentPreset.value) return null;
            return computePresetResourcePlan(hardwareAnalysis.value, pinAssignmentPreset.value, {
                picks: padOverrides.servo,
                motorPicks: padOverrides.motor,
                allowLedStrip: allowLedStripPad.value,
                allowUartRelease: [...allowUartPads],
                padDefaults: padDefaults.value,
            });
        });

        const pinAssignmentRows = computed(() => {
            const plan = pinAssignmentPlan.value;
            if (!plan) return [];
            const rows = [];
            for (const idx of plan.usedMotorIndices) {
                const bound = (hardwareAnalysis.value?.motors ?? []).find((m) => m.index === idx);
                const pickedFromPlan = plan.motorPicks.get(idx);
                rows.push({
                    kind: "motor",
                    index: idx,
                    label: `MOTOR ${idx}`,
                    currentPad: bound?.pad ?? null,
                    pickedPad: padOverrides.motor[idx] ?? pickedFromPlan?.pad ?? bound?.pad ?? null,
                });
            }
            for (const idx of plan.usedServoIndices) {
                const bound = (hardwareAnalysis.value?.servos ?? []).find((s) => s.index === idx);
                const pickedFromPlan = plan.picks.get(idx);
                rows.push({
                    kind: "servo",
                    index: idx,
                    label: `SERVO ${idx}`,
                    currentPad: bound?.pad ?? null,
                    pickedPad: padOverrides.servo[idx] ?? pickedFromPlan?.pad ?? bound?.pad ?? null,
                });
            }
            return rows;
        });

        const pinAssignmentExtras = computed(() => {
            const plan = pinAssignmentPlan.value;
            if (!plan) return { motors: [], servos: [] };
            return {
                motors: plan.motorsToRelease.map((m) => ({ index: m.index, pad: m.pad })),
                servos: plan.servosToRelease.map((s) => ({ index: s.index, pad: s.pad })),
            };
        });

        function candidatesForServo(servoIndex) {
            if (!hardwareAnalysis.value) return [];
            const plan = pinAssignmentPlan.value;
            const bound = (hardwareAnalysis.value.servos ?? []).find((s) => s.index === servoIndex);
            return candidatePadsForSlot(hardwareAnalysis.value, servoIndex, {
                motorIndicesInUse: plan?.usedMotorIndices ?? [],
                currentPad: bound?.pad ?? null,
                allowLedStrip: allowLedStripPad.value,
                allowUartRelease: [...allowUartPads],
            });
        }

        function candidatesForMotor(motorIndex) {
            if (!hardwareAnalysis.value) return [];
            const analysis = hardwareAnalysis.value;
            const existing = (analysis.motors ?? []).find((m) => m.index === motorIndex);
            const results = [];
            if (existing) {
                results.push({
                    pad: existing.pad,
                    timer: existing.timer,
                    channel: existing.channel,
                    source: "existing",
                });
            }
            const claimed = new Set();
            for (const m of analysis.motors ?? []) if (m.index !== motorIndex) claimed.add(m.pad);
            for (const s of analysis.servos ?? []) claimed.add(s.pad);
            for (const f of analysis.hardwareFixedPads ?? []) claimed.add(f.pad);
            for (const p of analysis.pwmCapableFreePads ?? []) {
                if (claimed.has(p.pad)) continue;
                if (existing && existing.pad === p.pad) continue;
                results.push({ pad: p.pad, timer: p.timer, channel: p.channel, source: "free-pwm" });
            }
            return results;
        }

        function setPadOverride(kind, index, pad) {
            if (!pad) return;
            if (kind === "motor") padOverrides.motor[index] = pad;
            else if (kind === "servo") padOverrides.servo[index] = pad;
        }

        // Drop-down label for a candidate. Pulls the specific MOTOR/UART/LED
        // index out of the candidate's requiresRelease line so users see e.g.
        // "(releases MOTOR 3)" instead of generic "(release motor)" — that
        // matches the silkscreen on most quad FCs and tells them where to
        // physically plug their servo without knowing pin names.
        function candidateSourceLabel(c) {
            if (!c) return "";
            if (c.source === "existing") return "current";
            if (c.source === "free-pwm") return "free";
            const line = Array.isArray(c.requiresRelease) ? c.requiresRelease[0] : null;
            if (c.source === "motor-release") {
                const m = line && /^resource MOTOR (\d+) /i.exec(line);
                return m ? `releases MOTOR ${m[1]}` : "release motor";
            }
            if (c.source === "led-strip") return "releases LED_STRIP";
            if (c.source === "uart-release") {
                const m = line && /^resource SERIAL_(TX|RX) (\d+) /i.exec(line);
                return m ? `releases UART${m[2]} ${m[1]}` : "UART pad";
            }
            return "";
        }

        function clearPadOverrides() {
            for (const k of Object.keys(padOverrides.motor)) delete padOverrides.motor[k];
            for (const k of Object.keys(padOverrides.servo)) delete padOverrides.servo[k];
        }

        // Changing tracked preset resets overrides so picks don't apply
        // stale pads to a different rule set.
        watch(wiringPresetId, () => clearPadOverrides());

        // Apply the Pin Assignment plan's resource lines directly —
        // no mmix/smix/mixer changes, just pad reassignment + save + reboot.
        // Lets users tweak pads (e.g. move SERVO 3 to LED_STRIP pad) without
        // re-running a full preset apply.
        const applyingPinAssignment = ref(false);
        async function applyPinAssignment() {
            const plan = pinAssignmentPlan.value;
            if (!plan || plan.cliLines.length === 0) return;
            if (applyingPreset.value || applyingPinAssignment.value || loading.value || saving.value) return;
            const preview = plan.cliLines.join("\n");
            if (!confirm(`Apply these pin changes? The FC will reboot.\n\n${preview}`)) return;
            applyingPinAssignment.value = true;
            error.value = null;
            connectionStore.pauseLiveData();
            try {
                connectionStore.clearMspQueue();
                await applyCliLines(plan.cliLines);
                await new Promise((r) => setTimeout(r, 5000));
                try {
                    await loadHardware();
                } catch (reloadErr) {
                    console.warn("[WingTuning] post-apply hardware reload failed:", reloadErr);
                }
                clearPadOverrides();
            } catch (e) {
                console.error("[WingTuning] applyPinAssignment failed:", e);
                error.value = e.message || String(e);
            } finally {
                connectionStore.resumeLiveData();
                applyingPinAssignment.value = false;
            }
        }

        // Loud warning when the user has picked DIFF_THRUST but still has
        // a servo rule driving yaw — the rudder and the motor differential
        // will fight each other on every yaw input.
        const yawConflict = computed(() => {
            if (fields.yaw_type !== "DIFF_THRUST") {
                return false;
            }
            return mixerState.rules.some((r) => r.input === INPUT_SOURCES.STABILIZED_YAW);
        });

        const dirty = computed(
            () =>
                FIELD_DEFS.some((def) => fields[def.name] !== initialFields.value[def.name]) ||
                mixerDirty.value ||
                launchDirty.value ||
                gpsRescueDirty.value,
        );

        // Capability check — tab requires a USE_WING firmware build.
        // The MSP codes (MSP2_WING_TUNING / MSP2_SET_WING_TUNING) ship
        // in the same firmware PR as USE_WING, so the build-option flag
        // is sufficient. Per BF convention, API_VERSION_MINOR is bumped
        // by release maintainers at release-cut time, not per feature
        // PR — so we don't gate on apiVersion here.
        //
        // Safe-by-default: if FC.CONFIG.buildOptions is undefined/empty
        // (MSP_BUILD_INFO failed or truncated), .includes returns false
        // → stub shown, no crash.
        const apiOk = computed(() => {
            const opts = FC.CONFIG?.buildOptions;
            return Array.isArray(opts) && opts.includes("USE_WING");
        });

        // Cell-count helper: derive S-count from tpa_speed_max_voltage (V×100).
        // Full charge per cell = 4.2V → V×100 / 420 ≈ cell count.
        const detectedCellCount = computed(() => {
            const v = fields.tpa_speed_max_voltage;
            if (!v) {
                return "";
            }
            const n = Math.round(v / 420);
            return n >= 2 && n <= 8 ? n : "";
        });

        function onCellCountChange(event) {
            const n = Number.parseInt(event.target.value, 10);
            if (!Number.isNaN(n)) {
                fields.tpa_speed_max_voltage = n * 420;
            }
        }

        // TPA curve chart geometry (reactive).
        const tpaChart = computed(() => {
            const stall = fields.tpa_curve_stall_throttle;
            const thr0 = fields.tpa_curve_pid_thr0;
            const thr100 = fields.tpa_curve_pid_thr100;
            const expo = fields.tpa_curve_expo;
            const points = computeTpaCurve(stall, thr0, thr100, expo);

            const width = 480,
                height = 200;
            const padLeft = 40,
                padRight = 16,
                padTop = 16,
                padBottom = 28;
            const plotW = width - padLeft - padRight;
            const plotH = height - padTop - padBottom;
            const yMin = Math.min(thr0, thr100, 50) - 10;
            const yMax = Math.max(thr0, thr100, 100) + 10;
            const yRange = yMax - yMin || 1;
            const toX = (t) => padLeft + (t / 100) * plotW;
            const toY = (m) => padTop + plotH - ((m - yMin) / yRange) * plotH;
            const pathD = points
                .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.throttle).toFixed(1)},${toY(p.multiplier).toFixed(1)}`)
                .join(" ");
            const stallX = toX(stall);
            return { width, height, padLeft, padRight, padTop, padBottom, pathD, stallX, yMin, yMax };
        });

        function spaChart(axis) {
            const center = fields[`spa_${axis}_center`] || 0;
            const width = fields[`spa_${axis}_width`] || 0;
            const points = computeSpaCurve(center, width);
            const chartW = 420,
                chartH = 140;
            const padLeft = 34,
                padRight = 16,
                padTop = 12,
                padBottom = 22;
            const plotW = chartW - padLeft - padRight;
            const plotH = chartH - padTop - padBottom;
            const toX = (s) => padLeft + (s / SPA_SETPOINT_MAX) * plotW;
            const toY = (m) => padTop + plotH - m * plotH;
            const pathD = points
                .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.setpoint).toFixed(1)},${toY(p.multiplier).toFixed(1)}`)
                .join(" ");
            const leftLimit = Math.max(0, center - width / 2);
            const rightLimit = Math.min(SPA_SETPOINT_MAX, center + width / 2);
            return {
                width: chartW,
                height: chartH,
                padLeft,
                padRight,
                padTop,
                padBottom,
                pathD,
                centerX: toX(Math.min(SPA_SETPOINT_MAX, center)),
                leftLimitX: toX(leftLimit),
                rightLimitX: toX(rightLimit),
                midY: padTop + plotH / 2,
            };
        }

        async function reload() {
            loading.value = true;
            error.value = null;
            try {
                await MSP.promise(MSPCodes.MSP2_WING_TUNING);
                for (const def of FIELD_DEFS) {
                    if (FC.WING_TUNING[def.name] !== undefined) {
                        fields[def.name] = FC.WING_TUNING[def.name];
                    }
                }
                initialFields.value = { ...fields };

                await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
                mixerState.airframe = FC.MIXER_CONFIG.mixer;
                mixerState.reverseMotorDir = FC.MIXER_CONFIG.reverseMotorDir;

                await MSP.promise(MSPCodes.MSP_SERVO_MIX_RULES);
                // FC.SERVO_RULES may contain trailing all-zero slots;
                // strip them so the editor shows only populated rules.
                // A rule with target=0/input=0/rate=0 is indistinguishable
                // from a blank slot; firmware treats rate==0 as no-op.
                mixerState.rules = (FC.SERVO_RULES || [])
                    .filter((r) => r.rate !== 0 || r.min !== 0 || r.max !== 0)
                    .map((r) => ({ ...r }));

                initialMixerState.value = cloneMixerState(mixerState);

                // Wing auto-launch — gracefully degrade on older firmware
                // that doesn't know MSP2_WING_LAUNCH yet. FC.WING_LAUNCH
                // keeps its defaults in that case; Launch sub-tab shows
                // the canonical defaults as a best-effort starting point.
                try {
                    await MSP.promise(MSPCodes.MSP2_WING_LAUNCH);
                    for (const def of LAUNCH_FIELD_DEFS) {
                        if (FC.WING_LAUNCH[def.name] !== undefined) {
                            launchFields[def.name] = FC.WING_LAUNCH[def.name];
                        }
                    }
                    initialLaunchFields.value = { ...launchFields };
                } catch (launchErr) {
                    console.warn("[WingTuning] MSP2_WING_LAUNCH unavailable (older firmware?):", launchErr);
                }

                // Wing GPS rescue — same graceful-degrade pattern.
                try {
                    await MSP.promise(MSPCodes.MSP2_WING_GPS_RESCUE);
                    for (const def of GPS_RESCUE_FIELD_DEFS) {
                        if (FC.WING_GPS_RESCUE[def.name] !== undefined) {
                            gpsRescueFields[def.name] = FC.WING_GPS_RESCUE[def.name];
                        }
                    }
                    initialGpsRescueFields.value = { ...gpsRescueFields };
                } catch (rescueErr) {
                    console.warn("[WingTuning] MSP2_WING_GPS_RESCUE unavailable (older firmware?):", rescueErr);
                }
            } catch (e) {
                console.error("[WingTuning] reload failed:", e);
                error.value = e.message || String(e);
            } finally {
                loading.value = false;
            }
        }

        async function save() {
            saving.value = true;
            error.value = null;
            try {
                // Wing tuning fields first (atomic, via the MSP2 pair).
                for (const def of FIELD_DEFS) {
                    FC.WING_TUNING[def.name] = fields[def.name];
                }
                await MSP.promise(MSPCodes.MSP2_SET_WING_TUNING, mspHelper.crunch(MSPCodes.MSP2_SET_WING_TUNING));

                // Mixer config (airframe + motor direction).
                FC.MIXER_CONFIG.mixer = mixerState.airframe;
                FC.MIXER_CONFIG.reverseMotorDir = mixerState.reverseMotorDir;
                await MSP.promise(MSPCodes.MSP_SET_MIXER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MIXER_CONFIG));

                // Servo mix rules — firmware handler is per-rule (index-addressed).
                // Pad the local list up to MAX_SERVO_RULES with zeroed entries so
                // a shorter list overwrites previously-stored trailing rules with
                // no-op (rate=0) rather than leaving stale rules in place.
                FC.SERVO_RULES = padRulesToMax(mixerState.rules);
                await new Promise((resolve, reject) => {
                    try {
                        mspHelper.sendServoMixRules(resolve);
                    } catch (err) {
                        reject(err);
                    }
                });

                // Wing auto-launch — only write if the user touched
                // any launch field, AND swallow unknown-code errors
                // so older firmware doesn't block other saves.
                if (launchDirty.value) {
                    for (const def of LAUNCH_FIELD_DEFS) {
                        FC.WING_LAUNCH[def.name] = launchFields[def.name];
                    }
                    try {
                        await MSP.promise(
                            MSPCodes.MSP2_SET_WING_LAUNCH,
                            mspHelper.crunch(MSPCodes.MSP2_SET_WING_LAUNCH),
                        );
                    } catch (launchErr) {
                        console.warn("[WingTuning] MSP2_SET_WING_LAUNCH failed:", launchErr);
                    }
                }

                // Wing GPS rescue — same dirty-gated, swallow-unknown pattern.
                if (gpsRescueDirty.value) {
                    for (const def of GPS_RESCUE_FIELD_DEFS) {
                        FC.WING_GPS_RESCUE[def.name] = gpsRescueFields[def.name];
                    }
                    try {
                        await MSP.promise(
                            MSPCodes.MSP2_SET_WING_GPS_RESCUE,
                            mspHelper.crunch(MSPCodes.MSP2_SET_WING_GPS_RESCUE),
                        );
                    } catch (rescueErr) {
                        console.warn("[WingTuning] MSP2_SET_WING_GPS_RESCUE failed:", rescueErr);
                    }
                }

                await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);

                initialFields.value = { ...fields };
                initialLaunchFields.value = { ...launchFields };
                initialGpsRescueFields.value = { ...gpsRescueFields };
                initialMixerState.value = cloneMixerState(mixerState);
            } catch (e) {
                console.error("[WingTuning] save failed:", e);
                error.value = e.message || String(e);
            } finally {
                saving.value = false;
            }
        }

        function padRulesToMax(rules) {
            const padded = rules.slice(0, MAX_SERVO_RULES).map((r) => ({ ...r }));
            while (padded.length < MAX_SERVO_RULES) {
                padded.push({ target: 0, input: 0, rate: 0, speed: 0, min: 0, max: 0, box: 0 });
            }
            return padded;
        }

        // Apply a full preset: yaw_type, airframe, servo rules, motor mix.
        // All of MSP gets written first (atomic), then the CLI one-shot
        // applies mmix + triggers a save+reboot. User interaction is
        // blocked behind a modal during the whole flow.
        async function applyPreset(id) {
            const preset = PLANE_PRESETS[id];
            if (!preset || applyingPreset.value || loading.value || saving.value) {
                return;
            }
            applyingPreset.value = true;
            // Move the wiring reference panel to the preset being
            // applied. Stays set across the reboot because the ref
            // defaults to something on remount anyway, and the user
            // can still pick a different one after.
            wiringPresetId.value = id;
            error.value = null;
            // Halt update_live_status polling for the full MSP+CLI+reboot
            // window. Otherwise the 250 ms MSP_STATUS cadence queues up
            // dozens of calls that all time out during the disconnect,
            // spamming the console and slowing the reconnect.
            connectionStore.pauseLiveData();
            try {
                // Stage reactive state. The existing diffThrustMode watcher
                // zeroes s_yaw when yaw_type flips to DIFF_THRUST.
                fields.yaw_type = preset.yawType;
                mixerState.airframe = preset.mixerIndex;
                mixerState.reverseMotorDir = 0;
                mixerState.rules = preset.rules.map((r) => ({ ...r }));

                // MSP writes (wing tuning fields, mixer type, servo rules).
                for (const def of FIELD_DEFS) {
                    FC.WING_TUNING[def.name] = fields[def.name];
                }
                await MSP.promise(MSPCodes.MSP2_SET_WING_TUNING, mspHelper.crunch(MSPCodes.MSP2_SET_WING_TUNING));

                FC.MIXER_CONFIG.mixer = mixerState.airframe;
                FC.MIXER_CONFIG.reverseMotorDir = mixerState.reverseMotorDir;
                await MSP.promise(MSPCodes.MSP_SET_MIXER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MIXER_CONFIG));

                // Servo mix rules via MSP_SET_SERVO_MIX_RULE. The "Not used"
                // comment in MSPCodes.js is STALE — modern BF firmware
                // accepts this MSP code; the Save button in this same tab
                // has always used it and bench-confirmed it persists smix
                // rules correctly. Previous attempts to replace it with
                // CLI `smix` emissions failed on bench (smix rules dropped
                // at save time); the MSP path is the tested-working route.
                FC.SERVO_RULES = padRulesToMax(mixerState.rules);
                await new Promise((resolve, reject) => {
                    try {
                        mspHelper.sendServoMixRules(resolve);
                    } catch (err) {
                        reject(err);
                    }
                });

                // Drop any queued MSP calls before we trigger the reboot
                // so pending MSP_STATUS / etc don't pile up waiting for a
                // response that'll never come until the FC is back.
                connectionStore.clearMspQueue();

                // Resource remap + motor mix + save + reboot, one CLI batch.
                //
                // smix rules already went via MSP above (see block a few
                // lines up). That path is what the Save button has
                // always used and what the user's bench-confirmed manual
                // flow relies on; its "Not used" comment in MSPCodes.js
                // is stale. The CLI batch here handles the two things
                // MSP can't do cleanly from the configurator side: pin
                // resource remap (no MSP for this) and motor mix (no MSP
                // for mmix).
                //
                // Servo count still matters for the remap — on quad-
                // declared boards (4M/0S) we need to bind enough SERVO
                // resources to back the preset's smix rules, otherwise
                // smix rules targeting S3/S4 have no physical pad.
                //
                // Board wiring (discrete vs AIO) comes from the Hardware
                // sub-tab so both apply paths stay consistent. LED_STRIP
                // / UART release stay OFF here — opt-ins via Hardware
                // sub-tab only.
                if (!hardwareAnalysis.value) {
                    await loadHardware();
                }
                // Phase 2.5 resource plan: surgical release/bind limited to
                // exactly the SERVO/MOTOR indices the preset actually uses.
                //
                // Pin Assignment panel overrides only apply when the clicked
                // preset matches the one the panel is tracking
                // (wiringPresetId). Otherwise we fall back to defaults so
                // clicking a different preset than the panel shows doesn't
                // apply stale picks.
                const panelMatches = wiringPresetId.value === id;
                const planOptions = panelMatches
                    ? {
                        picks: { ...padOverrides.servo },
                        motorPicks: { ...padOverrides.motor },
                        allowLedStrip: allowLedStripPad.value,
                        allowUartRelease: [...allowUartPads],
                        padDefaults: padDefaults.value,
                    }
                    : { padDefaults: padDefaults.value };
                const presetPlan = hardwareAnalysis.value
                    ? computePresetResourcePlan(hardwareAnalysis.value, preset, planOptions)
                    : { cliLines: [], warnings: [] };
                const resourceLines = presetPlan.cliLines;
                if (presetPlan.warnings && presetPlan.warnings.length > 0) {
                    for (const w of presetPlan.warnings) {
                        console.warn("[WingTuning] preset plan warning:", w.code, w.message);
                    }
                }
                const mmixLines = ["mmix reset"].concat(
                    preset.mmix.map(
                        (m, i) =>
                            `mmix ${i} ${m.throttle.toFixed(3)} ${m.roll.toFixed(3)} ${m.pitch.toFixed(3)} ${m.yaw.toFixed(3)}`,
                    ),
                );
                // applyCliLines auto-appends `save` if the batch doesn't end with it.
                // The save commits BOTH the MSP-written smix rules AND the
                // CLI-written resource/mmix changes to EEPROM, then reboots.
                await applyCliLines([...resourceLines, ...mmixLines]);

                // Mark current state as the new baseline so when the user
                // reconnects post-reboot, the dirty indicator starts clean.
                initialFields.value = { ...fields };
                initialMixerState.value = cloneMixerState(mixerState);
            } catch (e) {
                console.error("[WingTuning] preset apply failed:", e);
                error.value = e.message || String(e);
            } finally {
                // Keep the modal up long enough for the FC reboot +
                // reconnect cycle to settle. Typical USB reconnect
                // window is 2-4 s; 5 s is a safe cap. After settle,
                // resume live data AND explicitly reload tab state —
                // the CLI path persisted resources + mmix + smix to
                // firmware but Vue state here is frozen at pre-reboot
                // values. Without the reload the Mixer tab's
                // Function→Output Mapping table shows 0 rules after
                // apply even though `diff all` confirms firmware has
                // the rules (observed on FURYF4OSD bench).
                setTimeout(async () => {
                    connectionStore.resumeLiveData();
                    try {
                        await reload();
                    } catch (reloadErr) {
                        console.warn("[WingTuning] post-apply reload failed:", reloadErr);
                    }
                    applyingPreset.value = false;
                }, 5000);
            }
        }

        // Append rules from a quick-add template (or a single "raw" rule).
        // Silently switches the airframe to MIXER_CUSTOM_AIRPLANE (24)
        // because custom smix rules only reach physical outputs on that
        // mixer. User still clicks Save to commit — the MSP write path
        // covers airframe + rules in one EEPROM_WRITE, no reboot needed
        // unless the template specifies mmix (these don't).
        function addTemplate(id) {
            const template = QUICK_ADD_TEMPLATES.find((t) => t.id === id);
            if (!template) {
                return;
            }
            // Drop the click entirely if the whole template wouldn't fit.
            // Better to do nothing than push a partial function block.
            const spaceLeft = MAX_SERVO_RULES - mixerState.rules.length;
            if (spaceLeft < template.rules.length) {
                return;
            }
            if (mixerState.airframe !== CUSTOM_AIRPLANE_MIXER) {
                mixerState.airframe = CUSTOM_AIRPLANE_MIXER;
            }
            for (const r of template.rules) {
                mixerState.rules.push({ ...r });
            }
        }

        function removeRule(index) {
            mixerState.rules.splice(index, 1);
        }

        function onTabReady() {
            GUI.content_ready();
            if (apiOk.value) {
                reload();
            }
        }

        return {
            PID_GAIN_MAX,
            SPA_SETPOINT_MAX,
            SPA_WIDTH_SLIDER_MAX: 500,
            INPUT_LABELS,
            BOX_LABELS,
            MAX_SERVO_RULES,
            PLANE_SLOT_OPTIONS,
            CUSTOM_AIRPLANE_MIXER,
            LAUNCH_FIELD_DEFS,
            GPS_RESCUE_FIELD_DEFS,
            fields,
            launchFields,
            gpsRescueFields,
            hardwareAnalysis,
            hardwareLoading,
            hardwareError,
            loadHardware,
            padOverrides,
            allowLedStripPad,
            allowUartPads,
            toggleUartPadAllow,
            pinAssignmentRows,
            pinAssignmentExtras,
            pinAssignmentPlan,
            pinAssignmentPreset,
            candidatesForServo,
            candidatesForMotor,
            setPadOverride,
            clearPadOverrides,
            candidateSourceLabel,
            padMappingRows,
            applyingPinAssignment,
            applyPinAssignment,
            loading,
            saving,
            error,
            apiOk,
            FC,
            dirty,
            diffThrustMode,
            detectedCellCount,
            onCellCountChange,
            tpaChart,
            spaChart,
            mixerState,
            mixerDirty,
            yawConflict,
            applyingPreset,
            activeSubTab,
            SUB_TAB_IDS,
            wiringPresetId,
            currentWiring,
            applyPreset,
            QUICK_ADD_TEMPLATES,
            addTemplate,
            removeRule,
            presetIds: Object.keys(PLANE_PRESETS),
            presets: PLANE_PRESETS,
            reload,
            save,
            onTabReady,
        };
    },

    mounted() {
        this.onTabReady();
    },
});
</script>

<style scoped>
table.fields {
    width: 100%;
    margin-top: 8px;
    border-collapse: collapse;
}
table.fields th,
table.fields td {
    padding: 4px 8px;
    text-align: left;
    vertical-align: middle;
}
table.fields input[type="number"] {
    width: 100px;
}
table.fields input[type="range"] {
    width: 100%;
    min-width: 120px;
}
table.fields select {
    min-width: 140px;
}
button {
    margin-right: 8px;
}
.curve_container {
    margin-top: 12px;
    display: flex;
    justify-content: center;
}
.curve_svg {
    background: var(--surface-200, rgba(255, 255, 255, 0.04));
    border-radius: 4px;
}
.curve_hint {
    margin-top: 8px;
    color: #888;
    font-style: italic;
}
.preset_buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
}
.preset_button {
    padding: 6px 14px;
    background: var(--surface-200, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--surface-400, rgba(255, 255, 255, 0.15));
    border-radius: 4px;
    cursor: pointer;
}
.preset_button:hover:not(:disabled) {
    background: var(--surface-300, rgba(255, 255, 255, 0.08));
}
.preset_hint {
    margin-top: 8px;
    color: #888;
    font-size: 0.9em;
    font-style: italic;
}
.wiring_panel {
    margin-top: 14px;
    padding: 10px 14px;
    background: var(--surface-100, rgba(255, 255, 255, 0.03));
    border-left: 3px solid var(--primary-500, #ffb800);
    border-radius: 3px;
}
.wiring_header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
    font-size: 0.95em;
}
.wiring_selector_label {
    color: #888;
    font-weight: normal;
    font-size: 0.9em;
    display: flex;
    align-items: center;
    gap: 6px;
}
.wiring_selector {
    min-width: 180px;
}
.wiring_table {
    width: auto;
    margin-top: 4px;
    border-collapse: collapse;
}
.wiring_table th,
.wiring_table td {
    padding: 3px 14px 3px 0;
    text-align: left;
    font-size: 0.9em;
}
.wiring_table th {
    color: #888;
    font-weight: normal;
}
.wiring_pad {
    font-family: monospace;
    font-weight: 600;
}
.wiring_hint {
    margin: 8px 0 0 0;
    color: #888;
    font-size: 0.85em;
    font-style: italic;
}
.rule_actions {
    margin-top: 10px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}
.quick_add_label {
    font-size: 0.9em;
    color: #aaa;
    margin-right: 4px;
}
.quick_add_button {
    padding: 5px 12px;
    cursor: pointer;
    font-size: 0.9em;
    background: var(--surface-200, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--surface-400, rgba(255, 255, 255, 0.15));
    border-radius: 4px;
}
.quick_add_button:hover:not(:disabled) {
    background: var(--surface-300, rgba(255, 255, 255, 0.08));
}
.quick_add_button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
.quick_add_hint {
    margin-top: 8px;
    color: #888;
    font-size: 0.85em;
    font-style: italic;
}
.rule_count {
    color: #888;
    font-size: 0.9em;
}
.rule_delete {
    width: 24px;
    height: 24px;
    padding: 0;
    line-height: 1;
    cursor: pointer;
    color: var(--error-500, #c33);
    background: transparent;
    border: 1px solid var(--error-500, #c33);
    border-radius: 3px;
}
.rule_delete:hover:not(:disabled) {
    background: var(--error-transparent-1, rgba(200, 60, 60, 0.1));
}
.empty_row {
    text-align: center;
    color: #888;
    font-style: italic;
    padding: 12px;
}
.mixer_info {
    margin-top: 6px;
    margin-bottom: 6px;
    font-size: 0.95em;
}
.yaw_conflict_banner {
    margin: 8px 0 12px 0;
    padding: 10px 14px;
    background: var(--error-transparent-1, rgba(200, 60, 60, 0.1));
    border: 1px solid var(--error-500, #c33);
    border-radius: 4px;
    color: var(--error-500, #c33);
    font-weight: 500;
}
.preset_modal_overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}
.preset_modal_box {
    background: var(--surface-100, #222);
    border: 1px solid var(--surface-400, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    padding: 24px 32px;
    max-width: 400px;
    text-align: center;
}
.preset_modal_title {
    font-size: 1.1em;
    font-weight: 500;
    margin-bottom: 8px;
}
.preset_modal_sub {
    color: #888;
    font-size: 0.95em;
}
.subtab_bar {
    display: flex;
    gap: 2px;
    margin: 12px 0 14px 0;
    border-bottom: 2px solid var(--surface-400, rgba(255, 255, 255, 0.15));
    padding-left: 4px;
}
.subtab_button {
    padding: 8px 18px;
    background: transparent;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    cursor: pointer;
    font-size: 0.95em;
    color: #aaa;
    margin-bottom: -2px;
}
.subtab_button:hover:not(.active) {
    background: var(--surface-200, rgba(255, 255, 255, 0.04));
    color: var(--text, #fff);
}
.subtab_button.active {
    background: var(--surface-200, rgba(255, 255, 255, 0.04));
    border-color: var(--surface-400, rgba(255, 255, 255, 0.15));
    border-bottom: 2px solid var(--surface-200, rgba(255, 255, 255, 0.04));
    color: var(--primary-500, #ffb800);
    font-weight: 500;
}
.subtab_placeholder {
    padding: 30px 20px;
    color: #888;
    font-style: italic;
    text-align: center;
}
.autotrim_heading {
    margin-top: 10px;
    margin-bottom: 4px;
    font-weight: 500;
    font-size: 0.95em;
}
.autotrim_list {
    margin: 0 0 8px 0;
    padding-left: 24px;
    font-size: 0.9em;
}
.autotrim_list li {
    margin: 3px 0;
}
.autotrim_hint {
    margin-top: 10px;
    color: #888;
    font-size: 0.85em;
    font-style: italic;
}
.launch_unit {
    color: #888;
    font-size: 0.85em;
    white-space: nowrap;
    padding-left: 4px;
}
.launch_hint {
    margin-top: 10px;
    color: #888;
    font-size: 0.85em;
    font-style: italic;
}
.hw_status {
    margin-left: 12px;
    color: #888;
    font-size: 0.9em;
    font-style: italic;
}
.hw_error {
    color: #c03030;
    margin: 6px 0;
}
.hw_muted {
    color: #888;
}
.hw_ok {
    color: #2a7;
    font-weight: 500;
}
.hw_warn {
    color: #c87c00;
    font-weight: 500;
}
.hw_summary,
.hw_notices {
    margin: 6px 0 14px 18px;
    padding: 0;
}
.hw_summary li,
.hw_notices li {
    padding: 2px 0;
}
.hw_severity_info {
    color: #607090;
}
.hw_severity_warn {
    color: #c87c00;
}
.hw_severity_error {
    color: #c03030;
    font-weight: 500;
}
.hw_motor_toggle {
    display: flex;
    gap: 16px;
    margin: 8px 0;
}
.hw_motor_toggle label {
    cursor: pointer;
    padding: 4px 10px;
    border: 1px solid #444;
    border-radius: 3px;
    user-select: none;
}
.hw_motor_toggle input[type="radio"] {
    margin-right: 6px;
    vertical-align: middle;
}
/* ─── Pin Assignment panel (Mixer sub-tab) ─── */
.pin_assign_header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 8px;
}
.pin_assign_desc {
    flex: 1;
    margin: 0;
}
.pin_assign_reload {
    flex: 0 0 auto;
    align-self: center;
    font-size: 0.9em;
    padding: 4px 10px;
    border: 1px solid #555;
    border-radius: 3px;
    color: #ccc;
    text-decoration: none;
    white-space: nowrap;
}
.pin_assign_reload:hover:not(.disabled) {
    background: #3a3a3a;
    color: #fff;
}
.pin_assign_reload.disabled {
    opacity: 0.5;
    pointer-events: none;
}
.pin_assign_table {
    width: 100%;
    max-width: 680px;
    border-collapse: collapse;
    margin: 8px 0 12px 0;
}
.pin_assign_table th,
.pin_assign_table td {
    padding: 4px 14px 4px 0;
    text-align: left;
    font-size: 0.9em;
    vertical-align: middle;
}
.pin_assign_table th {
    color: #888;
    font-weight: normal;
    border-bottom: 1px solid #333;
}
.pin_assign_table th:nth-child(1),
.pin_assign_table td:nth-child(1) {
    width: 110px;
}
.pin_assign_table th:nth-child(2),
.pin_assign_table td:nth-child(2) {
    width: 90px;
}
.pin_assign_table td.pin_assign_label {
    font-family: monospace;
    font-weight: 600;
}
.pin_assign_table td.pin_assign_current {
    font-family: monospace;
    color: #aaa;
}
.pin_assign_table select {
    width: 100%;
    max-width: 380px;
}
.pin_assign_extras {
    margin: 10px 0;
    padding: 8px 12px;
    background: rgba(255, 180, 0, 0.05);
    border-left: 3px solid rgba(255, 180, 0, 0.4);
    font-size: 0.9em;
}
.pin_assign_extras ul {
    margin: 4px 0 0 0;
    padding-left: 18px;
}
.pin_assign_extras li {
    font-family: monospace;
    color: #bbb;
}
.pin_assign_optin {
    margin: 6px 0;
    font-size: 0.9em;
}
.pin_assign_optin label {
    display: block;
    margin: 2px 0;
    cursor: pointer;
}
.pin_assign_actions {
    margin: 12px 0 8px 0;
}
.pin_assign_hint {
    margin-top: 10px;
    font-size: 0.85em;
    color: #888;
    font-style: italic;
}
.pin_assign_mapping {
    margin: 8px 0 16px 0;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.03);
    border-left: 3px solid rgba(120, 200, 120, 0.4);
}
.pin_assign_mapping strong {
    display: block;
    margin-bottom: 6px;
    font-size: 0.9em;
    color: #aaa;
}
.pin_assign_mapping_table {
    width: 100%;
    max-width: 480px;
    border-collapse: collapse;
    font-size: 0.88em;
}
.pin_assign_mapping_table th,
.pin_assign_mapping_table td {
    padding: 3px 12px 3px 0;
    text-align: left;
}
.pin_assign_mapping_table th {
    color: #888;
    font-weight: normal;
    border-bottom: 1px solid #333;
}

.hw_cli_preview {
    background: #1a1a1a;
    color: #ddd;
    padding: 10px 12px;
    border-radius: 3px;
    font-family: "Consolas", "Menlo", monospace;
    font-size: 0.85em;
    line-height: 1.4;
    overflow-x: auto;
    margin: 8px 0;
    white-space: pre;
}
</style>
