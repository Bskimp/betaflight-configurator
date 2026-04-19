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
import { applyMotorMix } from "../../js/utils/wingMixerCli.js";
import { readCli, parseResourceShow, parseTimerShow, parseDmaShow } from "../../js/utils/cliOneShot.js";
import { analyzeWingResources } from "../../js/utils/wingResourceAnalyzer.js";
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
                hardwareAnalysis.value = analyzeWingResources({
                    resourceShow: parseResourceShow(rs.lines),
                    timerShow: parseTimerShow(ts.lines),
                    dmaShow: parseDmaShow(ds.lines),
                });
            } catch (e) {
                console.error("[WingTuning] Hardware load failed:", e);
                hardwareError.value = e.message || String(e);
            } finally {
                hardwareLoading.value = false;
            }
        }

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
        const wiringPresetId = ref(PRESET_IDS[0] || null);

        const currentWiring = computed(() => {
            if (!wiringPresetId.value) {
                return null;
            }
            return PLANE_PRESETS[wiringPresetId.value]?.wiring || null;
        });

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

                // Motor mix + save + reboot via CLI one-shot. BF has no MSP
                // for mmix today. `save` in CLI persists AND reboots, so no
                // explicit EEPROM_WRITE or MSP_REBOOT needed.
                await applyMotorMix(preset.mmix);

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
                // window is 2-4 s; 5 s is a safe cap.
                setTimeout(() => {
                    connectionStore.resumeLiveData();
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
</style>
