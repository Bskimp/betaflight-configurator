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

                <!-- Plane Setup Wizard launcher card — persistent across
                     sub-tabs because the wizard triggers FC reboots and
                     the user shouldn't have to renavigate to restart it.
                     Uses the same `.update` link-button style as the
                     bottom Save/Reload toolbar so the buttons read as
                     interactive controls, not plain text. -->
                <div class="grid-row">
                    <div class="grid-col col12">
                        <div class="gui_box">
                            <div class="spacer wing_launcher_buttons">
                                <div class="btn save_btn">
                                    <a
                                        class="update"
                                        href="#"
                                        :class="{ disabled: loading || saving }"
                                        @click.prevent="openWizard"
                                    >
                                        {{ $t("wingLauncherStartWizard") }}
                                    </a>
                                </div>
                                <div class="btn save_btn">
                                    <a
                                        class="update"
                                        href="#"
                                        :class="{ disabled: loading || saving }"
                                        @click.prevent="showResetDialog = true"
                                    >
                                        {{ $t("wingLauncherResetConfig") }}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Sub-tab navigation. Hidden sub-tabs are filtered by
                     wingCapabilities — Launch / GPS Rescue / Autoland only
                     render when the FC advertises support for them. -->
                <div class="subtab_bar">
                    <button
                        v-for="id in availableSubTabIds"
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
                                    <label class="diff_thrust_toggle">
                                        <input
                                            type="checkbox"
                                            :checked="motorCount === 2"
                                            :disabled="loading || applyingPreset"
                                            @change="motorCount = $event.target.checked ? 2 : 1"
                                        />
                                        {{ $t("wingMixerDiffThrustToggle") }}
                                        <span class="diff_thrust_hint">{{ $t("wingMixerDiffThrustHint") }}</span>
                                    </label>
                                    <p class="preset_hint">{{ $t("wingMixerPresetHint") }}</p>
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
                                        <option v-if="combinedYawSupported" value="COMBINED">COMBINED</option>
                                    </select>
                                    <div v-if="fields.yaw_type === 'COMBINED'" class="yaw_blend_panel">
                                        <p class="yaw_blend_desc">{{ $t("wingYawBlendDesc") }}</p>
                                        <label class="yaw_blend_row">
                                            <span class="yaw_blend_label">{{ $t("wingYawBlendFloor") }}</span>
                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                step="1"
                                                v-model.number="fields.yaw_blend_floor"
                                                :disabled="loading"
                                            />
                                            <span class="yaw_blend_value">{{ fields.yaw_blend_floor }}%</span>
                                        </label>
                                        <label class="yaw_blend_row">
                                            <span class="yaw_blend_label">{{ $t("wingYawBlendCrossover") }}</span>
                                            <input
                                                type="range"
                                                min="1"
                                                max="99"
                                                step="1"
                                                v-model.number="fields.yaw_blend_crossover"
                                                :disabled="loading"
                                            />
                                            <span class="yaw_blend_value">{{ fields.yaw_blend_crossover }}%</span>
                                        </label>
                                        <p class="yaw_blend_hint">{{ $t("wingYawBlendHint") }}</p>
                                    </div>
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
                                    <p class="pin_assign_desc">{{ $t("wingPinAssignDesc") }}</p>
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
                                        <span
                                            v-if="padDefaults?.source"
                                            class="pin_assign_source"
                                            :class="'pin_assign_source_' + padDefaults.source"
                                            :title="
                                                padDefaults.source === 'firmware'
                                                    ? $t('wingPinAssignSrcFirmwareTip')
                                                    : $t('wingPinAssignSrcSnapshotTip')
                                            "
                                        >
                                            {{
                                                padDefaults.source === "firmware"
                                                    ? $t("wingPinAssignSrcFirmware")
                                                    : $t("wingPinAssignSrcSnapshot")
                                            }}
                                        </span>
                                        <table class="pin_assign_mapping_table">
                                            <thead>
                                                <tr>
                                                    <th>{{ $t("wingPinAssignMappingDefault") }}</th>
                                                    <th>{{ $t("wingPinAssignMappingPad") }}</th>
                                                    <th>{{ $t("wingPinAssignMappingAf") }}</th>
                                                    <th>{{ $t("wingPinAssignMappingNow") }}</th>
                                                    <th
                                                        class="pin_assign_allowlist_col"
                                                        :title="$t('wingPinAssignMappingPhysicalTip')"
                                                    >
                                                        {{ $t("wingPinAssignMappingPhysical") }}
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr
                                                    v-for="row in padMappingRows"
                                                    :key="row.defaultLabel + ':' + row.pad"
                                                >
                                                    <td class="pin_assign_label">{{ row.defaultLabel }}</td>
                                                    <td class="pin_assign_current">
                                                        {{ row.pad }}
                                                        <span v-if="row.timer !== null" class="hw_muted">
                                                            — TIM{{ row.timer }} CH{{ row.channel }}
                                                        </span>
                                                    </td>
                                                    <td class="pin_assign_af_cell">
                                                        <span
                                                            v-if="row.currentAF !== null"
                                                            class="pin_assign_af_current"
                                                        >
                                                            AF{{ row.currentAF }}
                                                        </span>
                                                        <span v-else class="hw_muted">—</span>
                                                        <span
                                                            v-if="row.altAfs.length > 0"
                                                            class="pin_assign_af_alts"
                                                            :title="
                                                                row.altAfs
                                                                    .map(
                                                                        (a) =>
                                                                            'AF' +
                                                                            a.af +
                                                                            ' → TIM' +
                                                                            a.timer +
                                                                            ' CH' +
                                                                            a.channel +
                                                                            (a.complementary ? 'N' : ''),
                                                                    )
                                                                    .join('\n')
                                                            "
                                                        >
                                                            +{{ row.altAfs.length }} alt
                                                        </span>
                                                    </td>
                                                    <td>{{ row.currentLabel }}</td>
                                                    <td class="pin_assign_allowlist_col">
                                                        <input
                                                            type="checkbox"
                                                            :checked="
                                                                !padAllowlist.has(row.pad?.toUpperCase?.() ?? row.pad)
                                                            "
                                                            :title="$t('wingPinAssignMappingPhysicalTip')"
                                                            @change="togglePadInAllowlist(row.pad)"
                                                        />
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    <template v-if="hardwareAnalysis && pinAssignmentPlan">
                                        <div
                                            v-if="pinAssignmentInfeasible"
                                            class="pin_assign_infeasible_banner"
                                            :title="$t('wingPinAssignNotEnoughPadsTip')"
                                        >
                                            ⚠ {{ $t("wingPinAssignNotEnoughPads") }}
                                        </div>
                                        <table class="pin_assign_table">
                                            <thead>
                                                <tr>
                                                    <th>{{ $t("wingPinAssignResource") }}</th>
                                                    <th>{{ $t("wingPinAssignCurrent") }}</th>
                                                    <th>{{ $t("wingPinAssignPickedPad") }}</th>
                                                    <th></th>
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
                                                                :key="c.pad + ':' + (c.af ?? '')"
                                                                :value="c.pad + (c.af != null ? '|' + c.af : '')"
                                                            >
                                                                {{ c.pad }}
                                                                <template v-if="c.timer">
                                                                    — TIM{{ c.timer
                                                                    }}<template v-if="c.channel">
                                                                        CH{{ c.channel
                                                                        }}<template v-if="c.complementary"
                                                                            >N</template
                                                                        ></template
                                                                    >
                                                                </template>
                                                                <template v-if="c.source === 'alt-af'">
                                                                    [AF{{ c.af }}]
                                                                </template>
                                                                ({{ candidateSourceLabel(c) }})
                                                            </option>
                                                        </select>
                                                        <span
                                                            v-if="row.timerRemap"
                                                            class="pin_assign_timer_remap_badge"
                                                            :title="
                                                                $t('wingPinAssignTimerRemapTooltip', {
                                                                    pad: row.pickedPad,
                                                                    fromAF: row.timerRemap.fromAF ?? '?',
                                                                    toAF: row.timerRemap.toAF,
                                                                    timer: row.timerRemap.toTimer,
                                                                    channel: row.timerRemap.toChannel,
                                                                })
                                                            "
                                                        >
                                                            {{
                                                                $t("wingPinAssignTimerRemapBadge", {
                                                                    fromAF: row.timerRemap.fromAF ?? "?",
                                                                    toAF: row.timerRemap.toAF,
                                                                })
                                                            }}
                                                        </span>
                                                        <span
                                                            v-if="row.dma && row.dma.kind === 'stream'"
                                                            class="pin_assign_dma_badge"
                                                            :title="
                                                                $t('wingPinAssignDmaTooltip', {
                                                                    pad: row.pickedPad,
                                                                    controller: row.dma.controller,
                                                                    stream: row.dma.stream,
                                                                })
                                                            "
                                                        >
                                                            {{ row.dma.label }}
                                                        </span>
                                                        <span
                                                            v-else-if="row.dma && row.dma.kind === 'bitbang'"
                                                            class="pin_assign_dma_bitbang_badge"
                                                            :title="$t('wingPinAssignDmaBitBangTooltip')"
                                                        >
                                                            {{ $t("wingPinAssignDmaBitBangBadge") }}
                                                        </span>
                                                    </td>
                                                    <td class="pin_assign_remove_cell">
                                                        <button
                                                            v-if="
                                                                row.kind === 'servo' ||
                                                                (row.kind === 'motor' && row.index > 1)
                                                            "
                                                            type="button"
                                                            class="pin_assign_remove"
                                                            :title="$t('wingPinAssignRemoveTip')"
                                                            :disabled="loading || applyingPreset"
                                                            @click="removeAssignment(row.kind, row.index)"
                                                        >
                                                            ✕
                                                        </button>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        <div class="pin_assign_add_row">
                                            <button
                                                type="button"
                                                class="pin_assign_add"
                                                :disabled="loading || applyingPreset"
                                                @click="addServoPin"
                                            >
                                                + {{ $t("wingPinAssignAddServo") }}
                                            </button>
                                        </div>

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

                                        <p class="pin_assign_hint">{{ $t("wingPinAssignSaveHint") }}</p>
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

                <!-- ═══ Autoland sub-tab — 22 wing autoland config fields. ═══
                     Same schema-driven row pattern as Launch / GPS Rescue.
                     Master `enabled` defaults OFF; autoland never engages
                     until the pilot flips it to 1. Four trigger flags
                     (manual / rth-timeout / low-batt / failsafe) gate
                     individual entry paths. Live-state visibility is
                     deferred to OSD + blackbox rather than a poll panel
                     here. -->
                <template v-if="activeSubTab === 'autoland'">
                    <div class="grid-row">
                        <div class="grid-col col12">
                            <div class="gui_box">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("wingSubTabAutolandTitle") }}</div>
                                </div>
                                <div class="spacer">
                                    <p>{{ $t("wingAutolandDesc") }}</p>
                                    <p class="autoland_warning">{{ $t("wingAutolandWarning") }}</p>
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
                                            <tr v-for="def in AUTOLAND_FIELD_DEFS" :key="def.name">
                                                <td :title="$t('wingAutolandHelp_' + def.name)">
                                                    {{ $t("wingAutolandLabel_" + def.name) }}
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        :min="def.min"
                                                        :max="def.max"
                                                        v-model.number="autolandFields[def.name]"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="range"
                                                        :min="def.min"
                                                        :max="def.max"
                                                        v-model.number="autolandFields[def.name]"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td class="launch_unit">{{ def.unit }}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <p class="launch_hint">{{ $t("wingAutolandHint") }}</p>
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
                                    <p v-if="hardwareLoading" class="hw_status">
                                        {{ $t("wingHardwareLoading") }}
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

        <!-- Reset wing config confirmation dialog. Lists what's wiped vs
             preserved so the user knows what survives the reset (UART,
             RX, modes, battery, OSD, VTX, LED, failsafe). -->
        <Dialog v-if="apiOk" v-model="showResetDialog" :title="$t('wingResetDialogTitle')">
            <p>{{ $t("wingResetDialogBody") }}</p>
            <ul class="wing_reset_list">
                <li>
                    <strong>{{ $t("wingResetWipesLabel") }}:</strong> {{ $t("wingResetWipesItems") }}
                </li>
                <li>
                    <strong>{{ $t("wingResetPreservesLabel") }}:</strong> {{ $t("wingResetPreservesItems") }}
                </li>
            </ul>
            <div class="dialog-buttons">
                <button type="button" class="btn" @click="showResetDialog = false">
                    {{ $t("cancel") }}
                </button>
                <button type="button" class="btn btn-danger" @click="performResetWingConfig">
                    {{ $t("wingResetDialogConfirm") }}
                </button>
            </div>
        </Dialog>

        <!-- Plane Setup Wizard — modal mount. Auto-resumes via
             wizardResumeState if a marker was found post-reboot. All
             wizard apply paths route through callbacks so the parent
             owns MSP/CLI commits + reboot timing + marker persistence. -->
        <PlaneSetupWizard
            v-if="apiOk"
            v-model="wizardOpen"
            :armed="wizardArmed"
            :motor-count="motorCount"
            :cell-count="wizardCellCount"
            :airframes="wizardAirframes"
            :resume-state="wizardResumeState"
            :current-resources="wizardCurrentResources"
            :pad-defaults="wizardPadDefaults"
            :extra-apply-rows="wizardExtraApplyRows"
            :rules="mixerState.rules"
            :hardware-analysis="hardwareAnalysis"
            :expected-motors="wizardExpectedMotors"
            :apply-callback="wizardApplyCallback"
            :apply-direction-callback="wizardApplyDirectionCallback"
            :apply-endpoints-callback="wizardApplyEndpointsCallback"
            :apply-remap-callback="wizardApplyRemapCallback"
            :apply-scan-callback="wizardApplyScanCallback"
            :apply-motors-callback="wizardApplyMotorsCallback"
            :apply-motor-scan-prep-callback="wizardApplyMotorScanPrepCallback"
            :apply-motor-final-callback="wizardApplyMotorFinalCallback"
            :apply-yaw-flip-callback="wizardApplyYawFlipCallback"
            @close="closeWizard"
            @complete="finishWizard"
            @airframe-selected="onWizardAirframeSelected"
            @motor-count-selected="onWizardMotorCountSelected"
            @cell-count-selected="onWizardCellCountSelected"
        />
    </BaseTab>
</template>

<script>
import { defineComponent, reactive, ref, computed, watch, nextTick } from "vue";
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
import { autoCleanCliLines, fullWingResetCliLines } from "../../js/utils/wingReset.js";
import { planeDefaultsCliLines, planeTuningStartingPoints } from "../../js/utils/wingPlaneDefaults.js";
import { wizardServoPulseCleanup } from "../../js/utils/wingServoPulse.js";
import {
    readCli,
    parseResourceShow,
    parseTimerShow,
    parseDmaShow,
    parseTimerDump,
    parseDmaPinDefaults,
    readResourceDefaults,
    discoverPadTimerOptions,
    readDmaPinDefaultsConcatenated,
} from "../../js/utils/cliOneShot.js";
import { analyzeWingResources } from "../../js/utils/wingResourceAnalyzer.js";
import { mcuFamilyFromName } from "../../js/utils/mcuFamily.js";
import { loadAllowlist, saveAllowlist, applyAllowlist, togglePad } from "../../js/utils/wingPadAllowlist.js";
import { computePresetResourcePlan, candidatePadsForSlot } from "../../js/utils/wingRemapRecommender.js";
import { useConnectionStore } from "../../stores/connection";
import PlaneSetupWizard from "../wing/PlaneSetupWizard.vue";
import Dialog from "../elements/Dialog.vue";

const PID_GAIN_MAX = 200;

// Field definitions: name → parse/format type. "int" and "string" only.
// Enums (lookup tables) are strings; everything else is int.
const FIELD_DEFS = [
    // S-term
    { name: "s_pitch", type: "int" },
    { name: "s_roll", type: "int" },
    { name: "s_yaw", type: "int" },
    // Yaw type + COMBINED-mode blend tuning (airspeed-weighted crossfade
    // between rudder servo and motor differential; ignored for RUDDER /
    // DIFF_THRUST modes but still round-tripped).
    { name: "yaw_type", type: "string" },
    { name: "yaw_blend_floor", type: "int" },
    { name: "yaw_blend_crossover", type: "int" },
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

// Wing autoland fields — order + types match wingAutolandSchema.js
// and pg/autoland.h PG_RESET defaults. The five 0/1 flags (enabled +
// four triggers) are rendered as numeric inputs for consistency with
// other schema-driven rows (same pattern as gps_rescue's
// allowArmingWithoutFix). Master `enabled` defaults OFF so autoland
// never engages until the pilot flips it to 1.
const AUTOLAND_FIELD_DEFS = [
    { name: "enabled", min: 0, max: 1, default: 0, unit: "0/1" },
    { name: "triggerManual", min: 0, max: 1, default: 1, unit: "0/1" },
    { name: "triggerRthTimeout", min: 0, max: 1, default: 1, unit: "0/1" },
    { name: "triggerLowBatt", min: 0, max: 1, default: 0, unit: "0/1" },
    { name: "triggerFailsafe", min: 0, max: 1, default: 1, unit: "0/1" },
    { name: "loiterTimeoutS", min: 10, max: 600, default: 60, unit: "s" },
    { name: "orbitsBeforeDescent", min: 1, max: 5, default: 2, unit: "" },
    { name: "approachAltitudeM", min: 20, max: 300, default: 60, unit: "m" },
    { name: "downwindDistanceM", min: 30, max: 500, default: 150, unit: "m" },
    { name: "baseRadiusM", min: 10, max: 200, default: 40, unit: "m" },
    { name: "finalDistanceM", min: 20, max: 300, default: 80, unit: "m" },
    { name: "commitAltitudeCm", min: 100, max: 2000, default: 600, unit: "cm" },
    { name: "glidePitchDeg", min: 0, max: 20, default: 5, unit: "°" },
    { name: "throttleCutAltCm", min: 0, max: 5000, default: 0, unit: "cm" },
    { name: "cruiseThrottlePct", min: 0, max: 100, default: 40, unit: "%" },
    { name: "flareStartAltCm", min: 30, max: 1000, default: 150, unit: "cm" },
    { name: "flarePitchDeg", min: 0, max: 30, default: 8, unit: "°" },
    { name: "touchdownAccelThreshold", min: 10, max: 100, default: 30, unit: "0.1G" },
    { name: "touchdownAltThresholdCm", min: 0, max: 300, default: 30, unit: "cm" },
    { name: "touchdownQuiescenceMs", min: 500, max: 10000, default: 2000, unit: "ms" },
    { name: "minPatternSats", min: 5, max: 50, default: 8, unit: "" },
];

function defaultAutolandFields() {
    const f = {};
    for (const def of AUTOLAND_FIELD_DEFS) {
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
    components: { BaseTab, PlaneSetupWizard, Dialog },

    setup() {
        const connectionStore = useConnectionStore();

        const fields = reactive(defaultFields());
        const initialFields = ref({ ...fields });

        const launchFields = reactive(defaultLaunchFields());
        const initialLaunchFields = ref({ ...launchFields });

        const gpsRescueFields = reactive(defaultGpsRescueFields());
        const initialGpsRescueFields = ref({ ...gpsRescueFields });

        const autolandFields = reactive(defaultAutolandFields());
        const initialAutolandFields = ref({ ...autolandFields });

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
                    // MCU family ('F4'/'F7'/'H7'/'G4'/'AT32') decoded from
                    // FC.MCU_INFO.name (MSP2_MCU_INFO; firmware sends a
                    // readable string on API 1.47+). null on older firmware,
                    // which makes the optimizer's DMA-conflict reject a
                    // no-op — fine, the pre-remap allocator path still runs.
                    mcuFamily: mcuFamilyFromName(FC.MCU_INFO?.name),
                });

                // Capture the original pad layout for this target on first
                // sight, persist to localStorage. Lets the Pin Assignment
                // panel render a "default pad → currently" table even after
                // preset applies have rewritten the live resource map.
                // Prefers firmware `resource defaults` (wing-fork CLI) when
                // available; falls back to a current-state snapshot on stock.
                await ensurePadDefaultsForCurrentBoard();

                // Timer-remap AF discovery. Runs `timer <pad> list` per
                // pad in the optimizer's candidate pool to enumerate
                // alternate (timer, channel, AF) options. Lets the
                // optimizer recover a pad whose current AF lands on a
                // timer that conflicts with a servo (bench-found case:
                // MicoAir743 LED_STRIP/TIM4). ~100ms per pad serial CLI
                // roundtrip; pool is ≤12 pads on typical wing boards so
                // this adds ~1s to scan. Skipped silently when
                // padDefaults isn't populated (older firmware).
                const poolPads = (effectivePadDefaults.value?.motors ?? []).map((m) => m.pad);
                const ledPads = (effectivePadDefaults.value?.ledStrips ?? []).map((l) => l.pad);
                const allPoolPads = [...new Set([...poolPads, ...ledPads])];
                if (allPoolPads.length > 0) {
                    try {
                        const padTimerOptions = await discoverPadTimerOptions(allPoolPads);
                        // Re-emit the analysis ref with padTimerOptions
                        // merged in. Vue's ref reactivity tracks the ref
                        // value identity, not nested fields, so we
                        // reassign rather than mutate in place.
                        hardwareAnalysis.value = { ...hardwareAnalysis.value, padTimerOptions };
                    } catch (afErr) {
                        console.warn("[WingTuning] timer-options discovery failed:", afErr);
                        // Optimizer's allowAfRemap path no-ops when
                        // padTimerOptions is null. Continue without it.
                    }

                    // Per-pin DMA default discovery. Bare `dma` (no
                    // args) routes to showDma() in firmware which
                    // emits the per-stream view (`DMA1 Stream 0:
                    // SPI_SDI 3`), NOT the per-pin format the optimizer
                    // needs. We have to loop `dma pin <pad>` per
                    // candidate, which DOES emit `dma pin C06 0\n
                    // # DMA1 Stream 4 Channel 5`. Concatenated output
                    // feeds parseDmaPinDefaults. ~100ms per pad, runs
                    // alongside AF discovery so the cumulative scan
                    // delay is ~2s for a 12-pad pool. Acceptable.
                    try {
                        const dmaRaw = await readDmaPinDefaultsConcatenated(allPoolPads);
                        const dmaDump = parseDmaPinDefaults(dmaRaw);
                        // Rebuild the analyzer with the new dmaDump so
                        // padDmaDefaults gets populated and the
                        // motor_no_dma warning fix kicks in. Reuse the
                        // already-parsed inputs from the first call.
                        hardwareAnalysis.value = analyzeWingResources({
                            resourceShow: parseResourceShow(rs.lines),
                            timerShow: parseTimerShow(ts.lines),
                            dmaShow: parseDmaShow(ds.lines),
                            timerDump: parseTimerDump(td.lines),
                            serialPorts: FC.SERIAL_CONFIG?.ports || [],
                            mcuFamily: mcuFamilyFromName(FC.MCU_INFO?.name),
                            dmaDump,
                            // Preserve the just-discovered AF options.
                            padTimerOptions: hardwareAnalysis.value?.padTimerOptions ?? null,
                        });
                    } catch (dmaErr) {
                        console.warn("[WingTuning] dma-pin discovery failed:", dmaErr);
                    }
                }

                // DevTools inspector hook. Exposes the live wing
                // state on `window.__wing` so the developer can poke
                // it directly via console: `__wing.analysis`,
                // `__wing.plan`, `__wing.allowlist`, etc. Vue 3's
                // internal __vueParentComponent surface is fragile
                // across builds, so this hook is the supported way.
                if (typeof window !== "undefined") {
                    window.__wing = {
                        get analysis() {
                            return hardwareAnalysis.value;
                        },
                        get plan() {
                            return pinAssignmentPlan.value;
                        },
                        get padDefaults() {
                            return padDefaults.value;
                        },
                        get effectivePadDefaults() {
                            return effectivePadDefaults.value;
                        },
                        get allowlist() {
                            return [...padAllowlist.value];
                        },
                        get rows() {
                            return pinAssignmentRows.value;
                        },
                    };
                }
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
        // padAfOverrides: pad → AF when pilot picked an alt-AF entry
        // from the dropdown. The pinAssignmentPlan passes this into
        // computePresetResourcePlan, which merges it into the
        // optimizer's auto-remap Map so the CLI batch emits the
        // right `timer <pad> AF<n>` line ahead of the resource bind.
        // Cleared when pilot picks the default-AF entry on the same
        // pad (override matches current → no remap needed).
        const padAfOverrides = ref(new Map());
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

        // Per-board physical-pad allowlist. Set of UPPERCASE pads
        // pilot has marked as NOT physically broken out on this PCB.
        // Empty Set (default) = no filtering = all silkscreen
        // positions usable. Pilot un-checks a row in the Hardware
        // tab to add to this Set; the optimizer / wizard / pin
        // assignment then treat un-checked pads as nonexistent.
        // Persisted via wingPadAllowlist (signature-keyed, falls
        // back to manufacturer+board).
        const padAllowlist = ref(new Set());

        function allowlistIdents() {
            return {
                signature: typeof FC.CONFIG?.signature === "string" ? FC.CONFIG.signature : null,
                manufacturerId: FC.CONFIG?.manufacturerId ?? null,
                boardIdentifier: FC.CONFIG?.boardIdentifier ?? null,
            };
        }

        // Filtered padDefaults — what the optimizer / wizard / pool
        // discovery actually consume. Pad mapping table keeps using
        // raw `padDefaults.value` so all silkscreen rows render with
        // an allowlist checkbox.
        const effectivePadDefaults = computed(() => applyAllowlist(padDefaults.value, padAllowlist.value));

        function togglePadInAllowlist(pad) {
            padAllowlist.value = togglePad(padAllowlist.value, pad);
            saveAllowlist(allowlistIdents(), padAllowlist.value);
        }

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
        async function ensurePadDefaultsForCurrentBoard() {
            const target = FC.CONFIG?.boardName || FC.CONFIG?.targetName || null;
            if (!target) return;

            // Load this board's pilot-defined physical-pad allowlist
            // before any optimizer/wizard consumer reads
            // effectivePadDefaults. Empty Set on first connect to a
            // board (default = all pads allowed).
            padAllowlist.value = loadAllowlist(allowlistIdents());

            // ALWAYS try firmware `resource defaults` first — it's
            // authoritative. Cached snapshots from earlier sessions (maybe
            // captured on stock BF before the wing-fork CLI shipped, or
            // from a different physical board sharing this target name)
            // can be incomplete; overwrite them with live firmware data
            // whenever the CLI succeeds. Cache is only a fallback for
            // the stock-BF / CLI-glitch case below.
            let snapshot = null;
            try {
                const bindings = await readResourceDefaults();
                if (bindings && bindings.length > 0) {
                    snapshot = {
                        target,
                        source: "firmware",
                        motors: bindings
                            .filter((b) => b.peripheral === "MOTOR" && b.index != null)
                            .map((b) => ({ index: b.index, pad: b.pad })),
                        ledStrips: bindings.filter((b) => b.peripheral === "LED_STRIP").map((b) => ({ pad: b.pad })),
                    };
                }
            } catch {
                // Stock BF or CLI glitch — fall through.
            }

            // Firmware didn't respond: prefer a previously-cached snapshot
            // over re-capturing current state (the cache at least reflects
            // a fresh-flash moment if we ever had one).
            if (!snapshot) {
                const cached = loadPadDefaults(target);
                if (cached) snapshot = cached;
            }

            // Last resort: snapshot current state as the defaults. Right
            // on a fresh stock-BF flash, wrong if the user already applied
            // a preset before connecting — the failure mode firmware-
            // defaults path fixes.
            if (!snapshot && hardwareAnalysis.value) {
                snapshot = {
                    target,
                    source: "snapshot",
                    motors: (hardwareAnalysis.value.motors ?? []).map((m) => ({
                        index: m.index,
                        pad: m.pad,
                    })),
                    ledStrips: (hardwareAnalysis.value.ledStrips ?? []).map((l) => ({
                        pad: l.pad,
                    })),
                };
            }

            // LED_STRIP always-union supplement. Runs regardless of which
            // source produced the snapshot. Merges LED_STRIP pads from:
            //   - the snapshot we just built (firmware or current-state),
            //   - any previously-cached snapshot (LEDs we saw on this
            //     target in prior sessions),
            //   - the live analysis.ledStrips (whatever claims LED now).
            //
            // Rationale: (1) stock BF doesn't emit our custom `resource
            // defaults` CLI so the firmware path returns nothing; (2) on
            // targets like TMOTORF7 the user may have moved a motor onto
            // the LED silkscreen pad before we ever captured it, so
            // current analysis has no LED_STRIP entry. By persisting the
            // union across sessions we "sticky"-remember the LED silkscreen
            // pad once we've EVER seen it — subsequent pad mapping tables
            // show the LED_STRIP row even if the pad is currently taken by
            // a relocated motor.
            if (snapshot) {
                const ledUnion = new Map();
                for (const l of snapshot.ledStrips ?? []) ledUnion.set(l.pad, true);
                const cachedSnapshot = loadPadDefaults(target);
                for (const l of cachedSnapshot?.ledStrips ?? []) ledUnion.set(l.pad, true);
                for (const l of hardwareAnalysis.value?.ledStrips ?? []) ledUnion.set(l.pad, true);
                snapshot.ledStrips = [...ledUnion.keys()].map((pad) => ({ pad }));
            }

            if (snapshot) {
                savePadDefaults(target, snapshot);
                padDefaults.value = snapshot;
            }
        }

        // Mapping rows: one per default MOTOR / LED_STRIP slot, showing where
        // its pad is bound right now. Driven by the cached defaults snapshot
        // crossed with the live analyzer state. Used by the "Pad mapping"
        // table in the Pin Assignment panel.
        //
        // Timer/channel lookup via analysis.padTimers (Map<pad, {timer,
        // channel}>) — same source the joint optimizer uses. Lets the
        // table surface "— TIM3 CH4" next to each pad label so pilots
        // can eyeball timer groupings without scrolling down to the
        // "Will bind to" dropdowns. Falls to null when a pad isn't in
        // the timer dump (rare — hardware-fixed pads outside the PWM
        // pool).
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
            const padTimers = hardwareAnalysis.value.padTimers;
            const padCurrentAF =
                hardwareAnalysis.value.padCurrentAF instanceof Map ? hardwareAnalysis.value.padCurrentAF : null;
            const padTimerOptions =
                hardwareAnalysis.value.padTimerOptions instanceof Map ? hardwareAnalysis.value.padTimerOptions : null;
            const lookupTimer = (pad) => {
                const t = padTimers instanceof Map ? padTimers.get(pad) : null;
                return t ?? { timer: null, channel: null };
            };
            // Surface AF discovery state per pad. `currentAF` is what
            // the pin's bound to right now; `altAfs` lists alternate
            // (timer, channel, AF) tuples the pad could be remapped to.
            // Visible in the Pad mapping table so pilots can see
            // discovery worked even when no remap is firing on the
            // current preset.
            const lookupAfInfo = (pad) => {
                const currentAF = padCurrentAF?.get(pad) ?? null;
                const allOptions = padTimerOptions?.get(pad);
                let altAfs = [];
                if (Array.isArray(allOptions)) {
                    altAfs = allOptions
                        .filter((o) => o.af !== currentAF)
                        .map((o) => ({ af: o.af, timer: o.timer, channel: o.channel, complementary: o.complementary }));
                }
                return { currentAF, altAfs };
            };
            const rows = [];
            for (const m of padDefaults.value.motors ?? []) {
                const t = lookupTimer(m.pad);
                const af = lookupAfInfo(m.pad);
                rows.push({
                    defaultLabel: `MOTOR ${m.index}`,
                    pad: m.pad,
                    timer: t.timer,
                    channel: t.channel,
                    currentAF: af.currentAF,
                    altAfs: af.altAfs,
                    currentLabel: currentByPad.get(m.pad) || "(free)",
                });
            }
            // LED_STRIP row: union of padDefaults (firmware silkscreen
            // default — authoritative but some targets don't list it in
            // `resource defaults` output, e.g. TMOTORF7X2) and the live
            // analysis.ledStrips (whatever LED_STRIP currently claims).
            // Without the union, moving a MOTOR onto the LED silkscreen
            // pad leaves no row in the mapping table to show where the
            // MOTOR went.
            const ledPads = new Map();
            for (const l of padDefaults.value.ledStrips ?? []) {
                ledPads.set(l.pad, "default");
            }
            for (const l of hardwareAnalysis.value.ledStrips ?? []) {
                if (!ledPads.has(l.pad)) ledPads.set(l.pad, "current");
            }
            for (const [pad] of ledPads) {
                const t = lookupTimer(pad);
                const af = lookupAfInfo(pad);
                rows.push({
                    defaultLabel: "LED_STRIP",
                    pad,
                    timer: t.timer,
                    channel: t.channel,
                    currentAF: af.currentAF,
                    altAfs: af.altAfs,
                    currentLabel: currentByPad.get(pad) || "(free)",
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
        // motorCount has its own baseline — rule-out when mmix CLI needs
        // to be rewritten, independent of whether any resource pads moved.
        const motorCountDirty = computed(() => motorCount.value !== initialMotorCount.value);

        const launchDirty = computed(() =>
            LAUNCH_FIELD_DEFS.some((def) => launchFields[def.name] !== initialLaunchFields.value[def.name]),
        );

        const autolandDirty = computed(() =>
            AUTOLAND_FIELD_DEFS.some((def) => autolandFields[def.name] !== initialAutolandFields.value[def.name]),
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
        const SUB_TAB_IDS = ["tuning", "mixer", "launch", "gps_rescue", "autoland", "hardware"];
        // Sub-tab visibility gates fork-only sub-tabs behind their
        // respective wing-fork capability bits — mainline (post
        // BF #13719/#14972) FCs NACK the capabilities probe, so caps
        // ends up empty and Tuning / Launch / GPS Rescue / Autoland
        // all hide. Mixer + Hardware stay always-visible — they work
        // on both targets via MSP2_CLI_SETTING (#14972).
        const availableSubTabIds = computed(() => {
            const caps = FC.CONFIG?.wingCapabilities ?? {};
            return SUB_TAB_IDS.filter((id) => {
                if (id === "mixer" || id === "hardware") return true;
                if (id === "tuning") return caps.tuning === true;
                if (id === "launch") return caps.launch === true;
                if (id === "gps_rescue") return caps.gpsRescue === true;
                if (id === "autoland") return caps.autoland === true;
                return false;
            });
        });
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
        // Capabilities arrive asynchronously (MSP2_GET_WING_CAPABILITIES
        // is fired during reload). If the persisted activeSubTab points
        // at a sub-tab that turns out to be hidden on this build (e.g.
        // user was on Tuning then flashed mainline), fall back to Mixer
        // — always available since #14972's MSP2_CLI_SETTING covers it.
        watch(availableSubTabIds, (avail) => {
            if (!avail.includes(activeSubTab.value)) {
                activeSubTab.value = "mixer";
            }
        });
        // Redirect away from a sub-tab that just became hidden — e.g. user
        // had "launch" persisted, then connects to a mainline FC that
        // doesn't advertise launch capability.
        watch(availableSubTabIds, (ids) => {
            if (!ids.includes(activeSubTab.value)) {
                activeSubTab.value = "tuning";
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
        const _rawStoredWiring =
            typeof window !== "undefined" ? window.localStorage?.getItem(WIRING_PRESET_STORAGE_KEY) : null;
        // Legacy migration: the standalone `flying_wing_diff_thrust` preset
        // was removed 2026-04-20; users who had it selected roll over to
        // `flying_wing` + motorCount=2 (see the motorCount seed below).
        const _diffThrustLegacy = _rawStoredWiring === "flying_wing_diff_thrust";
        const _storedWiring = _diffThrustLegacy ? "flying_wing" : _rawStoredWiring;
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

        // ─── motorCount: 1 = single motor, 2 = diff-thrust ───
        // Toggle surfaced near the preset buttons so every preset can opt
        // into 2-motor diff-thrust without needing a distinct preset entry.
        // Persisted per-connection so a reboot-reconnect cycle doesn't
        // silently flip the plane back to 1-motor state.
        const MOTOR_COUNT_STORAGE_KEY = "wing.motorCount";
        const _storedMotorCount =
            typeof window !== "undefined" ? Number(window.localStorage?.getItem(MOTOR_COUNT_STORAGE_KEY)) : NaN;
        const motorCount = ref(
            // Legacy migration: users on `flying_wing_diff_thrust` get
            // motorCount=2 implicitly so their loadout is preserved.
            _diffThrustLegacy
                ? 2
                : _storedMotorCount === 1 || _storedMotorCount === 2
                    ? _storedMotorCount
                    : (PLANE_PRESETS[wiringPresetId.value]?.mmix?.length ?? 1),
        );
        // Baseline for dirty detection — snapshots motorCount at tab mount
        // (or the last successful save). `motorCountDirty` drives save()'s
        // decision to emit the mmix CLI batch: the FC has no MSP for mmix,
        // and the configurator can't read live mmix back, so we can't
        // diff-compare against firmware. The only reliable signal that
        // mmix needs to be rewritten is "user touched motorCount or the
        // mixer rules since last commit."
        const initialMotorCount = ref(motorCount.value);
        watch(motorCount, (n) => {
            if (typeof window !== "undefined" && (n === 1 || n === 2)) {
                try {
                    window.localStorage?.setItem(MOTOR_COUNT_STORAGE_KEY, String(n));
                } catch {
                    /* quota or privacy mode — harmless */
                }
            }
        });
        // Preset-switch → re-seed motorCount from the new preset's default
        // mmix length. User can still override by toggling the checkbox
        // afterward.
        watch(wiringPresetId, (id) => {
            const base = PLANE_PRESETS[id]?.mmix?.length ?? 1;
            motorCount.value = base;
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
                padDefaults: effectivePadDefaults.value,
                // effectiveRules reflects the user's live Function→Output
                // Mapping edits — adding a rule expands usedServoIndices,
                // removing one shrinks it. Pin Assignment picker stays in
                // sync without the user having to re-click the preset.
                effectiveRules: mixerState.rules,
                // motorCount from the diff-thrust toggle lets usedMotorIndices
                // reflect the user's 1-vs-2-motor choice without needing a
                // separate preset entry.
                motorCount: motorCount.value,
                // Enable AF remap recovery: when a motor pad's current
                // timer collides with a servo's, the optimizer picks an
                // alternate AF whose timer is disjoint and the planner
                // emits a `timer <pad> AF<n>` line ahead of the resource
                // bind. No-ops cleanly when padTimerOptions is null
                // (older firmware lacking `timer <pin> list`).
                allowAfRemap: true,
                // User-supplied AF overrides from the dropdown's alt-AF
                // entries. Wins over optimizer auto-picks for the same
                // pad. Map<pad, af> — empty by default, populated when
                // pilot selects an `[AF<n>]` row in the dropdown.
                padAfOverrides: padAfOverrides.value,
            });
        });

        const pinAssignmentRows = computed(() => {
            const plan = pinAssignmentPlan.value;
            if (!plan) return [];
            const rows = [];
            const timerRemaps = plan.timerRemaps instanceof Map ? plan.timerRemaps : null;
            const padCurrentAF =
                hardwareAnalysis.value?.padCurrentAF instanceof Map ? hardwareAnalysis.value.padCurrentAF : null;
            const padDmaDefaults =
                hardwareAnalysis.value?.padDmaDefaults instanceof Map ? hardwareAnalysis.value.padDmaDefaults : null;
            // Build the "AF X → AF Y" badge data when a row's picked pad
            // has a planned remap. fromAF can be null on older firmware
            // (timer dump didn't carry AF info) — badge falls back to
            // showing only the new AF + timer/channel.
            const remapForPad = (pad) => {
                if (!pad || !timerRemaps) return null;
                const r = timerRemaps.get(pad);
                if (!r) return null;
                return {
                    fromAF: padCurrentAF?.get(pad) ?? null,
                    toAF: r.af,
                    toTimer: r.timer,
                    toChannel: r.channel,
                };
            };
            // DMA badge for motor rows: "DMA1/S0" if the pad has a
            // default DMA option, "bit-bang" in red if the pad has no
            // DMA option at all (TIM11/TIM12/TIM13/TIM14 channel pins
            // on F7 — DSHOT-incapable). Servo rows skip this since
            // servo PWM doesn't allocate DMA. null when padDmaDefaults
            // wasn't populated (older firmware).
            const dmaForMotorPad = (pad) => {
                if (!pad || !padDmaDefaults) return null;
                if (!padDmaDefaults.has(pad)) return null;
                const dma = padDmaDefaults.get(pad);
                if (dma == null) return { kind: "bitbang", label: "bit-bang" };
                return {
                    kind: "stream",
                    controller: dma.controller,
                    stream: dma.stream,
                    label: `DMA${dma.controller}/S${dma.stream}`,
                };
            };
            for (const idx of plan.usedMotorIndices) {
                const bound = (hardwareAnalysis.value?.motors ?? []).find((m) => m.index === idx);
                const pickedFromPlan = plan.motorPicks.get(idx);
                const pickedPad = padOverrides.motor[idx] ?? pickedFromPlan?.pad ?? bound?.pad ?? null;
                rows.push({
                    kind: "motor",
                    index: idx,
                    label: `MOTOR ${idx}`,
                    currentPad: bound?.pad ?? null,
                    pickedPad,
                    timerRemap: remapForPad(pickedPad),
                    dma: dmaForMotorPad(pickedPad),
                });
            }
            for (const idx of plan.usedServoIndices) {
                const bound = (hardwareAnalysis.value?.servos ?? []).find((s) => s.index === idx);
                const pickedFromPlan = plan.picks.get(idx);
                const pickedPad = padOverrides.servo[idx] ?? pickedFromPlan?.pad ?? bound?.pad ?? null;
                rows.push({
                    kind: "servo",
                    index: idx,
                    label: `SERVO ${idx}`,
                    currentPad: bound?.pad ?? null,
                    pickedPad,
                    timerRemap: remapForPad(pickedPad),
                    dma: null,
                });
            }
            return rows;
        });

        // True when any pinAssignmentRows row has no resolved pad —
        // typically caused by an over-restrictive allowlist or a
        // preset whose motor+servo count exceeds the available pool.
        // Drives the "Not enough physical pads" banner above the
        // dropdowns.
        const pinAssignmentInfeasible = computed(() => {
            const rows = pinAssignmentRows.value;
            return rows.length > 0 && rows.some((r) => !r.pickedPad);
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
            const analysis = hardwareAnalysis.value;
            const bound = (analysis.servos ?? []).find((s) => s.index === servoIndex);
            // Convert plan.motorPicks (motorIndex → {pad}) to motorIndex →
            // pad, then thread into candidatePadsForSlot so currently-bound
            // motor pads that are moving show up as motor-release candidates
            // (and their target pads are properly claimed). Plan + UI both
            // see the same candidate list this way.
            const motorRebinds = new Map();
            if (plan?.motorPicks instanceof Map) {
                for (const [idx, pick] of plan.motorPicks) {
                    if (pick?.pad) motorRebinds.set(idx, pick.pad);
                }
            }
            const cands = candidatePadsForSlot(analysis, servoIndex, {
                motorIndicesInUse: plan?.usedMotorIndices ?? [],
                currentPad: bound?.pad ?? null,
                allowLedStrip: allowLedStripPad.value,
                allowUartRelease: [...allowUartPads],
                motorRebinds,
            });
            // Filter dropdown options through the physical-pad
            // allowlist. candidatePadsForSlot reads the full analyzer
            // view (not effectivePadDefaults) so we have to apply the
            // filter here too. Without this, un-checking a pad in the
            // Hardware tab still left it selectable in the dropdown.
            return filterCandidatesByAllowlist(cands);
        }

        function candidatesForMotor(motorIndex) {
            if (!hardwareAnalysis.value) return [];
            const analysis = hardwareAnalysis.value;
            const plan = pinAssignmentPlan.value;
            const usedServos = new Set(plan?.usedServoIndices ?? []);
            const usedMotors = new Set(plan?.usedMotorIndices ?? []);
            const existing = (analysis.motors ?? []).find((m) => m.index === motorIndex);
            // Timer/channel fallback source — `timer show` parser sometimes
            // leaves `m.timer` / `s.timer` null (observed TMOTORF7X2); the
            // padTimers map (from timer_dump) is authoritative for every
            // PWM-capable pad regardless of current binding state.
            const padTimers = analysis.padTimers instanceof Map ? analysis.padTimers : null;
            const withTimer = (pad, baseTimer, baseChannel) => {
                const fb = padTimers?.get(pad);
                return {
                    timer: baseTimer ?? fb?.timer ?? null,
                    channel: baseChannel ?? fb?.channel ?? null,
                };
            };
            const results = [];
            if (existing) {
                const t = withTimer(existing.pad, existing.timer, existing.channel);
                results.push({
                    pad: existing.pad,
                    timer: t.timer,
                    channel: t.channel,
                    source: "existing",
                });
            }
            // Pads of SERVOs being released by the pending plan (the user X'd
            // out the row, or the rule was removed upstream). These become
            // candidates for motor binding once the release line fires. Each
            // one carries a requiresRelease hint so the CLI batch emits
            // `resource SERVO N NONE` before the motor rebind.
            const releasableServos = (analysis.servos ?? []).filter((s) => !usedServos.has(s.index));
            for (const s of releasableServos) {
                const t = withTimer(s.pad, s.timer, s.channel);
                results.push({
                    pad: s.pad,
                    timer: t.timer,
                    channel: t.channel,
                    source: "servo-release",
                    requiresRelease: [`resource SERVO ${s.index} NONE`],
                });
            }
            // Pads of other MOTORs being released (motorCount dropped below
            // their index). Mirror of servo-release above.
            const releasableMotors = (analysis.motors ?? []).filter(
                (m) => m.index !== motorIndex && !usedMotors.has(m.index),
            );
            for (const m of releasableMotors) {
                const t = withTimer(m.pad, m.timer, m.channel);
                results.push({
                    pad: m.pad,
                    timer: t.timer,
                    channel: t.channel,
                    source: "motor-release",
                    requiresRelease: [`resource MOTOR ${m.index} NONE`],
                });
            }
            // LED_STRIP pad — mirrors the servo-dropdown behavior. When
            // allowLedStripPad is on, the LED pad becomes a motor candidate
            // with a `"(releases LED_STRIP)"` hint so the CLI batch frees
            // the LED before binding the motor.
            if (allowLedStripPad.value) {
                for (const ls of analysis.ledStrips ?? []) {
                    const t = withTimer(ls.pad, ls.timer, ls.channel);
                    results.push({
                        pad: ls.pad,
                        timer: t.timer,
                        channel: t.channel,
                        source: "led-strip",
                        requiresRelease: ["resource LED_STRIP 1 NONE"],
                    });
                }
            }
            const claimed = new Set();
            for (const m of analysis.motors ?? []) {
                if (m.index !== motorIndex && usedMotors.has(m.index)) claimed.add(m.pad);
            }
            for (const s of analysis.servos ?? []) {
                if (usedServos.has(s.index)) claimed.add(s.pad);
            }
            for (const f of analysis.hardwareFixedPads ?? []) claimed.add(f.pad);
            for (const p of analysis.pwmCapableFreePads ?? []) {
                if (claimed.has(p.pad)) continue;
                if (existing && existing.pad === p.pad) continue;
                // Skip pads already surfaced via existing / release tiers.
                if (results.some((r) => r.pad === p.pad)) continue;
                results.push({ pad: p.pad, timer: p.timer, channel: p.channel, source: "free-pwm" });
            }
            // Alt-AF expansion (parallel to candidatePadsForSlot's
            // section 7). For each pad already in results, append
            // additional rows for every alternate AF the firmware
            // reports — lets the pilot manually park a motor pad on
            // a different (timer, channel) when the optimizer's auto
            // remap doesn't fire. Complementary alts are filtered
            // below since DSHOT can't drive them.
            const padTimerOptions = analysis.padTimerOptions instanceof Map ? analysis.padTimerOptions : null;
            const padCurrentAF = analysis.padCurrentAF instanceof Map ? analysis.padCurrentAF : null;
            const motorTimerSet = new Set(
                (analysis.motors ?? []).map((m) => m.timer).filter((t) => t !== null && t !== undefined),
            );
            if (padTimerOptions) {
                const altEntries = [];
                for (const base of results) {
                    const opts = padTimerOptions.get(base.pad);
                    if (!Array.isArray(opts) || opts.length === 0) continue;
                    const currentAf = padCurrentAF?.get(base.pad);
                    for (const opt of opts) {
                        if (opt.af === currentAf) continue;
                        altEntries.push({
                            pad: base.pad,
                            timer: opt.timer,
                            channel: opt.channel,
                            af: opt.af,
                            complementary: !!opt.complementary,
                            source: "alt-af",
                            sharesTimerWithMotor: opt.timer !== null && motorTimerSet.has(opt.timer),
                        });
                    }
                }
                for (const e of altEntries) results.push(e);
            }
            // Motor rows can't drive complementary timer channels via
            // DSHOT — drop those alt-AF rows so the dropdown doesn't
            // offer picks that won't work.
            const filtered = results.filter((r) => !r.complementary);
            return filterCandidatesByAllowlist(filtered);
        }

        // Drop candidates whose pad is in the disallowed Set (pilot
        // un-checked it in the Hardware tab's "Physical pad" column).
        // Applied to both servo and motor candidate lists so the
        // dropdown stays in sync with the optimizer's filtered pool.
        function filterCandidatesByAllowlist(cands) {
            if (!Array.isArray(cands)) return cands;
            const disallowed = padAllowlist.value;
            if (!(disallowed instanceof Set) || disallowed.size === 0) return cands;
            return cands.filter((c) => c?.pad && !disallowed.has(c.pad.toUpperCase()));
        }

        // Remove a pin assignment row — red X button in the table. For SERVO
        // rows, prunes the rule(s) targeting that servo from mixerState.rules
        // so the reactive chain (effectiveRules → usedServoIndices → plan)
        // drops the row AND emits `resource SERVO N NONE` in the save batch.
        // For MOTOR rows, decrements motorCount (MOTOR 1 always stays — can't
        // fly with zero motors). Both paths leave initialMixerState /
        // initialMotorCount untouched so the dirty indicator fires.
        function removeAssignment(kind, index) {
            if (kind === "motor") {
                if (index <= 1 || motorCount.value <= 1) return;
                motorCount.value = motorCount.value - 1;
                return;
            }
            if (kind === "servo") {
                // mixer rule's `target` is 1-based: target = servoIndex + 1.
                const ruleTarget = index + 1;
                mixerState.rules = mixerState.rules.filter((r) => r.target !== ruleTarget);
                // Also clear any stale pad override for this servo so it
                // doesn't leak into future applyPreset / save cycles.
                if (padOverrides.servo[index] != null) {
                    delete padOverrides.servo[index];
                }
            }
        }

        // Pick the next unused SERVO index (within 1..MAX_SERVO_SLOTS) and
        // append a placeholder rule so a new pin-assignment row appears.
        // Placeholder rule: STABILIZED_ROLL input, rate 100, full travel —
        // user then tunes via the Mixer tab's rule editor. Mirrors the
        // existing "Add function" buttons' pattern of switching to CUSTOM
        // AIRPLANE + appending rules; keeps the add here identical to a
        // manual rule-editor add but tied to a free SERVO slot.
        const MAX_SERVO_SLOTS_FOR_ADD = 8;
        function addServoPin() {
            const plan = pinAssignmentPlan.value;
            const used = new Set(plan?.usedServoIndices ?? []);
            let nextIdx = null;
            for (let i = 1; i <= MAX_SERVO_SLOTS_FOR_ADD; i++) {
                if (!used.has(i)) {
                    nextIdx = i;
                    break;
                }
            }
            if (nextIdx === null) return;
            // Switch to CUSTOMAIRPLANE so the rule actually drives the servo.
            mixerState.airframe = 24;
            mixerState.rules = [
                ...mixerState.rules,
                {
                    target: nextIdx + 1,
                    input: 0,
                    rate: 100,
                    speed: 0,
                    min: -100,
                    max: 100,
                    box: 0,
                },
            ];
        }

        function setPadOverride(kind, index, value) {
            if (!value) return;
            // Dropdown values encode pad + optional AF as `pad|af`
            // so multiple alt-AF entries can coexist for one pad.
            // Default-AF entries pass `pad` alone (no `|`).
            const sep = value.indexOf("|");
            const pad = sep === -1 ? value : value.slice(0, sep);
            const afStr = sep === -1 ? "" : value.slice(sep + 1);
            const af = afStr.length > 0 ? Number(afStr) : null;
            if (kind === "motor") padOverrides.motor[index] = pad;
            else if (kind === "servo") padOverrides.servo[index] = pad;
            // Track the AF override on a per-pad basis. The same pad
            // can only carry one chosen AF at a time across all rows;
            // last writer wins, which matches the dropdown UX.
            const next = new Map(padAfOverrides.value);
            if (af === null) next.delete(pad);
            else next.set(pad, af);
            padAfOverrides.value = next;
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
            if (c.source === "servo-release") {
                const m = line && /^resource SERVO (\d+) /i.exec(line);
                return m ? `releases SERVO ${m[1]}` : "release servo";
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
        // Builds the effective mmix for a preset under the current
        // motorCount toggle. Mirrors the effectiveMmix logic in
        // applyPreset so save-initiated pin apply can also persist the
        // correct motor count — otherwise flipping motorCount without
        // re-clicking a preset leaves mmix stale and extra-motor pin
        // bindings become silent no-ops (firmware lazy-inits only pins
        // the current mmix actually uses).
        function buildEffectiveMmix(preset, n) {
            if (!preset?.mmix) return [];
            if (n === 2 && preset.mmix.length === 1) {
                return [
                    { ...preset.mmix[0], yaw: 0.4 },
                    { ...preset.mmix[0], yaw: -0.4 },
                ];
            }
            if (n === 1 && preset.mmix.length >= 2) {
                return [{ ...preset.mmix[0], yaw: 0 }];
            }
            return preset.mmix;
        }

        function buildMmixCliLines(mmix) {
            return ["mmix reset"].concat(
                mmix.map(
                    (m, i) =>
                        `mmix ${i} ${m.throttle.toFixed(3)} ${m.roll.toFixed(3)} ${m.pitch.toFixed(3)} ${m.yaw.toFixed(3)}`,
                ),
            );
        }

        // Called from save() at the end of the sequence — never standalone
        // since the Apply button was removed in button-consolidation. Drops
        // the `saving.value` guard (that WAS blocking the save-initiated
        // path from running) and the confirm() dialog (user already chose
        // to Save — the CLI preview panel showed what would happen).
        // Accepts an optional override batch so save() can prepend mmix
        // lines when motorCount has diverged from the live FC mixer.
        async function applyPinAssignment(overrideCliLines = null) {
            const plan = pinAssignmentPlan.value;
            const cliLines = overrideCliLines ?? plan?.cliLines;
            if (!cliLines || cliLines.length === 0) return;
            if (applyingPreset.value || applyingPinAssignment.value || loading.value) return;
            applyingPinAssignment.value = true;
            error.value = null;
            connectionStore.pauseLiveData();
            try {
                connectionStore.clearMspQueue();
                await applyCliLines(cliLines);
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

        // Pin Assignment has pending pad moves when the computed plan
        // surfaces any `resource` lines. Folded into main `dirty` so the
        // bottom-right Save button drives both MSP + pin-apply.
        // Null-safe because pinAssignmentPlan returns null until hardware
        // analysis has loaded + a preset id is set.
        const pinAssignmentDirty = computed(() => (pinAssignmentPlan.value?.cliLines?.length ?? 0) > 0);

        const dirty = computed(
            () =>
                FIELD_DEFS.some((def) => fields[def.name] !== initialFields.value[def.name]) ||
                mixerDirty.value ||
                motorCountDirty.value ||
                launchDirty.value ||
                gpsRescueDirty.value ||
                autolandDirty.value ||
                pinAssignmentDirty.value,
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

        // COMBINED yaw type is wing-fork-only (not in mainline post-#13719).
        // Gate the dropdown option behind the capability bit so mainline
        // FCs only see RUDDER / DIFF_THRUST. The applyPreset auto-pick
        // never selects COMBINED regardless — this just hides it from the
        // user-facing dropdown.
        const combinedYawSupported = computed(() => FC.CONFIG?.wingCapabilities?.combinedYaw === true);

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

                // Servo configurations (min/middle/max/rate per servo).
                // Required by the Plane Setup Wizard's pulse path:
                // wingServoPulse.pulseServoMiddle reads FC.SERVO_CONFIG
                // [slotN].middle to live-edit a temporary middle, then
                // restores after durationMs. Without this fetch the
                // pulse throws "Cannot read properties of undefined
                // (reading 'middle')" on the wizard's Discovery step.
                await MSP.promise(MSPCodes.MSP_SERVO_CONFIGURATIONS);

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

                // Wing autoland — same graceful-degrade pattern. Older
                // firmware without 0x3018 will leave autolandFields at
                // their defaults, which is also what a stock wing with
                // master = 0 behaves like anyway.
                try {
                    await MSP.promise(MSPCodes.MSP2_WING_AUTOLAND);
                    for (const def of AUTOLAND_FIELD_DEFS) {
                        if (FC.WING_AUTOLAND[def.name] !== undefined) {
                            autolandFields[def.name] = FC.WING_AUTOLAND[def.name];
                        }
                    }
                    initialAutolandFields.value = { ...autolandFields };
                } catch (autolandErr) {
                    console.warn("[WingTuning] MSP2_WING_AUTOLAND unavailable (older firmware?):", autolandErr);
                }

                // Hardware analysis (resource/timer/dma + pad defaults) —
                // folded into the main Reload button so Hardware + Mixer
                // sub-tabs don't need their own per-panel reload controls.
                // Best-effort: a CLI stall shouldn't block the rest of reload().
                try {
                    await loadHardware();
                } catch (hwErr) {
                    console.warn("[WingTuning] hardware reload failed:", hwErr);
                }

                // Wizard auto-resume across FC reboots: if a valid resume
                // marker is in localStorage, re-open the wizard at the
                // step it was waiting on. Stale markers (5+ min old or
                // wrong target) are cleared by readWizardMarker.
                const marker = readWizardMarker();
                if (marker) {
                    wizardResumeState.value = marker;
                    wizardOpen.value = true;
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
            // Pause the 250 ms update_live_status polling for the full save
            // window. Without this, MSP_ARMING_CONFIG (id 110) polls queue
            // behind our save writes, and when applyPinAssignment triggers
            // the CLI reboot those pending polls time out noisily in the
            // console ("MSP: data request timed-out: 110 ... QUEUE: 5"). The
            // save itself still succeeds — the timeouts are just cleanup
            // noise — but the user-visible errors spook pilots. resumeLiveData
            // fires in the finally below so normal polling restarts after
            // the save (or error) path completes.
            connectionStore.pauseLiveData();
            try {
                // Cross-tab Save protection: if the Plane Setup Wizard is
                // mid-flight on the mainline-fallback servo pulse path,
                // restore any in-flight pulse `middle` values BEFORE any
                // servo config write would otherwise persist them to
                // EEPROM. No-op when the wizard is closed or on the
                // wing-fork override path.
                await wizardServoPulseCleanup();

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

                // Wing autoland — same dirty-gated, swallow-unknown pattern.
                if (autolandDirty.value) {
                    for (const def of AUTOLAND_FIELD_DEFS) {
                        FC.WING_AUTOLAND[def.name] = autolandFields[def.name];
                    }
                    try {
                        await MSP.promise(
                            MSPCodes.MSP2_SET_WING_AUTOLAND,
                            mspHelper.crunch(MSPCodes.MSP2_SET_WING_AUTOLAND),
                        );
                    } catch (autolandErr) {
                        console.warn("[WingTuning] MSP2_SET_WING_AUTOLAND failed:", autolandErr);
                    }
                }

                await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);

                initialFields.value = { ...fields };
                initialLaunchFields.value = { ...launchFields };
                initialGpsRescueFields.value = { ...gpsRescueFields };
                initialAutolandFields.value = { ...autolandFields };
                initialMixerState.value = cloneMixerState(mixerState);
                initialMotorCount.value = motorCount.value;

                // Pin Assignment — runs LAST because the CLI batch includes
                // `save` + reboot. MSP writes above are already in EEPROM, so
                // they persist through the reboot.
                //
                // Gate: fire the CLI batch whenever ANY preset-scoped state
                // changed — resource plan has real work, OR the mixer state
                // (rules, airframe) drifted, OR motorCount toggled. The
                // configurator can't read live mmix back from the FC via
                // MSP, so `mixerDirty || motorCountDirty` is our only
                // signal that mmix needs rewriting. If we gated solely on
                // pinAssignmentDirty, a preset click that happened to land
                // on the board's existing pad layout would skip mmix and
                // leave the FC running stale motor mix (observed on bench:
                // Flying Wing + diff-thrust saved smix/yaw_type but NOT
                // mmix because resource plan was a no-op).
                const fireCliBatch = pinAssignmentDirty.value || mixerDirty.value || motorCountDirty.value;
                if (fireCliBatch) {
                    try {
                        const preset = pinAssignmentPreset.value;
                        const baseCli = pinAssignmentPlan.value?.cliLines ?? [];
                        const mmixCli = preset ? buildMmixCliLines(buildEffectiveMmix(preset, motorCount.value)) : [];
                        // Full preset CLI batch:
                        //   1. autoCleanCliLines  — wipes stale mmix + SERVO/MOTOR resource binds
                        //   2. baseCli            — pin assignment plan (resource SERVO/MOTOR N <pad>)
                        //   3. mmixCli            — preset's mmix entries
                        //   4. planeDefaults      — universal CLI feature toggles (anti_gravity_gain=0,
                        //                           iterm_relax_cutoff=5, servo_pwm_rate=50, gps_use_3d_speed=ON)
                        //   5. planeTuningPoints  — rates + PIDs (10/10/5/0 P/I/D/F, yaw I=0 if DIFF_THRUST)
                        // Plane defaults + tuning starting points fire on every preset Save —
                        // applying a preset is treated as a major airframe change where prior
                        // tuning wouldn't transfer correctly anyway (per BF discussion #14032).
                        const fullBatch = [
                            ...autoCleanCliLines(),
                            ...baseCli,
                            ...mmixCli,
                            ...planeDefaultsCliLines(),
                            ...planeTuningStartingPoints({
                                diffThrust: fields.yaw_type === "DIFF_THRUST",
                                tpaMaxVoltage: fields.tpa_speed_max_voltage,
                            }),
                        ];
                        if (fullBatch.length > 0) {
                            await applyPinAssignment(fullBatch);
                        }
                    } catch (pinErr) {
                        console.warn("[WingTuning] pin assignment apply failed:", pinErr);
                    }
                }
            } catch (e) {
                console.error("[WingTuning] save failed:", e);
                error.value = e.message || String(e);
            } finally {
                connectionStore.resumeLiveData();
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

        // Apply a preset — STAGING-ONLY. Mutates reactive Vue state so
        // the Pin Assignment plan recomputes + the dirty indicator lights
        // up, but does NOT write MSP / CLI / save / reboot. The main Save
        // button is the single commit point: it writes MSP, emits the
        // resource + mmix CLI batch (derived at save time from the same
        // motorCount / rules we stage here), then `save` + reboot.
        //
        // Preset click is now synchronous — no modal, no reconnect, no
        // live-data pause. User sees picks update instantly in the Pin
        // Assignment panel, can override any pad, then hits Save to
        // commit everything in one shot.
        function applyPreset(id) {
            const preset = PLANE_PRESETS[id];
            if (!preset || loading.value || saving.value) {
                return;
            }
            // Steer the wiring reference panel at the staged preset.
            // Triggers pinAssignmentPreset → pinAssignmentPlan → dirty
            // chain so the Pin Assignment panel + its CLI preview
            // recompute against the new preset.
            wiringPresetId.value = id;
            error.value = null;

            // yaw_type auto-select:
            //   motorCount=1 → preset.yawType (always RUDDER today)
            //   motorCount=2 + preset has a STABILIZED_YAW rule →
            //     COMBINED (standard_plane, v_tail — rudder + motor diff)
            //   motorCount=2 + no STABILIZED_YAW rule → DIFF_THRUST
            //     (flying_wing — motor-only yaw)
            //
            // COMBINED only exists on the wing-fork (capability bit 4);
            // on mainline FCs we fall back to RUDDER for that branch.
            // The preset has a yaw rule wiring a rudder/V-tail surface,
            // so RUDDER is the right downgrade — DIFF_THRUST would
            // ignore the rudder servo and feel wrong to the pilot.
            const presetHasYawRule = preset.rules.some((r) => r.input === INPUT_SOURCES.STABILIZED_YAW);
            const wantsCombined = motorCount.value === 2 && presetHasYawRule;
            const effectiveYawType = wantsCombined
                ? combinedYawSupported.value
                    ? "COMBINED"
                    : "RUDDER"
                : motorCount.value === 2
                    ? "DIFF_THRUST"
                    : preset.yawType;

            // Stage reactive state. The existing diffThrustMode watcher
            // zeroes s_yaw when yaw_type flips to DIFF_THRUST. mmix lines
            // get re-derived at Save time via buildEffectiveMmix(preset,
            // motorCount), so no mmix staging needed here.
            //
            // initialFields / initialMixerState are deliberately NOT
            // touched — leaving them at pre-click values is what lights
            // up the dirty indicator and prompts the user to Save.
            fields.yaw_type = effectiveYawType;
            mixerState.airframe = preset.mixerIndex;
            mixerState.reverseMotorDir = 0;
            mixerState.rules = preset.rules.map((r) => ({ ...r }));

            // Stage MSP-side plane defaults per BF discussion #14032.
            // Universal across airframes; applying a preset is treated
            // as a major airframe change where prior tuning wouldn't
            // transfer correctly anyway. CLI-side defaults
            // (anti_gravity_gain=0, iterm_relax_cutoff=5,
            // gps_use_3d_speed=ON, servo_pwm_rate=50) and tuning
            // starting points (rates + PIDs) are emitted by save()'s
            // CLI batch via planeDefaultsCliLines() +
            // planeTuningStartingPoints().
            //
            // S-term: 50 for pitch/roll on every preset; yaw = 50 unless
            // DIFF_THRUST (then 0 — diffThrustMode watcher would force
            // this anyway, but staging here keeps the dirty indicator
            // honest if the user toggled yaw_type since last save).
            fields.s_pitch = 50;
            fields.s_roll = 50;
            fields.s_yaw = effectiveYawType === "DIFF_THRUST" ? 0 : 50;
            fields.angle_earth_ref = 0;
            fields.tpa_mode = "PDS";
            fields.tpa_curve_type = "HYPERBOLIC";

            // tpa_speed_max_voltage = cellCount × 4.20V × 100. Auto-detect
            // from FC battery profile when configured; fall back to 3S
            // when batteryCellCount is 0 / out-of-range. Under-scaling is
            // safer than over-scaling — pilot can adjust in Tuning if
            // they're running >3S (3S is also the most common 5"-wing pack).
            const fcCells = FC.BATTERY_CONFIG?.batteryCellCount ?? 0;
            const safeCells = fcCells >= 2 && fcCells <= 6 ? fcCells : 3;
            fields.tpa_speed_max_voltage = safeCells * 420;
        }

        // ════ Plane Setup Wizard launcher + Reset wing config ════
        // Launcher card persists across sub-tab switches because the
        // wizard triggers FC reboots multiple times during its 8-step
        // flow; the buttons stay reachable regardless of activeSubTab.
        const wizardOpen = ref(false);
        const showResetDialog = ref(false);
        // Resume marker payload from localStorage. Populated by reload()
        // when a valid marker is found post-reboot. Passed to the wizard
        // as resumeState so it re-opens at the right step.
        const wizardResumeState = ref(null);

        function openWizard() {
            if (loading.value || saving.value) return;
            wizardResumeState.value = null;
            wizardOpen.value = true;
        }
        function closeWizard() {
            wizardOpen.value = false;
            wizardResumeState.value = null;
            clearWizardMarker();
        }
        // Wizard's Finish button — distinct from X-close. Originally
        // auto-fired save() on the assumption that wizard state needed
        // a final commit. Bench-found this WIPED scan results: save()
        // re-runs the full preset-apply path including
        //   autoCleanCliLines()  (releases ALL motor + servo resources)
        //   baseCli              (pinAssignmentPlan.cliLines — diff-style;
        //                         empty/partial when FC already correct)
        //   mmix + plane defaults
        // Net effect after motor scan: autoclean wipes everything, the
        // diff-style baseCli only re-emits the few binds the recommender
        // thought needed changing, and the rest stays NONE on reboot.
        // User saw their motor scan + servo configs partially wiped.
        //
        // Per-step wizard callbacks (Apply, Direction, Endpoints,
        // Motors, MotorScanPrep, MotorFinal, YawFlip) each commit their
        // own state via MSP+EEPROM_WRITE or CLI+save reboot, so by the
        // time Finish fires there's nothing pending to commit. Just
        // close — no save() needed, no wipe.
        function finishWizard() {
            closeWizard();
        }

        // Reset wing config — surgical reset that wipes mixer/resource
        // /servo state but preserves UART, RX, modes, battery calibration,
        // OSD, VTX, LED, failsafe. fullWingResetCliLines() emits the CLI
        // batch; FC reboots after `save`. User clicks Start Wizard
        // themselves after reconnect (no auto-launch on reset path).
        async function performResetWingConfig() {
            showResetDialog.value = false;
            if (loading.value || saving.value) return;
            saving.value = true;
            error.value = null;
            connectionStore.pauseLiveData();
            try {
                connectionStore.clearMspQueue();
                await applyCliLines(fullWingResetCliLines());
                await new Promise((r) => setTimeout(r, 5000));
                await reload();
            } catch (e) {
                console.error("[WingTuning] reset failed:", e);
                error.value = e.message || String(e);
            } finally {
                connectionStore.resumeLiveData();
                saving.value = false;
            }
        }

        // ════ Wizard auto-resume across reboots ════
        // Each reboot-triggering wizard step writes a marker to
        // localStorage before the FC reboots. After reconnect, reload()
        // reads the marker and re-opens the wizard at the right step.
        // Markers expire after 5 min OR when target changes (user
        // flashed a different board mid-flow).
        const WIZARD_MARKER_KEY = "wingTuningWizardMarker";
        const WIZARD_MARKER_TTL_MS = 5 * 60 * 1000;

        // Wizard STEP_* enum mirror (PlaneSetupWizard.vue):
        //   SAFETY=0, AIRFRAME=1, APPLY=2, DISCOVERY=3,
        //   DIRECTION=4, ENDPOINTS=5, MOTORS=6, DONE=7.
        // Each reboot-triggering phase maps to the step the wizard should
        // land on after auto-resume. Without this, the wizard falls back
        // to STEP_DISCOVERY at "gate" and re-runs Discovery.
        const PHASE_TO_START_STEP = {
            "post-remap": 4, // Discovery committed → Direction
            "post-scan-prep": 3, // mid-Discovery scan walk continues
            "post-motors": 6, // motor identity committed → MOTORS (yaw sub-phase decides on resume)
            "post-motor-scan-prep": 6, // motor scan walk continues at MOTORS
            "post-motor-final": 6, // scan-final committed → MOTORS (yaw sub-phase decides on resume)
            "post-yaw-flip": 7, // yaw flip done → Done
        };

        function persistWizardMarker(payload) {
            try {
                // airframeId gates the wizard's resume logic — without
                // it set the wizard falls through to "fresh launch" at
                // Safety (Step 1) regardless of `phase`. Auto-fill from
                // wiringPresetId (which applyPreset always sets when an
                // airframe is selected) so every marker carries it.
                // Callers can override via payload.airframeId.
                const airframeId = payload.airframeId ?? wiringPresetId.value ?? null;
                const startAtStep = payload.startAtStep ?? PHASE_TO_START_STEP[payload.phase] ?? 3;
                const marker = {
                    ...payload,
                    airframeId,
                    startAtStep,
                    timestamp: Date.now(),
                    target: FC.CONFIG?.targetName ?? null,
                };
                globalThis.localStorage?.setItem(WIZARD_MARKER_KEY, JSON.stringify(marker));
            } catch (e) {
                console.warn("[WingTuning] persist wizard marker failed:", e);
            }
        }

        function readWizardMarker() {
            try {
                const raw = globalThis.localStorage?.getItem(WIZARD_MARKER_KEY);
                if (!raw) return null;
                const marker = JSON.parse(raw);
                if (!marker || typeof marker !== "object") return null;
                if (Date.now() - (marker.timestamp ?? 0) > WIZARD_MARKER_TTL_MS) {
                    clearWizardMarker();
                    return null;
                }
                const currentTarget = FC.CONFIG?.targetName;
                if (marker.target && currentTarget && marker.target !== currentTarget) {
                    clearWizardMarker();
                    return null;
                }
                return marker;
            } catch (e) {
                return null;
            }
        }

        function clearWizardMarker() {
            try {
                globalThis.localStorage?.removeItem(WIZARD_MARKER_KEY);
            } catch {
                /* no-op */
            }
        }

        // ════ Wizard props (computed) ════
        // airframes prop: wizard expects an array of preset objects, each
        // augmented with a `surfaces` array describing the per-airframe
        // SERVO walking sequence. Surfaces are derived from the preset's
        // `wiring` entries (SERVO pads only, motor entries excluded).
        // Each surface = { label, slotN, pad } where label is the
        // human-friendly function name ("Aileron L", "Elevator", etc),
        // slotN is the SERVO slot integer, pad is the original "SERVO N"
        // string. Wizard's Discovery walks these in order.
        const wizardAirframes = computed(() =>
            Object.values(PLANE_PRESETS).map((preset) => ({
                ...preset,
                surfaces: (preset.wiring ?? [])
                    .filter((w) => /^SERVO\s+\d+$/i.test(w.pad))
                    .map((w) => {
                        const cliSlot = parseInt(w.pad.replace(/^SERVO\s+/i, ""), 10);
                        // Wizard reads multiple field names depending on
                        // step (`.slot` for Discovery pulse at line 2450,
                        // `.servoN` for Endpoints at line 1521, `.slotN`
                        // elsewhere). Populate all three with the same
                        // CLI slot number; `pad` is rendered as
                        // "SERVO {{ pad }}" so it's the bare number to
                        // avoid double-prefix.
                        return {
                            label: w.fn,
                            slot: cliSlot,
                            slotN: cliSlot,
                            // wingEndpoints convention: servoN is 0-based;
                            // CLI label "SERVO N" → servoN = N - 1.
                            // slotForServoN(servoN) returns servoN + 1
                            // (= 1-based FC.SERVO_CONFIG index, since
                            // wing-fork servoConfigs[] is 1-indexed with
                            // [0] reserved).
                            servoN: cliSlot - 1,
                            pad: String(cliSlot),
                        };
                    }),
            })),
        );

        // Cell count for wizard's Step 2 picker: detect from FC battery
        // profile, fall back to 3S when unconfigured.
        const wizardCellCount = computed(() => {
            const fcCells = FC.BATTERY_CONFIG?.batteryCellCount ?? 0;
            return fcCells >= 2 && fcCells <= 6 ? fcCells : 3;
        });

        // Current SERVO N → pad map keyed by slot number string ("1",
        // "2", ...) — matches surface.pad which the wizard's Apply +
        // Discovery templates use as `currentResources[s.pad]`.
        //
        // Two state sources, with the planned pads taking precedence:
        //   1. pinAssignmentPlan.servos — recommender's PLANNED bindings.
        //      Available pre-Apply (computed when preset is staged), so
        //      the Apply preview shows "where each SERVO will land"
        //      instead of "—" (FC doesn't have SERVO N bindings yet —
        //      those pads are still labeled MOTOR N silkscreen-side).
        //   2. hardwareAnalysis.servos — FC's CURRENT resource map after
        //      the Apply commit lands. Fills any slot the plan didn't
        //      cover (e.g. pre-existing manual override the user kept).
        const wizardCurrentResources = computed(() => {
            const map = {};
            // computePresetResourcePlan returns `picks` (NOT `servos`):
            //   picks: Map<number, {pad, timer, channel, source}>
            // keyed by servo slot → object with .pad. The earlier audit
            // confused this with pickOptimalPadLayout's inner return
            // (which IS Map<number, string>). Always go through .pad
            // here; the recommender's picks structure carries timer/
            // channel/source metadata alongside the pad string.
            const picks = pinAssignmentPlan.value?.picks;
            if (picks instanceof Map) {
                for (const [idx, info] of picks) {
                    if (idx != null && info?.pad) {
                        map[String(idx)] = info.pad;
                    }
                }
            }
            // hardwareAnalysis.servos IS an array of {index, pad, ...}
            // per wingResourceAnalyzer. Fills any slot the plan didn't
            // cover (e.g. pre-existing manual override the user kept).
            const fcServos = hardwareAnalysis.value?.servos ?? [];
            for (const s of fcServos) {
                if (s.index != null && s.pad && !map[String(s.index)]) {
                    map[String(s.index)] = s.pad;
                }
            }
            return map;
        });

        // Silkscreen-default pads { motors: [{index, pad}], ledStrips:
        // [{pad}] } sourced from the standalone `padDefaults` ref
        // (populated by readResourceDefaults at line ~2243). NOT nested
        // inside hardwareAnalysis — that's a separate state. Null until
        // first hardware load. Wizard's "Nothing moved" → scan path
        // requires this to know which silkscreen MOTOR pads are
        // candidates to repurpose as scratch SERVO slots.
        const wizardPadDefaults = computed(() => effectivePadDefaults.value);

        // Apply-step preview rows (motors + LED) from the recommender.
        // computePresetResourcePlan returns `motorPicks` (NOT `motors`):
        //   motorPicks: Map<number, {pad, timer, channel, source}>
        // Same shape correction as wizardCurrentResources above —
        // iterate as Map<idx, info-object>, read info.pad.
        const wizardExtraApplyRows = computed(() => {
            const plan = pinAssignmentPlan.value;
            if (!plan) return [];
            const rows = [];
            if (plan.motorPicks instanceof Map) {
                for (const [idx, info] of plan.motorPicks) {
                    if (info?.pad) rows.push({ type: "MOTOR", n: idx, pad: info.pad });
                }
            }
            if (plan.ledStripPad) rows.push({ type: "LED_STRIP", n: 1, pad: plan.ledStripPad });
            return rows;
        });

        // Expected motor bindings for the Motors step's identity walk.
        const wizardExpectedMotors = computed(() => {
            // Pulls actual pad strings from hardwareAnalysis.motors so
            // the Motors step's identity / scan-prep / scan-final logic
            // can build CLI batches against real hardware. Falls back
            // to null pad when motorCount > what the analyzer found
            // (e.g. user picked twin-motor in wizard but only one is
            // wired).
            const motors = [];
            const fcMotors = hardwareAnalysis.value?.motors ?? [];
            const count = motorCount.value || 1;
            for (let i = 1; i <= count; i += 1) {
                const m = fcMotors.find((x) => x.index === i);
                motors.push({ motorIdx: i, label: `Motor ${i}`, pad: m?.pad ?? null });
            }
            return motors;
        });

        // armed prop — proxy via FC.CONFIG.armingDisabled. When false,
        // the FC could be currently armed. Wizard's Safety step refuses
        // to advance if armed.
        const wizardArmed = computed(() => FC.CONFIG?.armingDisabled === false);

        // ════ Wizard apply callbacks ════
        // All callbacks run when wizard's state machine has decided
        // what to commit. Parent persists resume marker (if reboot)
        // then issues MSP/CLI commits. Direction + Endpoints don't
        // reboot — runtime-effective changes only.
        async function wizardApplyCallback(airframeId) {
            applyPreset(airframeId);
            await nextTick();
            persistWizardMarker({
                phase: "post-apply",
                airframeId,
                motorCount: motorCount.value,
            });
            await save();
        }

        // Wizard early-staging hooks: fire as user picks options in
        // Step 2 (Airframe). Without these, pinAssignmentPlan +
        // staged fields are empty at Apply-step render time, so the
        // preview shows "—" for every pad.
        function onWizardAirframeSelected(airframeId) {
            if (!airframeId) return;
            applyPreset(airframeId);
        }
        function onWizardMotorCountSelected(n) {
            const parsed = Number(n);
            if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 8) {
                motorCount.value = parsed;
            }
        }
        function onWizardCellCountSelected(_n) {
            // Cell count is consumed inside applyPreset (which auto-
            // detects from FC.BATTERY_CONFIG with 3S fallback). Wizard
            // emits cellCountSelected for parity with the other picker
            // events; nothing to do here yet.
        }

        async function wizardApplyDirectionCallback(ruleFlips) {
            if (!Array.isArray(ruleFlips) || ruleFlips.length === 0) return;
            for (const flip of ruleFlips) {
                const idx = flip.ruleIdx;
                if (FC.SERVO_RULES?.[idx]) {
                    FC.SERVO_RULES[idx].rate = flip.newRate;
                }
                // Mirror the flip into Vue's reactive mixerState.rules
                // so a later save() (manual or auto) doesn't push the
                // pre-flip preset rates over the FC's now-correct rules.
                // Bench-found: without this sync, mixerState.rules stays
                // at the preset defaults from Apply, and the next save()
                // call's `mspHelper.sendServoMixRules(mixerState.rules)`
                // wipes Direction's flips back to defaults.
                if (mixerState.rules?.[idx]) {
                    mixerState.rules[idx].rate = flip.newRate;
                }
            }
            await new Promise((res, rej) => {
                try {
                    mspHelper.sendServoMixRules(res);
                } catch (err) {
                    rej(err);
                }
            });
            await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
            // Re-baseline initialMixerState so the rule edits we just
            // committed don't show up as pending dirty state on a
            // subsequent manual Save (which would also fire the CLI
            // batch and wipe scan-committed bindings).
            initialMixerState.value = cloneMixerState(mixerState);
        }

        async function wizardApplyEndpointsCallback(changes) {
            // wingEndpoints.js emits change objects shaped:
            //   { servoN, label, oldMin, oldMax, newMin, newMax }
            // servoN is 1-based silkscreen (matches the utility's
            // tests + Direction's convention). Wing-fork SERVO_CONFIG
            // reserves [0]+[1], so SERVO 1 lives at index 2 — `+1`
            // gets us there from a 1-based servoN. Endpoints step
            // only mutates min/max — middle stays at user-set value,
            // so we don't touch it here.
            if (!Array.isArray(changes) || changes.length === 0) return;
            for (const c of changes) {
                const cfg = FC.SERVO_CONFIG?.[c.servoN + 1];
                if (!cfg) continue;
                cfg.min = c.newMin;
                cfg.max = c.newMax;
            }
            await new Promise((res, rej) => {
                try {
                    mspHelper.sendServoConfigurations(res);
                } catch (err) {
                    rej(err);
                }
            });
            await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
        }

        // Empty-array guard: when the wizard determines nothing needs
        // committing (e.g. Discovery's "wiring matches" path), it still
        // calls the relevant callback. Skipping the CLI dispatch on
        // empty input prevents `applyCliLines` throwing + lets the
        // wizard advance to the next step cleanly.
        //
        // Live-data shielding: every CLI batch reboots the FC, which
        // floods the MSP queue with stale MSP_ANALOG (110) etc. polls
        // unless live-data is paused first. Bench-observed: the queue
        // overflow surfaces as "MSP: data request timed-out: 110" + the
        // wizard's resume marker never gets read because loadHardware
        // times out. Helper wraps each callback with the
        // pauseLiveData → clearMspQueue → applyCliLines → resumeLiveData
        // discipline that applyPinAssignment uses for the same reason.
        async function fireWizardCliBatch(cliLines) {
            connectionStore.pauseLiveData();
            try {
                connectionStore.clearMspQueue();
                await applyCliLines(cliLines);
            } finally {
                connectionStore.resumeLiveData();
            }
        }

        async function wizardApplyRemapCallback(cliLines) {
            if (!Array.isArray(cliLines) || cliLines.length === 0) return;
            persistWizardMarker({ phase: "post-remap" });
            await fireWizardCliBatch(cliLines);
        }

        async function wizardApplyScanCallback({
            cliLines,
            scanSlots,
            missingSurfaces,
            originalObservations,
            currentResources,
        }) {
            if (!Array.isArray(cliLines) || cliLines.length === 0) return;
            persistWizardMarker({
                phase: "post-scan-prep",
                scanSlots,
                missingSurfaces,
                originalObservations,
                currentResources,
            });
            await fireWizardCliBatch(cliLines);
        }

        async function wizardApplyMotorsCallback(cliLines) {
            if (!Array.isArray(cliLines) || cliLines.length === 0) return;
            persistWizardMarker({ phase: "post-motors" });
            await fireWizardCliBatch(cliLines);
        }

        async function wizardApplyMotorScanPrepCallback({ cliLines, scanSlots, missingMotors }) {
            if (!Array.isArray(cliLines) || cliLines.length === 0) return;
            // missingMotors round-trips through the marker so the
            // wizard's surface-led "Searching for MOTOR N" banner has
            // a target after the reboot. Without this, motorObservations
            // re-hydrates empty, motorScanMissingList computes [], and
            // the Moved button stays disabled.
            persistWizardMarker({ phase: "post-motor-scan-prep", scanSlots, missingMotors });
            await fireWizardCliBatch(cliLines);
        }

        async function wizardApplyMotorFinalCallback(cliLines) {
            if (!Array.isArray(cliLines) || cliLines.length === 0) return;
            persistWizardMarker({ phase: "post-motor-final" });
            await fireWizardCliBatch(cliLines);
        }

        async function wizardApplyYawFlipCallback(cliLines) {
            if (!Array.isArray(cliLines) || cliLines.length === 0) return;
            persistWizardMarker({ phase: "post-yaw-flip" });
            await fireWizardCliBatch(cliLines);
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
            AUTOLAND_FIELD_DEFS,
            fields,
            launchFields,
            gpsRescueFields,
            autolandFields,
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
            removeAssignment,
            addServoPin,
            clearPadOverrides,
            candidateSourceLabel,
            padMappingRows,
            padDefaults,
            padAllowlist,
            togglePadInAllowlist,
            pinAssignmentInfeasible,
            applyingPinAssignment,
            applyPinAssignment,
            loading,
            saving,
            error,
            apiOk,
            combinedYawSupported,
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
            availableSubTabIds,
            // Plane Setup Wizard launcher + Reset wing config
            wizardOpen,
            showResetDialog,
            wizardResumeState,
            wizardArmed,
            wizardCellCount,
            wizardAirframes,
            wizardCurrentResources,
            wizardPadDefaults,
            wizardExtraApplyRows,
            wizardExpectedMotors,
            openWizard,
            closeWizard,
            finishWizard,
            performResetWingConfig,
            onWizardAirframeSelected,
            onWizardMotorCountSelected,
            onWizardCellCountSelected,
            wizardApplyCallback,
            wizardApplyDirectionCallback,
            wizardApplyEndpointsCallback,
            wizardApplyRemapCallback,
            wizardApplyScanCallback,
            wizardApplyMotorsCallback,
            wizardApplyMotorScanPrepCallback,
            wizardApplyMotorFinalCallback,
            wizardApplyYawFlipCallback,
            wiringPresetId,
            motorCount,
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
.diff_thrust_toggle {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: 10px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.03);
    border-left: 3px solid rgba(120, 200, 120, 0.4);
    border-radius: 3px;
    font-size: 0.9em;
    cursor: pointer;
}
.diff_thrust_toggle input[type="checkbox"] {
    margin: 0;
}
.diff_thrust_hint {
    color: #888;
    font-style: italic;
    font-size: 0.88em;
    margin-left: 4px;
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
.yaw_blend_panel {
    margin-top: 10px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.03);
    border-left: 3px solid rgba(120, 200, 120, 0.4);
    border-radius: 3px;
}
.yaw_blend_desc {
    margin: 0 0 8px 0;
    font-size: 0.88em;
    color: #aaa;
}
.yaw_blend_row {
    display: grid;
    grid-template-columns: 150px 1fr 48px;
    align-items: center;
    gap: 10px;
    margin: 6px 0;
    font-size: 0.9em;
}
.yaw_blend_label {
    color: #ccc;
}
.yaw_blend_value {
    text-align: right;
    color: #9c9;
    font-variant-numeric: tabular-nums;
}
.yaw_blend_hint {
    margin: 8px 0 0 0;
    font-size: 0.82em;
    color: #888;
    font-style: italic;
}
/* Plane Setup Wizard / Reset wing config launcher row.
   Without these the global .save_btn rules only apply inside
   .fixed_band, so the buttons fall back to bare anchor-yellow
   text. Mirror the bottom-toolbar style and bump the size one
   notch up so they read as the primary entry-points to the tab. */
.wing_launcher_buttons {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 4px 0;
}
.wing_launcher_buttons .save_btn {
    margin: 0;
}
.wing_launcher_buttons .save_btn a.update {
    display: inline-block;
    background-color: var(--primary-500);
    border: 1px solid var(--primary-600);
    border-radius: 4px;
    color: #000;
    font-weight: bold;
    font-size: 13px;
    padding: 0 14px;
    line-height: 32px;
    cursor: pointer;
    text-decoration: none;
    transition: background-color ease 0.15s;
}
.wing_launcher_buttons .save_btn a.update:hover {
    background-color: var(--primary-400);
}
.wing_launcher_buttons .save_btn a.update.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
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
/* Timer-remap indicator. Teal so it's distinct from the red remove
 * button and the LED/UART notice yellows — pilots scanning the panel
 * see at a glance that the planned CLI batch will retune this pad's
 * alternate function before binding. */
.pin_assign_timer_remap_badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 6px;
    background: #1e3a3a;
    border: 1px solid #2f5f5f;
    color: #6fd2d2;
    border-radius: 3px;
    font-size: 0.78em;
    font-family: monospace;
    vertical-align: middle;
    cursor: help;
}
/* DMA stream indicator on motor rows. Green = healthy DMA. Red =
 * bit-bang fallback (motor still runs but software-driven). Sibling
 * to the timer-remap badge so pilots can scan a single visual row
 * for "is this motor's wiring going to work cleanly?" */
.pin_assign_dma_badge {
    display: inline-block;
    margin-left: 4px;
    padding: 1px 6px;
    background: #1e3a1e;
    border: 1px solid #2f5f2f;
    color: #6fd26f;
    border-radius: 3px;
    font-size: 0.78em;
    font-family: monospace;
    vertical-align: middle;
    cursor: help;
}
.pin_assign_dma_bitbang_badge {
    display: inline-block;
    margin-left: 4px;
    padding: 1px 6px;
    background: #3a1e1e;
    border: 1px solid #5f2f2f;
    color: #d26f6f;
    border-radius: 3px;
    font-size: 0.78em;
    font-family: monospace;
    vertical-align: middle;
    cursor: help;
}
/* Not-enough-pads banner. Yellow/orange to signal "user attention
 * required" — distinct from the red bit-bang badge (which is
 * informational, not blocking) and the existing LED/UART notice
 * yellows (which are advisory). */
.pin_assign_infeasible_banner {
    margin: 8px 0;
    padding: 8px 12px;
    background: #3a3015;
    border: 1px solid #6f5f25;
    color: #e6c66d;
    border-radius: 3px;
    font-size: 0.92em;
    cursor: help;
}
.pin_assign_table td.pin_assign_remove_cell {
    width: 30px;
    text-align: right;
    padding-right: 2px;
}
.pin_assign_remove {
    background: transparent;
    border: 1px solid #5a2a2a;
    color: #e87070;
    width: 24px;
    height: 24px;
    border-radius: 3px;
    font-size: 0.85em;
    line-height: 1;
    cursor: pointer;
    padding: 0;
}
.pin_assign_remove:hover:not(:disabled) {
    background: #4a1e1e;
    color: #ff9090;
}
.pin_assign_remove:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
.pin_assign_add_row {
    margin: 4px 0 12px 0;
}
.pin_assign_add {
    background: transparent;
    border: 1px dashed #555;
    color: #aaa;
    padding: 4px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.9em;
}
.pin_assign_add:hover:not(:disabled) {
    border-color: #888;
    color: #ddd;
}
.pin_assign_add:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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
    display: inline;
    margin-bottom: 6px;
    font-size: 0.9em;
    color: #aaa;
}
.pin_assign_source {
    display: inline-block;
    margin-left: 8px;
    margin-bottom: 6px;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.72em;
    font-weight: normal;
    vertical-align: middle;
    cursor: help;
}
.pin_assign_source_firmware {
    background: rgba(120, 200, 120, 0.18);
    color: #9c9;
    border: 1px solid rgba(120, 200, 120, 0.35);
}
.pin_assign_source_snapshot {
    background: rgba(220, 180, 80, 0.15);
    color: #c9a865;
    border: 1px solid rgba(220, 180, 80, 0.32);
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
/* AF column: current AF in normal weight, alt-AF count as a small
 * teal pill matching the timer-remap badge family. Hovering the pill
 * surfaces the full alt-AF list via the title attribute — pilots can
 * confirm that runtime AF discovery (timer <pin> list) ran without
 * needing devtools. */
.pin_assign_mapping_table .pin_assign_af_cell {
    white-space: nowrap;
}
.pin_assign_af_current {
    font-family: monospace;
    color: #ddd;
}
.pin_assign_af_alts {
    display: inline-block;
    margin-left: 4px;
    padding: 0 5px;
    background: #1e3a3a;
    border: 1px solid #2f5f5f;
    color: #6fd2d2;
    border-radius: 3px;
    font-size: 0.78em;
    font-family: monospace;
    cursor: help;
}
/* Physical-pad allowlist column. Default-checked; un-checking
 * removes the pad from the optimizer pool. Tight cell so the
 * existing layout doesn't break. */
.pin_assign_mapping_table .pin_assign_allowlist_col {
    text-align: center;
    width: 80px;
}
.pin_assign_allowlist_col input[type="checkbox"] {
    cursor: pointer;
    margin: 0;
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
