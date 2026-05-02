<template>
    <Dialog
        :model-value="modelValue"
        :title="$t('planeWizardTitle')"
        :closeable="!applyInFlight && !remapInFlight && !scanInFlight"
        @update:model-value="handleClose"
    >
        <div class="wizard-body">
            <!-- Stepper strip -->
            <div class="wizard-stepper">
                <div
                    v-for="(label, idx) in stepLabels"
                    :key="idx"
                    class="wizard-step-pill"
                    :class="{
                        'wizard-step-pill--active': step === idx,
                        'wizard-step-pill--done': completed.has(idx),
                    }"
                >
                    <span class="wizard-step-num">{{ idx + 1 }}</span>
                    <span class="wizard-step-label">{{ label }}</span>
                </div>
            </div>

            <!-- Step 0: Safety -->
            <section v-if="step === 0" class="wizard-step">
                <h3>{{ $t("planeWizardSafetyHeading") }}</h3>
                <p class="wizard-help">{{ $t("planeWizardSafetyIntro") }}</p>
                <div v-if="armed" class="wizard-blocker">
                    <strong>{{ $t("planeWizardSafetyArmedTitle") }}</strong>
                    <p>{{ $t("planeWizardSafetyArmedHelp") }}</p>
                </div>
                <label class="wizard-check">
                    <input v-model="safety.propsRemoved" type="checkbox" />
                    <span>{{ $t("planeWizardSafetyPropsLabel") }}</span>
                </label>
                <p class="wizard-help wizard-help--small">{{ $t("planeWizardSafetyPropsHelp") }}</p>
            </section>

            <!-- Step 1: Airframe -->
            <section v-if="step === 1" class="wizard-step">
                <h3>{{ $t("planeWizardAirframeHeading") }}</h3>
                <p class="wizard-help">{{ $t("planeWizardAirframeIntro") }}</p>
                <div class="wizard-airframe-grid">
                    <button
                        v-for="af in airframes"
                        :key="af.id"
                        type="button"
                        class="wizard-airframe-card"
                        :class="{ 'wizard-airframe-card--selected': airframeId === af.id }"
                        @click="airframeId = af.id"
                    >
                        <WizardSurfaceVisual class="wizard-airframe-card-visual" :airframe-id="af.id" :size="140" />
                        <div class="wizard-airframe-card-title">{{ af.label }}</div>
                        <div class="wizard-airframe-card-desc">{{ af.description }}</div>
                    </button>
                </div>
                <div v-if="airframeId" class="wizard-airframe-motorcount">
                    <label class="wizard-check">
                        <input v-model="wizardTwoMotors" type="checkbox" />
                        <span>{{ $t("planeWizardAirframeTwoMotorsCheck") }}</span>
                    </label>
                    <p class="wizard-help wizard-help--small">{{ $t("planeWizardAirframeTwoMotorsHelp") }}</p>
                </div>
                <div v-if="airframeId" class="wizard-airframe-cells">
                    <label class="wizard-cells-label">
                        <span>{{ $t("planeWizardAirframeCellsLabel") }}</span>
                        <select v-model="wizardCellCount" class="wizard-cells-select">
                            <option v-for="n in CELL_COUNT_OPTIONS" :key="n" :value="n">{{ n }}S</option>
                        </select>
                    </label>
                    <p class="wizard-help wizard-help--small">{{ $t("planeWizardAirframeCellsHelp") }}</p>
                </div>
            </section>

            <!-- Step 2: Apply -->
            <section v-if="step === 2" class="wizard-step">
                <h3>{{ $t("planeWizardApplyHeading") }}</h3>
                <p v-if="applyState === 'idle'" class="wizard-help">
                    {{ $t("planeWizardApplyReady") }}
                </p>
                <div v-if="applyState === 'idle' && surfaces.length > 0" class="wizard-pads-summary">
                    <h4>{{ $t("planeWizardApplyPadsHeading") }}</h4>
                    <table class="wizard-pads-table">
                        <thead>
                            <tr>
                                <th>{{ $t("planeWizardApplyTypeCol") }}</th>
                                <th>{{ $t("planeWizardApplyPadCol") }}</th>
                                <th>{{ $t("planeWizardApplyExpectedCol") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in extraApplyRows.filter((r) => r.type === 'MOTOR')" :key="'m' + row.n">
                                <td>MOTOR {{ row.n }}</td>
                                <td>{{ row.pad || "—" }}</td>
                                <td class="wizard-pads-muted">{{ $t("planeWizardApplyMotorRowNote") }}</td>
                            </tr>
                            <tr v-for="s in surfaces" :key="'s' + s.pad">
                                <td>SERVO {{ s.pad }}</td>
                                <td>{{ currentResources[s.pad] || "—" }}</td>
                                <td>{{ s.label }}</td>
                            </tr>
                            <tr
                                v-for="row in extraApplyRows.filter((r) => r.type === 'LED_STRIP')"
                                :key="'led' + row.n"
                            >
                                <td>LED_STRIP {{ row.n }}</td>
                                <td>{{ row.pad || "—" }}</td>
                                <td class="wizard-pads-muted">{{ $t("planeWizardApplyLedRowNote") }}</td>
                            </tr>
                        </tbody>
                    </table>
                    <p class="wizard-help wizard-help--small">{{ $t("planeWizardApplyPadsHint") }}</p>
                </div>
                <div v-if="applyState === 'applying'" class="wizard-critical">
                    <div class="wizard-spinner" />
                    <strong>{{ $t("planeWizardApplyInProgress") }}</strong>
                    <p>{{ $t("planeWizardApplyDoNotDisconnect") }}</p>
                </div>
                <div v-if="applyState === 'error'" class="wizard-blocker">
                    <strong>{{ $t("planeWizardApplyFailedTitle") }}</strong>
                    <p>{{ applyError }}</p>
                </div>
                <div v-if="applyState === 'done'" class="wizard-callout">
                    <strong>{{ $t("planeWizardApplyAlreadyDoneTitle") }}</strong>
                    <p>{{ $t("planeWizardApplyAlreadyDoneHelp") }}</p>
                </div>
            </section>

            <!-- Step 3: Discovery (3 internal phases: gate / walking / reviewing) -->
            <section v-if="step === 3" class="wizard-step">
                <h3>{{ $t("planeWizardDiscoveryHeading") }}</h3>
                <div class="wz-split">
                    <div class="wz-split-visual">
                        <WizardSurfaceVisual
                            :airframe-id="airframeId"
                            :highlight="currentVisualHighlight"
                            :dir="currentVisualDir"
                            :size="220"
                        />
                    </div>
                    <div class="wz-split-controls">
                        <div
                            v-if="resumeState && discoveryPhase === 'gate'"
                            class="wizard-callout wizard-callout--info"
                        >
                            <strong>{{ $t("planeWizardResumedTitle") }}</strong>
                            <p>{{ $t("planeWizardResumedHelp") }}</p>
                        </div>

                        <!-- Phase: pre-pulse safety re-confirm -->
                        <template v-if="discoveryPhase === 'gate'">
                            <div class="wizard-blocker">
                                <strong>{{ $t("planeWizardDiscoveryGateTitle") }}</strong>
                                <p>{{ $t("planeWizardDiscoveryGateHelp") }}</p>
                            </div>
                            <label class="wizard-check">
                                <input v-model="propsConfirmedForDiscovery" type="checkbox" />
                                <span>{{ $t("planeWizardDiscoveryGateCheck") }}</span>
                            </label>
                        </template>

                        <!-- Phase: walk each surface -->
                        <template v-if="discoveryPhase === 'walking'">
                            <p class="wizard-help">{{ $t("planeWizardDiscoveryIntro") }}</p>
                            <div v-if="surfaces.length === 0" class="wizard-help">
                                {{ $t("planeWizardIdentityNoSurfaces") }}
                            </div>
                            <template v-else>
                                <div class="wizard-identity-progress">
                                    {{ $t("planeWizardIdentityProgress") }}
                                    <strong>{{ surfaceIdx + 1 }} / {{ surfaces.length }}</strong>
                                </div>
                                <div class="wizard-identity-current">
                                    <div class="wizard-identity-label">
                                        <span class="wizard-identity-pad">SERVO {{ currentSurface.pad }}</span>
                                        <span class="wizard-identity-fn">
                                            {{ $t("planeWizardDiscoveryExpectedPrefix") }} {{ currentSurface.label }}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        class="wizard-btn wizard-btn--primary"
                                        :disabled="pulseInFlight"
                                        @click="pulseCurrentSurface"
                                    >
                                        <span v-if="pulseInFlight">{{ $t("planeWizardIdentityPulsing") }}</span>
                                        <span v-else>{{ $t("planeWizardIdentityPulseButton") }}</span>
                                    </button>
                                </div>
                                <p v-if="pulseError" class="wizard-blocker">{{ pulseError }}</p>
                                <div class="wizard-dropdown-row">
                                    <label class="wizard-dropdown-label">{{
                                        $t("planeWizardDiscoveryDropdownLabel")
                                    }}</label>
                                    <select
                                        class="wizard-dropdown"
                                        :value="observations[surfaceIdx] ?? currentSurface.label"
                                        :disabled="pulseInFlight"
                                        @change="pickObservation($event.target.value)"
                                    >
                                        <optgroup :label="$t('planeWizardDiscoveryGroupSurfaces')">
                                            <option v-for="opt in surfaceOptions" :key="opt.value" :value="opt.value">
                                                {{ opt.label
                                                }}{{
                                                    opt.value === currentSurface.label
                                                        ? $t("planeWizardExpectedSuffix")
                                                        : ""
                                                }}
                                            </option>
                                        </optgroup>
                                        <optgroup :label="$t('planeWizardDiscoveryGroupOutcomes')">
                                            <option :value="OBS_NOTHING">{{ $t("planeWizardObsNothingTitle") }}</option>
                                            <option :value="OBS_MULTIPLE">
                                                {{ $t("planeWizardObsMultipleTitle") }}
                                            </option>
                                            <option :value="OBS_NO_SERVO">
                                                {{ $t("planeWizardObsNoServoTitle") }}
                                            </option>
                                        </optgroup>
                                    </select>
                                </div>
                            </template>
                        </template>

                        <!-- Phase: review derived remap before committing -->
                        <template v-if="discoveryPhase === 'reviewing'">
                            <div
                                v-if="
                                    !remapResult?.needsRemap &&
                                    !(remapResult?.unresolvedMultiple?.length > 0) &&
                                    !scanPlan?.eligible &&
                                    !remapInFlight &&
                                    !remapError &&
                                    !scanError
                                "
                                class="wizard-callout wizard-callout--info"
                            >
                                <strong>{{ $t("planeWizardDiscoveryAllGoodTitle") }}</strong>
                                <p>{{ $t("planeWizardDiscoveryAllGoodHelp") }}</p>
                            </div>
                            <template v-if="remapResult?.needsRemap">
                                <p class="wizard-help">{{ $t("planeWizardRemapIntro") }}</p>
                                <table class="wizard-pads-table">
                                    <thead>
                                        <tr>
                                            <th>SERVO</th>
                                            <th>{{ $t("planeWizardRemapFromCol") }}</th>
                                            <th>{{ $t("planeWizardRemapToCol") }}</th>
                                            <th>{{ $t("planeWizardRemapSurfaceCol") }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="swap in remapResult.swaps" :key="swap.servoN">
                                            <td>SERVO {{ swap.servoN }}</td>
                                            <td class="wizard-remap-from">{{ swap.fromPad }}</td>
                                            <td class="wizard-remap-to">{{ swap.toPad }}</td>
                                            <td>{{ swap.surface }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </template>
                            <p v-if="remapResult && remapResult.unresolvedMultiple.length > 0" class="wizard-blocker">
                                <strong>{{ $t("planeWizardRemapUnresolvedTitle") }}</strong>
                                <span
                                    >{{ $t("planeWizardRemapUnresolvedHelp") }} ({{
                                        remapResult.unresolvedMultiple.map((n) => "SERVO " + n).join(", ")
                                    }})</span
                                >
                            </p>
                            <!-- Phase 3.5 scan offer -->
                            <div v-if="scanPlan?.eligible" class="wizard-callout wizard-callout--info">
                                <strong>{{ $t("planeWizardScanOfferTitle") }}</strong>
                                <p>
                                    {{ $t("planeWizardScanOfferHelp") }}
                                    <em>({{ scanPlan.missingSurfaces.join(", ") }})</em>
                                </p>
                                <p>{{ $t("planeWizardScanOfferAction") }}</p>
                                <button
                                    type="button"
                                    class="wizard-btn wizard-btn--primary"
                                    :disabled="scanInFlight || remapInFlight"
                                    @click="runScan"
                                >
                                    <span v-if="scanInFlight">{{ $t("planeWizardScanInProgress") }}</span>
                                    <span v-else>{{ $t("planeWizardScanOfferButton") }}</span>
                                </button>
                            </div>
                            <div v-if="scanError" class="wizard-blocker">
                                <strong>{{ $t("planeWizardScanFailedTitle") }}</strong>
                                <p>{{ scanError }}</p>
                            </div>
                            <div v-if="remapInFlight" class="wizard-critical">
                                <div class="wizard-spinner" />
                                <strong>{{ $t("planeWizardRemapInProgress") }}</strong>
                                <p>{{ $t("planeWizardApplyDoNotDisconnect") }}</p>
                            </div>
                            <div v-if="remapError" class="wizard-blocker">
                                <strong>{{ $t("planeWizardRemapFailedTitle") }}</strong>
                                <p>{{ remapError }}</p>
                            </div>
                        </template>

                        <!-- Phase: scan unused motor pads (after post-scan-prep reboot) -->
                        <template v-if="discoveryPhase === 'scanning'">
                            <div class="wizard-callout wizard-callout--info">
                                <strong>{{ $t("planeWizardScanResumedTitle") }}</strong>
                                <p>{{ $t("planeWizardScanResumedHelp") }}</p>
                            </div>
                            <p class="wizard-help">{{ $t("planeWizardScanWalkIntro") }}</p>
                            <div v-if="scanSlots.length === 0" class="wizard-help">
                                {{ $t("planeWizardScanNoSlots") }}
                            </div>
                            <template v-else>
                                <!-- Surface-led callout — hidden while the
                                     scan finalize bug is chased. Restore by
                                     re-enabling the v-if block below + the
                                     2-card pick further down, then hiding
                                     the legacy dropdown. -->
                                <div v-if="false" class="wizard-callout wizard-callout--accent">
                                    <strong>
                                        {{ $t("planeWizardScanSearchingFor") }}
                                        {{ currentSearchingSurface }}
                                    </strong>
                                    <p class="wizard-help">
                                        {{ $t("planeWizardScanSurfaceLedHint") }}
                                    </p>
                                </div>
                                <div class="wizard-identity-progress">
                                    {{ $t("planeWizardScanProgress") }}
                                    <strong>{{ scanSurfaceIdx + 1 }} / {{ scanSlots.length }}</strong>
                                </div>
                                <div class="wizard-identity-current">
                                    <div class="wizard-identity-label">
                                        <span class="wizard-identity-pad">
                                            SERVO {{ scanSlots[scanSurfaceIdx].servoN }}
                                        </span>
                                        <span class="wizard-identity-fn">
                                            {{ $t("planeWizardScanWasMotor") }} MOTOR
                                            {{ scanSlots[scanSurfaceIdx].fromMotorN }} /
                                            {{ scanSlots[scanSurfaceIdx].pad }}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        class="wizard-btn wizard-btn--primary"
                                        :disabled="pulseInFlight"
                                        @click="pulseCurrentScanSlot"
                                    >
                                        <span v-if="pulseInFlight">{{ $t("planeWizardIdentityPulsing") }}</span>
                                        <span v-else>{{ $t("planeWizardIdentityPulseButton") }}</span>
                                    </button>
                                </div>
                                <p v-if="pulseError" class="wizard-blocker">{{ pulseError }}</p>
                                <!-- Surface-led "Searching for X" banner.
                                     Names the missing surface the wizard
                                     is currently hunting for so the user
                                     knows what the Moved button will bind.
                                     Hidden once every missing surface has
                                     been matched (currentSearchingSurface
                                     is null) — Continue advances. -->
                                <div v-if="currentSearchingSurface" class="wizard-callout wizard-callout--info">
                                    <strong>
                                        {{ $t("planeWizardScanSearchingFor") }}
                                        {{ currentSearchingSurface }}
                                    </strong>
                                    <p>{{ $t("planeWizardScanSurfaceLedHint") }}</p>
                                </div>
                                <div v-else class="wizard-callout wizard-callout--success">
                                    <strong>{{ $t("planeWizardScanComplete") }}</strong>
                                </div>
                                <!-- Two-button surface-led pick. Greedy:
                                     each Moved click consumes the current
                                     search target; Not-moved just advances
                                     the slot. -->
                                <div class="wizard-button-row">
                                    <button
                                        type="button"
                                        class="wizard-btn wizard-btn--primary"
                                        :disabled="pulseInFlight || !currentSearchingSurface"
                                        @click="onScanSurfaceMoved"
                                    >
                                        {{ $t("planeWizardScanMoved") }}
                                    </button>
                                    <button
                                        type="button"
                                        class="wizard-btn"
                                        :disabled="pulseInFlight"
                                        @click="onScanSurfaceDidntMove"
                                    >
                                        {{ $t("planeWizardScanDidntMove") }}
                                    </button>
                                </div>
                            </template>
                        </template>

                        <!-- Phase: review combined remap (original + scan) -->
                        <template v-if="discoveryPhase === 'final-reviewing'">
                            <p class="wizard-help">{{ $t("planeWizardFinalRemapIntro") }}</p>
                            <table v-if="finalRemapResult?.swaps?.length" class="wizard-pads-table">
                                <thead>
                                    <tr>
                                        <th>SERVO</th>
                                        <th>{{ $t("planeWizardRemapFromCol") }}</th>
                                        <th>{{ $t("planeWizardRemapToCol") }}</th>
                                        <th>{{ $t("planeWizardRemapSurfaceCol") }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="swap in finalRemapResult.swaps" :key="swap.servoN">
                                        <td>SERVO {{ swap.servoN }}</td>
                                        <td class="wizard-remap-from">{{ swap.fromPad }}</td>
                                        <td class="wizard-remap-to">{{ swap.toPad }}</td>
                                        <td>{{ swap.surface }}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <p
                                v-if="finalRemapResult && finalRemapResult.stillMissing.length > 0"
                                class="wizard-blocker"
                            >
                                <strong>{{ $t("planeWizardFinalStillMissingTitle") }}</strong>
                                <span
                                    >{{ $t("planeWizardFinalStillMissingHelp") }} ({{
                                        finalRemapResult.stillMissing.join(", ")
                                    }})</span
                                >
                            </p>
                            <div v-if="remapInFlight" class="wizard-critical">
                                <div class="wizard-spinner" />
                                <strong>{{ $t("planeWizardRemapInProgress") }}</strong>
                                <p>{{ $t("planeWizardApplyDoNotDisconnect") }}</p>
                            </div>
                            <div v-if="remapError" class="wizard-blocker">
                                <strong>{{ $t("planeWizardRemapFailedTitle") }}</strong>
                                <p>{{ remapError }}</p>
                            </div>
                        </template>
                    </div>
                </div>
            </section>

            <!-- Step 4: Direction -->
            <section v-if="step === 4" class="wizard-step">
                <h3>{{ $t("planeWizardDirectionHeading") }}</h3>
                <div class="wz-split">
                    <div class="wz-split-visual">
                        <WizardSurfaceVisual
                            :airframe-id="airframeId"
                            :highlight="currentVisualHighlight"
                            :dir="currentVisualDir"
                            :size="220"
                        />
                        <div
                            v-if="directionStickHint"
                            class="wz-stick-hint"
                            :class="`wz-stick-hint--${directionStickHint.mode}`"
                        >
                            <span class="wz-stick-hint-label">{{ directionStickHint.label }}</span>
                            <span class="wz-stick-hint-body">
                                <span class="wz-stick-hint-stick">{{ directionStickHint.stick }}</span>
                                <template v-if="directionStickHint.motion">
                                    <span class="wz-stick-hint-arrow">→</span>
                                    <span class="wz-stick-hint-motion">{{ directionStickHint.motion }}</span>
                                </template>
                            </span>
                        </div>
                    </div>
                    <div class="wz-split-controls">
                        <p class="wizard-help">{{ $t("planeWizardDirectionIntro") }}</p>

                        <!-- Mode toggle -->
                        <div class="wizard-mode-toggle">
                            <button
                                type="button"
                                class="wizard-btn"
                                :class="{ 'wizard-btn--primary': directionMode === 'pilot' }"
                                @click="setDirectionMode('pilot')"
                            >
                                {{ $t("planeWizardDirectionModePilot") }}
                            </button>
                            <button
                                type="button"
                                class="wizard-btn"
                                :class="{ 'wizard-btn--primary': directionMode === 'wizard' }"
                                @click="setDirectionMode('wizard')"
                            >
                                {{ $t("planeWizardDirectionModeWizard") }}
                            </button>
                        </div>

                        <!-- Walking phase: per-(surface, axis) observation -->
                        <template v-if="directionPhase === 'walking' && directionSlots.length > 0">
                            <div class="wizard-identity-progress">
                                {{ $t("planeWizardDirectionProgress") }}
                                <strong>{{ directionSlotIdx + 1 }} / {{ directionSlots.length }}</strong>
                            </div>
                            <div class="wizard-identity-current">
                                <div class="wizard-identity-label">
                                    <span class="wizard-identity-pad">
                                        {{ currentDirectionSlot.surface.label }}
                                    </span>
                                    <span class="wizard-identity-fn">
                                        {{ $t("planeWizardDirectionAxisLabel_" + currentDirectionSlot.axis) }}
                                    </span>
                                </div>
                            </div>

                            <!-- Pilot Stick mode -->
                            <template v-if="directionMode === 'pilot'">
                                <p class="wizard-help">
                                    {{ $t("planeWizardDirectionPilotInstr_" + currentDirectionSlot.axis) }}
                                </p>
                                <div class="wizard-joystick">
                                    <div class="wizard-joystick-pad">
                                        <div class="wizard-joystick-thumb" :style="joystickThumbStyle" />
                                    </div>
                                    <div class="wizard-joystick-meta">
                                        <div>Roll: {{ rcRoll }}</div>
                                        <div>Pitch: {{ rcPitch }}</div>
                                        <div>Yaw: {{ rcYaw }}</div>
                                    </div>
                                </div>
                            </template>

                            <!-- Wizard Drives mode -->
                            <template v-if="directionMode === 'wizard'">
                                <p class="wizard-help">{{ $t("planeWizardDirectionWizardInstr") }}</p>
                                <button
                                    type="button"
                                    class="wizard-btn wizard-btn--primary"
                                    :disabled="pulseInFlight"
                                    @click="pulseDirectionAxis"
                                >
                                    <span v-if="pulseInFlight">{{ $t("planeWizardIdentityPulsing") }}</span>
                                    <span v-else>{{ $t("planeWizardDirectionPulseButton") }}</span>
                                </button>
                                <p v-if="pulseError" class="wizard-blocker">{{ pulseError }}</p>
                            </template>

                            <!-- Match / Wrong buttons (shared) -->
                            <div class="wizard-observation-grid">
                                <button
                                    type="button"
                                    class="wizard-observation-card"
                                    :class="{
                                        'wizard-observation-card--selected':
                                            directionObservations[currentDirectionSlot.surface.slotN]?.[
                                                currentDirectionSlot.axis
                                            ] === 'match',
                                    }"
                                    @click="recordDirectionObservation('match')"
                                >
                                    <strong>{{ $t("planeWizardDirectionMatchTitle") }}</strong>
                                    <span>{{ $t("planeWizardDirectionMatchHelp") }}</span>
                                </button>
                                <button
                                    type="button"
                                    class="wizard-observation-card"
                                    :class="{
                                        'wizard-observation-card--selected':
                                            directionObservations[currentDirectionSlot.surface.slotN]?.[
                                                currentDirectionSlot.axis
                                            ] === 'wrong',
                                    }"
                                    @click="recordDirectionObservation('wrong')"
                                >
                                    <strong>{{ $t("planeWizardDirectionWrongTitle") }}</strong>
                                    <span>{{ $t("planeWizardDirectionWrongHelp") }}</span>
                                </button>
                            </div>
                        </template>

                        <!-- Reviewing phase -->
                        <template v-if="directionPhase === 'reviewing'">
                            <template v-if="directionFixes && directionFixes.needsApply">
                                <p class="wizard-help">{{ $t("planeWizardDirectionReviewIntro") }}</p>
                                <table class="wizard-pads-table">
                                    <thead>
                                        <tr>
                                            <th>{{ $t("planeWizardDirectionFixSurfaceCol") }}</th>
                                            <th>{{ $t("planeWizardDirectionFixAxisCol") }}</th>
                                            <th>{{ $t("planeWizardDirectionFixActionCol") }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(fix, i) in directionFixes.ruleFlips" :key="i">
                                            <td>{{ fix.surface }}</td>
                                            <td>{{ $t("planeWizardDirectionAxisLabel_" + fix.axis) }}</td>
                                            <td>{{ fix.oldRate }} → {{ fix.newRate }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </template>
                            <div v-else class="wizard-callout wizard-callout--info">
                                <strong>{{ $t("planeWizardDirectionAllMatchTitle") }}</strong>
                                <p>{{ $t("planeWizardDirectionAllMatchHelp") }}</p>
                            </div>
                            <div v-if="directionInFlight" class="wizard-critical">
                                <div class="wizard-spinner" />
                                <strong>{{ $t("planeWizardDirectionApplyInProgress") }}</strong>
                                <p>{{ $t("planeWizardDirectionApplyDoNotDisconnect") }}</p>
                            </div>
                            <div v-if="directionError" class="wizard-blocker">
                                <strong>{{ $t("planeWizardDirectionApplyFailedTitle") }}</strong>
                                <p>{{ directionError }}</p>
                            </div>
                        </template>
                    </div>
                </div>
            </section>

            <!-- Step 5: Endpoints -->
            <section v-if="step === 5" class="wizard-step">
                <h3>{{ $t("planeWizardEndpointsHeading") }}</h3>
                <div class="wz-split">
                    <div class="wz-split-visual">
                        <WizardSurfaceVisual
                            :airframe-id="airframeId"
                            :highlight="currentVisualHighlight"
                            :dir="currentVisualDir"
                            :size="220"
                        />
                    </div>
                    <div class="wz-split-controls">
                        <p class="wizard-help">{{ $t("planeWizardEndpointsIntro") }}</p>

                        <div class="wizard-callout wizard-callout--info wizard-endpoints-skip">
                            <div>
                                <strong>{{ $t("planeWizardEndpointsSkipTitle") }}</strong>
                                <p>{{ $t("planeWizardEndpointsSkipHelp") }}</p>
                            </div>
                            <button
                                type="button"
                                class="wizard-btn"
                                :disabled="endpointInFlight"
                                @click="skipEndpoints"
                            >
                                {{ $t("planeWizardEndpointsSkipButton") }}
                            </button>
                        </div>

                        <!-- Walking phase -->
                        <template v-if="endpointPhase === 'walking' && currentEndpointStop">
                            <div class="wizard-identity-progress">
                                {{ $t("planeWizardEndpointsProgress") }}
                                <strong>{{ endpointStopIdx + 1 }} / {{ endpointStops.length }}</strong>
                            </div>
                            <div class="wizard-identity-current">
                                <div class="wizard-identity-label">
                                    <span class="wizard-identity-pad">
                                        {{ currentEndpointSlot.surface.label }}
                                    </span>
                                    <span class="wizard-identity-fn">
                                        {{
                                            currentEndpointStop.end === "min"
                                                ? $t("planeWizardEndpointsEndMin")
                                                : $t("planeWizardEndpointsEndMax")
                                        }}
                                    </span>
                                </div>
                            </div>

                            <div class="wizard-endpoint-value">
                                <div class="wizard-endpoint-pwm">{{ currentEndpointValue }}<span>µs</span></div>
                                <div class="wizard-endpoint-steppers">
                                    <button type="button" class="wizard-btn" @click="nudgeCurrentEndpoint(-10)">
                                        -10
                                    </button>
                                    <button type="button" class="wizard-btn" @click="nudgeCurrentEndpoint(-1)">
                                        -1
                                    </button>
                                    <button type="button" class="wizard-btn" @click="nudgeCurrentEndpoint(1)">
                                        +1
                                    </button>
                                    <button type="button" class="wizard-btn" @click="nudgeCurrentEndpoint(10)">
                                        +10
                                    </button>
                                </div>
                            </div>

                            <button
                                type="button"
                                class="wizard-btn wizard-btn--primary"
                                :disabled="endpointHoldInFlight"
                                @click="holdCurrentEndpoint"
                            >
                                <span v-if="endpointHoldInFlight">{{ $t("planeWizardIdentityPulsing") }}</span>
                                <span v-else-if="endpointHoldEnd === currentEndpointStop.end">{{
                                    $t("planeWizardEndpointsHolding")
                                }}</span>
                                <span v-else>{{ $t("planeWizardEndpointsHoldButton") }}</span>
                            </button>
                            <p v-if="endpointError" class="wizard-blocker">{{ endpointError }}</p>
                        </template>

                        <!-- Reviewing phase -->
                        <template v-if="endpointPhase === 'reviewing'">
                            <template v-if="endpointChanges.length > 0">
                                <p class="wizard-help">{{ $t("planeWizardEndpointsReviewIntro") }}</p>
                                <table class="wizard-pads-table">
                                    <thead>
                                        <tr>
                                            <th>{{ $t("planeWizardEndpointsReviewSurface") }}</th>
                                            <th>{{ $t("planeWizardEndpointsReviewMin") }}</th>
                                            <th>{{ $t("planeWizardEndpointsReviewMax") }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(c, i) in endpointChanges" :key="i">
                                            <td>{{ c.label }}</td>
                                            <td>{{ c.oldMin }} → {{ c.newMin }}</td>
                                            <td>{{ c.oldMax }} → {{ c.newMax }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </template>
                            <div v-else class="wizard-callout wizard-callout--info">
                                <strong>{{ $t("planeWizardEndpointsNoChangesTitle") }}</strong>
                                <p>{{ $t("planeWizardEndpointsNoChangesHelp") }}</p>
                            </div>
                            <div v-if="endpointInFlight" class="wizard-critical">
                                <div class="wizard-spinner" />
                                <strong>{{ $t("planeWizardEndpointsApplyInProgress") }}</strong>
                                <p>{{ $t("planeWizardDirectionApplyDoNotDisconnect") }}</p>
                            </div>
                            <div v-if="endpointError" class="wizard-blocker">
                                <strong>{{ $t("planeWizardEndpointsApplyFailedTitle") }}</strong>
                                <p>{{ endpointError }}</p>
                            </div>
                        </template>
                    </div>
                </div>
            </section>

            <!-- Step 6: Motors -->
            <section v-if="step === 6" class="wizard-step">
                <h3>{{ $t("planeWizardMotorsHeading") }}</h3>
                <div class="wz-split">
                    <div class="wz-split-visual">
                        <WizardSurfaceVisual
                            :airframe-id="airframeId"
                            :highlight="currentVisualHighlight"
                            :dir="currentVisualDir"
                            :size="220"
                        />
                        <div v-if="motorYawHint" class="wz-stick-hint wz-stick-hint--wizard">
                            <span class="wz-stick-hint-label">{{ motorYawHint.label }}</span>
                            <span class="wz-stick-hint-body">
                                <span class="wz-stick-hint-stick">{{ motorYawHint.stick }}</span>
                                <span class="wz-stick-hint-arrow">→</span>
                                <span class="wz-stick-hint-motion">{{ motorYawHint.motion }}</span>
                            </span>
                        </div>
                    </div>
                    <div class="wz-split-controls">
                        <p class="wizard-help">{{ $t("planeWizardMotorsIntro") }}</p>

                        <div class="wizard-callout wizard-callout--info wizard-endpoints-skip">
                            <div>
                                <strong>{{ $t("planeWizardMotorsSafetyTitle") }}</strong>
                                <p>{{ $t("planeWizardMotorsSafetyHelp") }}</p>
                            </div>
                            <button type="button" class="wizard-btn" :disabled="motorInFlight" @click="skipMotors">
                                {{ $t("planeWizardMotorsSkipButton") }}
                            </button>
                        </div>

                        <!-- Walking phase -->
                        <template v-if="motorPhase === 'walking' && currentMotorStop">
                            <div class="wizard-identity-progress">
                                {{ $t("planeWizardMotorsProgress") }}
                                <strong>{{ motorWalkIdx + 1 }} / {{ motorWalkPool.length }}</strong>
                            </div>
                            <div class="wizard-identity-current">
                                <div class="wizard-identity-label">
                                    <span class="wizard-identity-pad">
                                        MOTOR {{ currentMotorStop.motorIdx }} ({{ currentMotorStop.pad }})
                                    </span>
                                    <span class="wizard-identity-fn">
                                        {{ currentMotorStop.label }}
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                class="wizard-btn wizard-btn--primary"
                                :disabled="motorPulseInFlight"
                                @click="pulseCurrentMotor"
                            >
                                <span v-if="motorPulseInFlight">{{ $t("planeWizardMotorsPulsing") }}</span>
                                <span v-else>{{ $t("planeWizardMotorsPulseButton") }}</span>
                            </button>
                            <p v-if="motorError" class="wizard-blocker">{{ motorError }}</p>

                            <p class="wizard-help wizard-help--small">{{ $t("planeWizardMotorsObsPrompt") }}</p>
                            <div class="wizard-motor-obs">
                                <button
                                    type="button"
                                    class="wizard-observation-card"
                                    :class="{
                                        'wizard-observation-card--selected':
                                            motorObservations[currentMotorStop.motorIdx]?.result === 'match',
                                    }"
                                    @click="recordMotorObservation('match')"
                                >
                                    <strong>{{ $t("planeWizardMotorsMatchTitle") }}</strong>
                                    <span>{{ currentMotorStop.label }} {{ $t("planeWizardMotorsMatchHelp") }}</span>
                                </button>
                                <button
                                    v-for="other in motorWalkPool.filter(
                                        (m) => m.motorIdx !== currentMotorStop.motorIdx,
                                    )"
                                    :key="other.motorIdx"
                                    type="button"
                                    class="wizard-observation-card"
                                    :class="{
                                        'wizard-observation-card--selected':
                                            motorObservations[currentMotorStop.motorIdx]?.result === 'swap' &&
                                            motorObservations[currentMotorStop.motorIdx]?.swapWith === other.motorIdx,
                                    }"
                                    @click="recordMotorObservation('swap', other.motorIdx)"
                                >
                                    <strong>{{ other.label }}</strong>
                                    <span>{{ $t("planeWizardMotorsSwapHelp") }}</span>
                                </button>
                                <button
                                    type="button"
                                    class="wizard-observation-card"
                                    :class="{
                                        'wizard-observation-card--selected':
                                            motorObservations[currentMotorStop.motorIdx]?.result === 'none',
                                    }"
                                    @click="recordMotorObservation('none')"
                                >
                                    <strong>{{ $t("planeWizardMotorsNoneTitle") }}</strong>
                                    <span>{{ $t("planeWizardMotorsNoneHelp") }}</span>
                                </button>
                            </div>
                        </template>

                        <!-- Reviewing phase -->
                        <template v-if="motorPhase === 'reviewing'">
                            <template v-if="motorIdentityResult.needsApply">
                                <p class="wizard-help">{{ $t("planeWizardMotorsReviewIntro") }}</p>
                                <table class="wizard-pads-table">
                                    <thead>
                                        <tr>
                                            <th>{{ $t("planeWizardMotorsReviewMotor") }}</th>
                                            <th>{{ $t("planeWizardMotorsReviewWas") }}</th>
                                            <th>{{ $t("planeWizardMotorsReviewBecomes") }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(s, i) in motorIdentityResult.swaps" :key="i">
                                            <td>MOTOR {{ s.a }} ↔ MOTOR {{ s.b }}</td>
                                            <td>{{ s.padA }} / {{ s.padB }}</td>
                                            <td>{{ s.padB }} / {{ s.padA }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </template>
                            <div
                                v-else-if="motorIdentityResult.missing.length === 0"
                                class="wizard-callout wizard-callout--info"
                            >
                                <strong>{{ $t("planeWizardMotorsAllMatchTitle") }}</strong>
                                <p>{{ $t("planeWizardMotorsAllMatchHelp") }}</p>
                            </div>
                            <div v-if="motorIdentityResult.missing.length > 0" class="wizard-blocker">
                                <strong>{{ $t("planeWizardMotorsMissingTitle") }}</strong>
                                <p>{{ $t("planeWizardMotorsMissingHelp") }}</p>
                                <button
                                    v-if="motorFreePadsAvailable"
                                    type="button"
                                    class="wizard-btn wizard-btn--primary"
                                    :disabled="motorInFlight"
                                    @click="runMotorScanPrep"
                                >
                                    {{ $t("planeWizardMotorsScanButton") }}
                                </button>
                            </div>
                            <div v-if="motorInFlight" class="wizard-critical">
                                <div class="wizard-spinner" />
                                <strong>{{ $t("planeWizardMotorsApplyInProgress") }}</strong>
                                <p>{{ $t("planeWizardApplyDoNotDisconnect") }}</p>
                            </div>
                            <div v-if="motorError" class="wizard-blocker">
                                <strong>{{ $t("planeWizardMotorsApplyFailedTitle") }}</strong>
                                <p>{{ motorError }}</p>
                            </div>
                        </template>

                        <!-- Scanning phase: walks scratch motor slots after the
                     scan-prep reboot. User identifies which missing motor
                     spun on each free pad. -->
                        <template v-if="motorPhase === 'scanning' && currentMotorScanSlot">
                            <p class="wizard-help">{{ $t("planeWizardMotorsScanWalkIntro") }}</p>
                            <div class="wizard-identity-progress">
                                {{ $t("planeWizardMotorsProgress") }}
                                <strong>{{ motorScanIdx + 1 }} / {{ motorScanSlots.length }}</strong>
                            </div>
                            <div class="wizard-identity-current">
                                <div class="wizard-identity-label">
                                    <span class="wizard-identity-pad">
                                        {{ currentMotorScanSlot.pad }}
                                    </span>
                                    <span class="wizard-identity-fn">
                                        {{ $t("planeWizardMotorsScanScratchLabel") }}
                                        {{ currentMotorScanSlot.scratchIdx }}
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                class="wizard-btn wizard-btn--primary"
                                :disabled="motorPulseInFlight"
                                @click="pulseMotorScanSlot"
                            >
                                <span v-if="motorPulseInFlight">{{ $t("planeWizardMotorsPulsing") }}</span>
                                <span v-else>{{ $t("planeWizardMotorsPulseButton") }}</span>
                            </button>
                            <p v-if="motorError" class="wizard-blocker">{{ motorError }}</p>

                            <!-- Surface-led "Searching for M{N}" banner.
                                 Names the missing motor the wizard is
                                 hunting for; greedy binding consumes
                                 targets in order on each Moved click. -->
                            <div v-if="currentMotorScanSearchingTarget" class="wizard-callout wizard-callout--info">
                                <strong>
                                    {{ $t("planeWizardScanSearchingFor") }}
                                    MOTOR {{ currentMotorScanSearchingTarget }}
                                </strong>
                                <p>{{ $t("planeWizardScanSurfaceLedHint") }}</p>
                            </div>
                            <div v-else class="wizard-callout wizard-callout--success">
                                <strong>{{ $t("planeWizardScanComplete") }}</strong>
                            </div>
                            <div class="wizard-button-row">
                                <button
                                    type="button"
                                    class="wizard-btn wizard-btn--primary"
                                    :disabled="motorPulseInFlight || !currentMotorScanSearchingTarget"
                                    @click="onMotorScanMoved"
                                >
                                    {{ $t("planeWizardScanMoved") }}
                                </button>
                                <button
                                    type="button"
                                    class="wizard-btn"
                                    :disabled="motorPulseInFlight"
                                    @click="onMotorScanDidntMove"
                                >
                                    {{ $t("planeWizardScanDidntMove") }}
                                </button>
                            </div>
                        </template>

                        <!-- Yaw walking: pulse diff-thrust and confirm direction. -->
                        <template v-if="motorPhase === 'yaw-walking'">
                            <p class="wizard-help">{{ $t("planeWizardYawIntro") }}</p>
                            <button
                                type="button"
                                class="wizard-btn wizard-btn--primary"
                                :disabled="yawPulseInFlight"
                                @click="pulseYawTest"
                            >
                                <span v-if="yawPulseInFlight">{{ $t("planeWizardMotorsPulsing") }}</span>
                                <span v-else>{{ $t("planeWizardYawPulseButton") }}</span>
                            </button>
                            <p v-if="motorError" class="wizard-blocker">{{ motorError }}</p>

                            <p class="wizard-help wizard-help--small">{{ $t("planeWizardYawObsPrompt") }}</p>
                            <div class="wizard-observation-grid">
                                <button
                                    type="button"
                                    class="wizard-observation-card"
                                    :class="{ 'wizard-observation-card--selected': yawObservation === 'match' }"
                                    @click="recordYawObservation('match')"
                                >
                                    <strong>{{ $t("planeWizardYawMatchTitle") }}</strong>
                                    <span>{{ $t("planeWizardYawMatchHelp") }}</span>
                                </button>
                                <button
                                    type="button"
                                    class="wizard-observation-card"
                                    :class="{ 'wizard-observation-card--selected': yawObservation === 'wrong' }"
                                    @click="recordYawObservation('wrong')"
                                >
                                    <strong>{{ $t("planeWizardYawWrongTitle") }}</strong>
                                    <span>{{ $t("planeWizardYawWrongHelp") }}</span>
                                </button>
                            </div>
                        </template>

                        <!-- Yaw reviewing: confirm flip plan or "no fix". -->
                        <template v-if="motorPhase === 'yaw-reviewing'">
                            <template v-if="yawFlipResult.needsFlip">
                                <p class="wizard-help">{{ $t("planeWizardYawReviewIntro") }}</p>
                                <pre class="wizard-cli-preview">{{ yawFlipResult.cliLines.join("\n") }}</pre>
                            </template>
                            <div v-else class="wizard-callout wizard-callout--info">
                                <strong>{{ $t("planeWizardYawAllGoodTitle") }}</strong>
                                <p>{{ $t("planeWizardYawAllGoodHelp") }}</p>
                            </div>
                            <div v-if="motorInFlight" class="wizard-critical">
                                <div class="wizard-spinner" />
                                <strong>{{ $t("planeWizardYawApplyInProgress") }}</strong>
                                <p>{{ $t("planeWizardApplyDoNotDisconnect") }}</p>
                            </div>
                            <div v-if="motorError" class="wizard-blocker">
                                <strong>{{ $t("planeWizardYawApplyFailedTitle") }}</strong>
                                <p>{{ motorError }}</p>
                            </div>
                        </template>

                        <!-- Final-reviewing phase: shows the scan's resolution. -->
                        <template v-if="motorPhase === 'final-reviewing'">
                            <p class="wizard-help">{{ $t("planeWizardMotorsScanFinalIntro") }}</p>
                            <table v-if="motorScanFinalResult.assignedMotors.length > 0" class="wizard-pads-table">
                                <thead>
                                    <tr>
                                        <th>{{ $t("planeWizardMotorsReviewMotor") }}</th>
                                        <th>{{ $t("planeWizardMotorsReviewBecomes") }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="a in motorScanFinalResult.assignedMotors" :key="a.motorIdx">
                                        <td>MOTOR {{ a.motorIdx }}</td>
                                        <td>{{ a.pad }}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div v-else class="wizard-blocker">
                                <strong>{{ $t("planeWizardMotorsScanNothingTitle") }}</strong>
                                <p>{{ $t("planeWizardMotorsScanNothingHelp") }}</p>
                            </div>
                            <div v-if="motorInFlight" class="wizard-critical">
                                <div class="wizard-spinner" />
                                <strong>{{ $t("planeWizardMotorsApplyInProgress") }}</strong>
                                <p>{{ $t("planeWizardApplyDoNotDisconnect") }}</p>
                            </div>
                            <div v-if="motorError" class="wizard-blocker">
                                <strong>{{ $t("planeWizardMotorsApplyFailedTitle") }}</strong>
                                <p>{{ motorError }}</p>
                            </div>
                        </template>
                    </div>
                </div>
            </section>

            <!-- Step 7: Done -->
            <section v-if="step === 7" class="wizard-step">
                <h3>{{ $t("planeWizardDoneHeading") }}</h3>
                <p class="wizard-help">{{ $t("planeWizardDoneIntro") }}</p>
                <ul class="wizard-summary">
                    <li>
                        <strong>{{ $t("planeWizardSummaryAirframe") }}:</strong>
                        {{ selectedAirframeLabel }}
                    </li>
                    <li>
                        <strong>{{ $t("planeWizardSummaryMotors") }}:</strong>
                        {{ motorCount }}
                    </li>
                </ul>
                <p class="wizard-help wizard-help--small">{{ $t("planeWizardDoneNextSteps") }}</p>
            </section>
        </div>

        <template #footer>
            <div class="wizard-footer">
                <button v-if="canShowBack" type="button" class="wizard-btn" @click="back">
                    {{ $t("planeWizardBack") }}
                </button>
                <span class="wizard-footer-spacer" />
                <button
                    v-if="step < 7"
                    type="button"
                    class="wizard-btn wizard-btn--primary"
                    :disabled="
                        !canContinue ||
                        applyInFlight ||
                        pulseInFlight ||
                        remapInFlight ||
                        scanInFlight ||
                        directionInFlight ||
                        endpointInFlight ||
                        motorInFlight
                    "
                    @click="next"
                >
                    {{ continueLabel }}
                </button>
                <button v-else type="button" class="wizard-btn wizard-btn--primary" @click="finish">
                    {{ $t("planeWizardFinish") }}
                </button>
            </div>
        </template>
    </Dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from "vue";
import Dialog from "../elements/Dialog.vue";
import WizardSurfaceVisual, { surfaceLabelToHighlight } from "./wizard/visuals/WizardSurfaceVisual.vue";
import { i18n } from "../../js/localization";
import {
    pulseServoMiddle,
    wizardServoPulseCleanup,
    snapshotMiddles,
    restoreMiddlesFromSnapshot,
    resetCapabilityCache,
} from "../../js/utils/wingServoPulse";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import FC from "../../js/fc";
import {
    computeRemap,
    computeScanPlan,
    computeFinalRemap,
    OBS_NOTHING,
    OBS_MULTIPLE,
    OBS_NO_SERVO,
} from "../../js/utils/wingResourceRemap";
import { axesForSurface, computeDirectionFixes } from "../../js/utils/wingDirectionFix";
import {
    buildEndpointSlots,
    buildEndpointStops,
    adjustEndpoint,
    computeEndpointChanges,
    END_MIN,
} from "../../js/utils/wingEndpoints";
import {
    computeMotorIdentity,
    buildMotorWalkPool,
    computeMotorScanPlan,
    computeMotorScanFinal,
} from "../../js/utils/wingMotors";
import {
    enableMotorTest,
    disableMotorTest,
    pulseMotor,
    pulseMotorPair,
    stopMotors,
} from "../../js/utils/wingMotorPulse";
import { computeYawFlipPlan } from "../../js/utils/wingYawDirection";

// Small + brief pulse: ~+100 deflection on a servo, ~10% throttle on
// an ESC if a motor is mis-wired to a SERVO N pad. Both are harmless
// when props are off (which Safety + the pre-Discovery gate enforce).
const PULSE_PWM = 1600;
const PULSE_DURATION_MS = 500;

const props = defineProps({
    modelValue: { type: Boolean, default: false },
    armed: { type: Boolean, default: false },
    motorCount: { type: Number, default: 1 },
    // Battery cell count (2-6S) — drives tpa_speed_max_voltage
    // (cells × 4.20V × 100). Defaults to 3 (1260) — safe under-scaling
    // fallback. Surfaced on Step 2 as a dropdown so wizard users don't
    // need to manually compute the TPA voltage value in the Tuning tab.
    cellCount: { type: Number, default: 3 },
    airframes: { type: Array, default: () => [] },
    // Async callback: applyCallback(airframeId) → preset stage + commit
    // + reboot. Parent owns the implementation; persists post-apply
    // resume marker before the reboot.
    applyCallback: { type: Function, required: true },
    // Optional resume payload from parent: {
    //   airframeId, startAtStep, currentResources, phase
    // }. Phase is "post-apply" (resume to Discovery) or "post-remap"
    // (resume to Done). Null on a fresh launch.
    resumeState: { type: Object, default: null },
    // SERVO N → pad map representing the FC's current resource layout
    // (post-Apply commit). Used by computeRemap to derive the swap CLI
    // batch when Discovery surfaces mismatches.
    currentResources: { type: Object, default: () => ({}) },
    // Async callback: applyRemapCallback(cliLines) → commit resource
    // swap CLI batch + reboot. Parent persists post-remap marker before
    // the reboot. Null disables the Remap step (wizard treats remap as
    // not applicable and skips straight to Done).
    applyRemapCallback: { type: Function, default: null },
    // Async callback for Phase 3.5 scan: Discovery's reviewing phase
    // detects "Nothing moved" + unused motor pads → user clicks "Scan
    // unused pads" → wizard calls this with { cliLines, scanSlots,
    // originalObservations, currentResources } → parent persists
    // post-scan-prep marker, fires CLI batch, FC reboots. Wizard
    // auto-resumes at scanning sub-phase.
    applyScanCallback: { type: Function, default: null },
    // wingResourceAnalyzer output. Currently unused by the scan path
    // (we use padDefaults instead — see below) but kept available in
    // case future steps need analysis.servos / analysis.motors.
    hardwareAnalysis: { type: Object, default: null },
    // Board's silkscreen-default pad list:
    //   { motors: [{index, pad}], ledStrips: [{pad}] }
    // Source of candidate pads for the Phase 3.5 scan. Stable across
    // the wizard's Apply commit (which RELEASES unused motors but
    // doesn't remove them from the silkscreen pool — analysis.motors
    // stops listing them, but padDefaults.motors still has them).
    padDefaults: { type: Object, default: null },
    // Read-only motor + LED rows for the Apply-step preview table.
    // [{type: 'MOTOR'|'LED_STRIP', n, pad}]. Parent extracts from the
    // recommender's CLI batch so the user sees what motors + LED will
    // be committed alongside the servos.
    extraApplyRows: { type: Array, default: () => [] },
    // Live FC.SERVO_RULES — used by the Direction step to compute axes
    // per surface and derive rate-sign flips. Reactive so post-remap
    // state changes propagate.
    rules: { type: Array, default: () => [] },
    // Async callback for Direction commit: applyDirectionCallback(ruleFlips)
    // → updates FC.SERVO_RULES, fires MSP_SET_SERVO_MIX_RULE for each
    // changed rule + EEPROM_WRITE. Runtime-effective, NO reboot needed.
    applyDirectionCallback: { type: Function, default: null },
    // Async callback for Endpoints commit: applyEndpointsCallback(changes)
    // → mutates FC.SERVO_CONFIG, fires sendServoConfigurations + EEPROM_WRITE.
    // Runtime-effective, no reboot needed.
    applyEndpointsCallback: { type: Function, default: null },
    // Expected motor bindings derived from the current resource map:
    //   [{motorIdx, label, pad}] — motorIdx 1-indexed (matches silkscreen).
    // Used by the Motors step's identity walk.
    expectedMotors: { type: Array, default: () => [] },
    // Async callback for Motors commit: applyMotorsCallback(cliLines)
    // → fires CLI batch (motor pad swaps) + reboot. Wizard persists
    // post-motors marker before reboot, resumes at Done after reconnect.
    applyMotorsCallback: { type: Function, default: null },
    // Async callback for Motors scan-prep commit:
    // applyMotorScanPrepCallback({ cliLines, scanSlots })
    // → persists scan-prep marker + fires CLI batch (release missing
    // motors + bind free pads to scratch slots) + reboot. Wizard
    // resumes at STEP_MOTORS in scanning sub-phase post-reconnect.
    applyMotorScanPrepCallback: { type: Function, default: null },
    // Async callback for Motors final commit:
    // applyMotorFinalCallback(cliLines) — release scratch slots +
    // bind real motors to identified pads. Reboot, resume at Done.
    applyMotorFinalCallback: { type: Function, default: null },
    // Async callback for yaw direction flip: applyYawFlipCallback(cliLines)
    // → CLI batch (re-emits mmix entries with negated yaw column) +
    // reboot. Wizard resumes at Done.
    applyYawFlipCallback: { type: Function, default: null },
});

const emit = defineEmits([
    "update:modelValue",
    "complete",
    "close",
    "airframeSelected",
    "motorCountSelected",
    "cellCountSelected",
]);

// Step indices — keep in sync with the v-if blocks above.
const STEP_SAFETY = 0;
const STEP_AIRFRAME = 1;
const STEP_APPLY = 2;
const STEP_DISCOVERY = 3;
const STEP_DIRECTION = 4;
const STEP_ENDPOINTS = 5;
const STEP_MOTORS = 6;
const STEP_DONE = 7;

const step = ref(0);
const completed = ref(new Set());

const safety = reactive({ propsRemoved: false });
const airframeId = ref(null);
const applyState = ref("idle"); // idle | applying | done | error
const applyError = ref(null);

// Discovery-step internal state. Three phases:
//   gate     → user re-confirms props removed before any pulse fires
//   walking  → walk each populated SERVO N, pulse, dropdown-pick
//   reviewing→ show the swap summary derived from observations + confirm
const discoveryPhase = ref("gate");
const propsConfirmedForDiscovery = ref(false);

// Per-surface walk state.
const surfaceIdx = ref(0);
// observations[idx] = surface label string ("Elevator", "Aileron L", etc.)
// or one of OBS_NOTHING / OBS_MULTIPLE / OBS_NO_SERVO. undefined = not
// yet picked (Continue gates on every entry being defined).
const observations = ref([]);
const pulseInFlight = ref(false);
const pulseError = ref(null);

// Remap step state (computed lazily when Discovery walking completes).
const remapResult = ref(null);
const remapInFlight = ref(false);
const remapError = ref(null);

// Scan state (Phase 3.5). Only set when Discovery's reviewing phase
// detects "Nothing moved" + unused motor pads, OR when the wizard
// resumes from a post-scan-prep reboot.
const scanPlan = ref(null); // computeScanPlan output (offer in reviewing)
const scanInFlight = ref(false); // CLI batch + reboot in progress
const scanError = ref(null);
const scanSlots = ref([]); // [{servoN, pad, fromMotorN}] new SERVO N+ slots
const scanObservations = ref({}); // {servoN: surface_or_OBS_*} from scan walk
const scanSurfaceIdx = ref(0); // current scan slot being walked
const finalRemapResult = ref(null); // computeFinalRemap output (final reviewing)
const originalObservationsForFinal = ref({}); // first-walk obs preserved across post-scan reboot

// ─── Direction step state (Phase 4) ────────────────────────────────
//
// Walk every (surface, axis) pair the airframe drives. User reports
// "match" or "wrong" per axis per surface. Two input modes:
//
//   pilot   — user moves their TX stick, live MSP_RC poll feeds the
//             joystick widget. Tests the full chain (TX → mixer →
//             servo) including channel-map / TX-mixing errors.
//   wizard  — wizard pulses the surface's slot via SERVO_OVERRIDE at
//             the rate-sign-correct deflection. Tests only the smix
//             rule's sign in isolation.
//
// Both modes feed the SAME observation map. computeDirectionFixes
// derives rate-sign flips on the matching smix rules. Commit is MSP
// only (MSP_SET_SERVO_MIX_RULE + EEPROM_WRITE) — no reboot.
const directionMode = ref("pilot"); // 'pilot' | 'wizard'
const directionPhase = ref("walking"); // 'walking' | 'reviewing'
const directionSlotIdx = ref(0);
const directionObservations = ref({}); // { [servoN]: { [axis]: 'match'|'wrong' } }
const directionFixes = ref(null);
const directionInFlight = ref(false);
const directionError = ref(null);

// Per-(surface, axis) slot list — the wizard's walk iterates this.
const directionSlots = computed(() => {
    const slots = [];
    for (const surface of surfaces.value) {
        // SLOT enum = silkscreen SERVO N + 1 (planePresets convention,
        // wing-fork reserves SLOT 0+1). surface.slotN is the 1-based CLI
        // servo number — adding 1 yields the SLOT enum value (SERVO 1
        // → SLOT 2 = ELEVATOR). Earlier `surface.pad + 1` was string
        // concatenation ("1" + 1 = "11"), broke the rules lookup, and
        // left directionSlots empty so the entire Direction UI was gated.
        const slotN = surface.slotN + 1;
        const axes = axesForSurface(props.rules ?? [], slotN);
        for (const axis of axes) {
            slots.push({ surface, axis });
        }
    }
    return slots;
});
const currentDirectionSlot = computed(() => directionSlots.value[directionSlotIdx.value] ?? null);

// RC stick mapping for the joystick widget. The wizard owns the poll
// lifecycle so we don't hammer the MSP queue during Discovery's
// SERVO_OVERRIDE pulses (earlier version polled at 30Hz the moment
// the wizard opened, which starved the queue when Discovery tried to
// pulse — Brian, 2026-04-29). Poll only ticks when on Direction step
// + pilot mode, at 10Hz to stay queue-friendly.
const rcChannelsLive = ref([]);
const rcRoll = computed(() => rcChannelsLive.value[0] ?? 1500);
const rcPitch = computed(() => rcChannelsLive.value[1] ?? 1500);
const rcYaw = computed(() => rcChannelsLive.value[2] ?? 1500);
const joystickThumbStyle = computed(() => {
    const x = ((rcRoll.value - 1000) / 1000) * 100;
    // Pitch inverted so stick-forward (low PWM) shows as up on the pad.
    const y = (1 - (rcPitch.value - 1000) / 1000) * 100;
    return {
        left: `${Math.max(0, Math.min(100, x))}%`,
        top: `${Math.max(0, Math.min(100, y))}%`,
    };
});

let rcPollTimer = null;
function startRcPoll() {
    if (rcPollTimer) return;
    rcPollTimer = setInterval(() => {
        MSP.send_message(MSPCodes.MSP_RC, false, false, () => {
            rcChannelsLive.value = [...(FC.RC.channels ?? [])];
        });
    }, 100); // 10Hz — gentler on MSP queue than 30Hz, still feels live
}
function stopRcPoll() {
    if (rcPollTimer) {
        clearInterval(rcPollTimer);
        rcPollTimer = null;
    }
}

// Only poll when wizard is open AND on Direction step AND in pilot
// mode. Earlier version always polled while open which interfered
// with Discovery's SERVO_OVERRIDE requests on a busy MSP queue.
watch([() => props.modelValue, () => step.value, () => directionMode.value], ([open, currentStep, mode]) => {
    if (open && currentStep === STEP_DIRECTION && mode === "pilot") {
        startRcPoll();
    } else {
        stopRcPoll();
    }
});

function setDirectionMode(mode) {
    directionMode.value = mode;
}

function recordDirectionObservation(result) {
    const slot = currentDirectionSlot.value;
    if (!slot) return;
    // Key by 1-based slotN — matches what proceedFromDirectionWalk
    // passes to computeDirectionFixes (whose contract is 1-based servoN
    // per its tests + JSDoc).
    const slotKey = slot.surface.slotN;
    if (!directionObservations.value[slotKey]) {
        directionObservations.value[slotKey] = {};
    }
    directionObservations.value[slotKey][slot.axis] = result;
    // Auto-advance to next (surface, axis).
    if (directionSlotIdx.value < directionSlots.value.length - 1) {
        directionSlotIdx.value += 1;
    } else {
        proceedFromDirectionWalk();
    }
}

async function pulseDirectionAxis() {
    const slot = currentDirectionSlot.value;
    if (!slot || pulseInFlight.value) return;
    pulseError.value = null;
    pulseInFlight.value = true;
    try {
        // Find the rule's rate for this surface + axis to pick the
        // correct deflection direction. Rate sign is what we're
        // verifying — pulsing in the rule's sign means: "if the rule
        // is right, surface deflects the way the user expects."
        const slotN = slot.surface.slotN + 1;
        const rules = props.rules ?? [];
        const inputId = { roll: 0, pitch: 1, yaw: 2 }[slot.axis];
        const rule = rules.find((r) => r.target === slotN && r.input === inputId);
        const rate = rule ? rule.rate : 50;
        // PWM offset = rate% × 500us full-scale.
        const offset = (rate / 100) * 500;
        const pwm = Math.max(1000, Math.min(2000, Math.round(1500 + offset)));
        lastPulseDir.value = offset >= 0 ? 1 : -1;
        await pulseServoMiddle(slotN, pwm, PULSE_DURATION_MS);
        await new Promise((resolve) => setTimeout(resolve, PULSE_DURATION_MS));
    } catch (err) {
        pulseError.value = err?.message || String(err);
    } finally {
        pulseInFlight.value = false;
        lastPulseDir.value = 0;
    }
}

function proceedFromDirectionWalk() {
    directionFixes.value = computeDirectionFixes({
        rules: props.rules ?? [],
        airframeSurfaces: surfaces.value.map((s) => ({
            // computeDirectionFixes expects 1-based servoN (per its
            // tests: SERVO 1 → servoN=1, targetSlot=2). Pass slotN
            // (1-based numeric) — earlier `s.pad` was the string form
            // and broke `targetSlot = servoN + 1` via string concat.
            servoN: s.slotN,
            expectedSurface: s.label,
            label: s.label,
        })),
        observations: directionObservations.value,
    });
    directionPhase.value = "reviewing";
}

async function runDirection() {
    if (!directionFixes.value || !directionFixes.value.needsApply) {
        // All match — nothing to commit, advance to Done.
        completed.value.add(STEP_DIRECTION);
        step.value = STEP_ENDPOINTS;
        return;
    }
    if (!props.applyDirectionCallback) {
        directionError.value = i18n.getMessage("planeWizardDirectionNoCallback");
        return;
    }
    directionInFlight.value = true;
    directionError.value = null;
    try {
        await props.applyDirectionCallback(directionFixes.value.ruleFlips);
        // MSP-only commit — no reboot. Advance directly.
        completed.value.add(STEP_DIRECTION);
        step.value = STEP_ENDPOINTS;
    } catch (err) {
        directionError.value = err?.message || String(err);
    } finally {
        directionInFlight.value = false;
    }
}

// ─── Endpoints step ───
// Hold-MIN / Hold-MAX walker per surface. ±1 / ±10 µs steppers nudge
// the staged value; Hold uses pulseServoMiddle to drive the surface
// at the staged PWM so the pilot sees the actual mechanical throw.
// All changes staged in wizard state; commit happens on Apply via
// MSP_SET_SERVO_CONFIGURATION + EEPROM_WRITE. Runtime — no reboot.
const ENDPOINT_HOLD_DURATION_MS = 2000;

const endpointSlots = ref([]);
const endpointStopIdx = ref(0);
const endpointPhase = ref("walking"); // 'walking' | 'reviewing'
const endpointHoldEnd = ref(null); // null | END_MIN | END_MAX
const endpointHoldInFlight = ref(false);
const endpointInFlight = ref(false);
const endpointError = ref(null);
const endpointSkipped = ref(false);

const endpointStops = computed(() => buildEndpointStops(endpointSlots.value));
const currentEndpointStop = computed(() => endpointStops.value[endpointStopIdx.value] ?? null);
const currentEndpointSlot = computed(() => {
    const stop = currentEndpointStop.value;
    if (!stop) return null;
    return endpointSlots.value[stop.slotIdx] ?? null;
});
const currentEndpointValue = computed(() => {
    const slot = currentEndpointSlot.value;
    const stop = currentEndpointStop.value;
    if (!slot || !stop) return null;
    return stop.end === END_MIN ? slot.min : slot.max;
});
const endpointChanges = computed(() => computeEndpointChanges(endpointSlots.value));

async function initEndpoints() {
    if (endpointSlots.value.length > 0) return;
    endpointError.value = null;
    // The Wing Tuning tab doesn't request SERVO_CONFIGURATIONS at
    // connect (only the Servos tab does), so FC.SERVO_CONFIG may be
    // empty or stale here. Fetch fresh before reading current min/max.
    try {
        await MSP.promise(MSPCodes.MSP_SERVO_CONFIGURATIONS);
    } catch (err) {
        endpointError.value = err?.message || String(err);
        return;
    }
    // wingEndpoints expects 1-based silkscreen servoN (matches its
    // tests + slotForServoN's `+1 = SLOT enum`). Wizard surfaces
    // carry `slotN` as the 1-based numeric form; `pad` was the
    // string form and earlier broke `slotForServoN` via string
    // concat, leaving endpointSlots empty and gating the entire
    // walking UI to the "skip if defaults are fine" callout.
    const mappedSurfaces = surfaces.value.map((s) => ({
        servoN: s.slotN,
        label: s.label,
    }));
    endpointSlots.value = buildEndpointSlots(mappedSurfaces, FC.SERVO_CONFIG ?? []);
    endpointStopIdx.value = 0;
    endpointPhase.value = "walking";
    endpointHoldEnd.value = null;
}

// Lazy init when the user lands on the Endpoints step (whether via
// Direction commit, "all match" advance, or back-from-Done).
watch(
    () => step.value,
    (s) => {
        if (s === STEP_ENDPOINTS) {
            initEndpoints().catch((err) => {
                endpointError.value = err?.message || String(err);
            });
        }
    },
);

async function holdCurrentEndpoint() {
    const slot = currentEndpointSlot.value;
    const stop = currentEndpointStop.value;
    if (!slot || !stop) return;
    if (endpointHoldInFlight.value) return;
    endpointHoldInFlight.value = true;
    endpointError.value = null;
    try {
        const pwm = stop.end === END_MIN ? slot.min : slot.max;
        // pulseServoMiddle takes the CLI silkscreen number (1-based)
        // and internally converts to firmware servoIdx. surface.servoN
        // is already 1-based here — wrapping with slotForServoN would
        // double-shift and pulse the wrong physical servo.
        await pulseServoMiddle(slot.surface.servoN, pwm, ENDPOINT_HOLD_DURATION_MS);
        endpointHoldEnd.value = stop.end;
        // Auto-clear the hold-end indicator when firmware's auto-clear fires.
        setTimeout(() => {
            if (endpointHoldEnd.value === stop.end) endpointHoldEnd.value = null;
        }, ENDPOINT_HOLD_DURATION_MS);
    } catch (err) {
        endpointError.value = err?.message || String(err);
    } finally {
        endpointHoldInFlight.value = false;
    }
}

function nudgeCurrentEndpoint(delta) {
    const slot = currentEndpointSlot.value;
    const stop = currentEndpointStop.value;
    if (!slot || !stop) return;
    if (stop.end === END_MIN) {
        slot.min = adjustEndpoint(slot.min, delta);
    } else {
        slot.max = adjustEndpoint(slot.max, delta);
    }
}

function captureCurrentEndpoint() {
    if (endpointStopIdx.value < endpointStops.value.length - 1) {
        endpointStopIdx.value += 1;
        endpointHoldEnd.value = null;
    } else {
        endpointPhase.value = "reviewing";
    }
}

function skipEndpoints() {
    endpointSkipped.value = true;
    completed.value.add(STEP_ENDPOINTS);
    step.value = STEP_MOTORS;
}

async function runEndpoints() {
    if (endpointChanges.value.length === 0) {
        // Nothing to commit — just advance.
        completed.value.add(STEP_ENDPOINTS);
        step.value = STEP_MOTORS;
        return;
    }
    if (!props.applyEndpointsCallback) {
        endpointError.value = i18n.getMessage("planeWizardEndpointsNoCallback");
        return;
    }
    endpointInFlight.value = true;
    endpointError.value = null;
    try {
        await props.applyEndpointsCallback(endpointChanges.value);
        completed.value.add(STEP_ENDPOINTS);
        step.value = STEP_MOTORS;
    } catch (err) {
        endpointError.value = err?.message || String(err);
    } finally {
        endpointInFlight.value = false;
    }
}

// ─── Motors step ───
// Identity walk: pulse each currently-bound motor, user picks which
// physical motor spun (or "nothing"). Mirrors Discovery's pulse-and-
// pick UX but for motor pads. Auto-skips if motorCount === 1.
//
// Apply: CLI motor-pad swap batch + reboot. Resumes at Done.
const MOTOR_PULSE_THROTTLE = 1100; // ~10% PWM-equivalent
const MOTOR_PULSE_DURATION_MS = 1000;

const motorPhase = ref("walking"); // 'walking' | 'reviewing'
const motorWalkIdx = ref(0);
const motorObservations = ref({}); // {[motorIdx]: {result, swapWith?}}
const motorPulseInFlight = ref(false);
const motorTestReady = ref(false);
const motorInFlight = ref(false);
const motorError = ref(null);

const motorWalkPool = computed(() => buildMotorWalkPool(props.expectedMotors ?? []));
const currentMotorStop = computed(() => motorWalkPool.value[motorWalkIdx.value] ?? null);
const motorIdentityResult = computed(() =>
    computeMotorIdentity({
        expectedMotors: props.expectedMotors ?? [],
        observations: motorObservations.value,
    }),
);

// Post-reboot scan phases (both `scanning` walk + `final-reviewing`):
// parent's wizardExpectedMotors recomputes from the CURRENT FC resource
// map, which now has scratch motor slots instead of the originally-
// expected motors. So motorIdentityResult.missing returns []. The
// persisted motorObservations (hydrated by post-motor-scan-prep resume)
// still carries the original missing indices as keys with result=OBS_NONE,
// so derive missing list directly from those keys.
//
// motorObservations isn't mutated between scanning → final-reviewing
// (only motorScanObservations is), so this works for BOTH the per-motor
// button v-for during scanning AND computeMotorScanFinal's missingMotors
// arg during final-reviewing.
const motorScanMissingList = computed(() =>
    Object.keys(motorObservations.value)
        .filter((k) => motorObservations.value[k]?.result === "none")
        .map(Number),
);
const motorsAutoSkipped = computed(() => (props.motorCount ?? 1) <= 1);

// Surface-led motor scan target. Returns the first motorIdx in
// motorScanMissingList that hasn't been claimed yet (i.e. no scratch
// slot's observation has swapWith === motorIdx). Drives the "Searching
// for M{N}" banner; null once every missing motor has a slot match.
const currentMotorScanSearchingTarget = computed(() => {
    const missing = motorScanMissingList.value;
    if (missing.length === 0) return null;
    const matched = new Set();
    for (const obs of Object.values(motorScanObservations.value)) {
        if (obs?.result === "swap" && obs.swapWith != null) matched.add(obs.swapWith);
    }
    return missing.find((m) => !matched.has(m)) ?? null;
});

function onMotorScanMoved() {
    const slot = currentMotorScanSlot.value;
    const target = currentMotorScanSearchingTarget.value;
    if (!slot || target == null) return;
    motorScanObservations.value[slot.scratchIdx] = { result: "swap", swapWith: target };
    advanceMotorScanSlot();
}

function onMotorScanDidntMove() {
    const slot = currentMotorScanSlot.value;
    if (!slot) return;
    motorScanObservations.value[slot.scratchIdx] = { result: "none" };
    advanceMotorScanSlot();
}

function advanceMotorScanSlot() {
    if (motorScanIdx.value < motorScanSlots.value.length - 1) {
        motorScanIdx.value += 1;
    }
}

async function ensureMotorTestEnabled() {
    if (motorTestReady.value) return;
    motorError.value = null;
    try {
        await enableMotorTest();
        motorTestReady.value = true;
    } catch (err) {
        motorError.value = err?.message || String(err);
    }
}

async function teardownMotorTest() {
    if (!motorTestReady.value) return;
    try {
        await disableMotorTest();
    } finally {
        motorTestReady.value = false;
    }
}

// Lazy enable when entering Motors step (and not auto-skipping).
// Disable when leaving the step or closing the wizard.
watch(
    () => step.value,
    (s, prev) => {
        if (s === STEP_MOTORS) {
            if (motorsAutoSkipped.value) {
                // Single-motor airframe — nothing to verify, skip past.
                completed.value.add(STEP_MOTORS);
                step.value = STEP_DONE;
                return;
            }
            ensureMotorTestEnabled();
        } else if (prev === STEP_MOTORS) {
            teardownMotorTest();
            stopMotors();
        }
    },
);

async function pulseCurrentMotor() {
    const m = currentMotorStop.value;
    if (!m || motorPulseInFlight.value) return;
    motorError.value = null;
    motorPulseInFlight.value = true;
    try {
        await ensureMotorTestEnabled();
        // motorIdx in the pool is 1-indexed (silkscreen); pulseMotor
        // expects 0-indexed BF motor array slot.
        pulseMotor(m.motorIdx - 1, MOTOR_PULSE_THROTTLE, MOTOR_PULSE_DURATION_MS);
    } catch (err) {
        motorError.value = err?.message || String(err);
    } finally {
        // Match the auto-stop window so the button re-enables only
        // after the motor has actually stopped.
        setTimeout(() => {
            motorPulseInFlight.value = false;
        }, MOTOR_PULSE_DURATION_MS);
    }
}

function recordMotorObservation(result, swapWith = null) {
    const m = currentMotorStop.value;
    if (!m) return;
    if (!motorObservations.value[m.motorIdx]) motorObservations.value[m.motorIdx] = {};
    motorObservations.value[m.motorIdx] = { result, ...(swapWith != null ? { swapWith } : {}) };
}

function proceedFromMotorWalk() {
    if (motorWalkIdx.value < motorWalkPool.value.length - 1) {
        motorWalkIdx.value += 1;
    } else {
        motorPhase.value = "reviewing";
    }
}

function skipMotors() {
    completed.value.add(STEP_MOTORS);
    teardownMotorTest();
    step.value = STEP_DONE;
}

async function runMotors() {
    if (!motorIdentityResult.value.needsApply) {
        // Identity is fine — branch to yaw sub-phase or DONE.
        advanceFromMotorIdentity();
        return;
    }
    if (!props.applyMotorsCallback) {
        motorError.value = i18n.getMessage("planeWizardMotorsNoCallback");
        return;
    }
    motorInFlight.value = true;
    motorError.value = null;
    try {
        // Tear down test mode BEFORE the reboot so motor-test-enabled
        // state isn't persisted across the CLI batch. Resume marker
        // lands at STEP_MOTORS post-reboot; the yaw sub-phase decision
        // happens in resume hydration.
        await teardownMotorTest();
        await props.applyMotorsCallback(motorIdentityResult.value.cliLines);
        completed.value.add(STEP_MOTORS);
        step.value = STEP_DONE;
    } catch (err) {
        motorError.value = err?.message || String(err);
    } finally {
        motorInFlight.value = false;
    }
}

// ─── Motors scan sub-phase ───
// When the walk reports "Nothing moved" on a motor and free silkscreen-
// MOTOR pads remain, the wizard offers a scan: bind those free pads to
// scratch motor slots, reboot, walk the scratches, and let the user
// identify which physical motor lives on each free pad. Final commit
// rebinds the missing motor to the identified pad.
const motorScanSlots = ref([]); // [{scratchIdx, pad}]
const motorScanIdx = ref(0);
const motorScanObservations = ref({}); // {[scratchIdx]: {result, swapWith?}}

const currentMotorScanSlot = computed(() => motorScanSlots.value[motorScanIdx.value] ?? null);
const motorFreePadsAvailable = computed(() => {
    const bound = new Set((props.expectedMotors ?? []).map((m) => m.pad));
    return (props.padDefaults?.motors ?? []).some((p) => !bound.has(p.pad));
});
const motorScanFinalResult = computed(() =>
    computeMotorScanFinal({
        scanSlots: motorScanSlots.value,
        scanObservations: motorScanObservations.value,
        // Use motorScanMissingList — motorIdentityResult.missing is
        // empty post-resume because parent's wizardExpectedMotors
        // recomputes from the scratch-slot resource map. The hydrated
        // motorObservations still has the original missing indices.
        missingMotors: motorScanMissingList.value,
    }),
);

async function pulseMotorScanSlot() {
    const slot = currentMotorScanSlot.value;
    if (!slot || motorPulseInFlight.value) return;
    motorError.value = null;
    motorPulseInFlight.value = true;
    try {
        await ensureMotorTestEnabled();
        // scratchIdx is 1-indexed (matches BF MOTOR N); pulseMotor
        // expects 0-indexed slot.
        pulseMotor(slot.scratchIdx - 1, MOTOR_PULSE_THROTTLE, MOTOR_PULSE_DURATION_MS);
    } catch (err) {
        motorError.value = err?.message || String(err);
    } finally {
        setTimeout(() => {
            motorPulseInFlight.value = false;
        }, MOTOR_PULSE_DURATION_MS);
    }
}

function recordMotorScanObservation(result, swapWith = null) {
    const slot = currentMotorScanSlot.value;
    if (!slot) return;
    motorScanObservations.value[slot.scratchIdx] = {
        result,
        ...(swapWith != null ? { swapWith } : {}),
    };
}

function proceedFromMotorScanWalk() {
    if (motorScanIdx.value < motorScanSlots.value.length - 1) {
        motorScanIdx.value += 1;
    } else {
        motorPhase.value = "final-reviewing";
    }
}

async function runMotorScanPrep() {
    const currentBindings = (props.expectedMotors ?? []).map((m) => ({
        motorIdx: m.motorIdx,
        pad: m.pad,
    }));
    // Servo-bound pads must also be excluded from the scan candidate
    // pool — Discovery's remap can land servos on silkscreen-motor
    // pads, and we don't want the motor scan to overwrite those
    // bindings with `resource MOTOR N <pad>`. props.currentResources
    // is the {servoN: pad} map from the parent.
    const servoBoundPads = Object.values(props.currentResources ?? {}).filter(Boolean);
    const plan = computeMotorScanPlan({
        missingMotors: motorIdentityResult.value.missing,
        currentBindings,
        padDefaults: props.padDefaults,
        servoBoundPads,
    });
    if (plan.cliLines.length === 0) {
        motorError.value = i18n.getMessage("planeWizardMotorsNoFreePads");
        return;
    }
    if (!props.applyMotorScanPrepCallback) {
        motorError.value = i18n.getMessage("planeWizardMotorsNoCallback");
        return;
    }
    motorInFlight.value = true;
    motorError.value = null;
    try {
        await teardownMotorTest();
        // Parent persists "post-motor-scan-prep" marker (with scanSlots
        // payload) before firing the CLI batch + reboot. Wizard re-opens
        // at STEP_MOTORS with phase = "scanning" after reconnect.
        await props.applyMotorScanPrepCallback({
            cliLines: plan.cliLines,
            scanSlots: plan.scanSlots,
            missingMotors: motorIdentityResult.value.missing,
        });
    } catch (err) {
        motorError.value = err?.message || String(err);
    } finally {
        motorInFlight.value = false;
    }
}

async function runMotorFinal() {
    const result = motorScanFinalResult.value;
    if (!result.cliLines || result.cliLines.length === 0) {
        advanceFromMotorIdentity();
        return;
    }
    if (!props.applyMotorFinalCallback) {
        motorError.value = i18n.getMessage("planeWizardMotorsNoCallback");
        return;
    }
    motorInFlight.value = true;
    motorError.value = null;
    try {
        await teardownMotorTest();
        await props.applyMotorFinalCallback(result.cliLines);
        // Post-scan-final must funnel through advanceFromMotorIdentity()
        // so twin-motor wings still hit the yaw-walking sub-phase. The
        // earlier direct `step.value = STEP_DONE` jumped past yaw entirely
        // whenever the user took the scan path.
        advanceFromMotorIdentity();
    } catch (err) {
        motorError.value = err?.message || String(err);
    } finally {
        motorInFlight.value = false;
    }
}

// ─── Yaw direction sub-phase ───
// Twin-motor wings use diff-thrust mmix entries to yaw. After motor
// identity confirms each motor is where expected, this sub-phase
// pulses both motors with diff-thrust to verify yaw direction.
// Single-motor wings auto-skip.
const YAW_PULSE_LOW = 1100;
const YAW_PULSE_HIGH = 1200;
const YAW_PULSE_DURATION_MS = 1200;

const yawObservation = ref(null); // null | 'match' | 'wrong'
const yawPulseInFlight = ref(false);

const yawFlipResult = computed(() =>
    computeYawFlipPlan({
        observation: yawObservation.value,
        motorCount: props.motorCount ?? 1,
    }),
);

// After identity completes (no swap needed OR swap committed), decide
// whether to enter the yaw sub-phase or skip straight to DONE.
function advanceFromMotorIdentity() {
    if ((props.motorCount ?? 1) >= 2) {
        motorPhase.value = "yaw-walking";
        yawObservation.value = null;
    } else {
        completed.value.add(STEP_MOTORS);
        teardownMotorTest();
        step.value = STEP_DONE;
    }
}

async function pulseYawTest() {
    if (yawPulseInFlight.value) return;
    motorError.value = null;
    yawPulseInFlight.value = true;
    try {
        await ensureMotorTestEnabled();
        // M1 (idx 0) low, M2 (idx 1) high — simulates a yaw-right
        // command on a left/right twin-motor wing. User watches the
        // plane and reports whether the rotation matches expectation.
        pulseMotorPair(0, YAW_PULSE_LOW, 1, YAW_PULSE_HIGH, YAW_PULSE_DURATION_MS);
    } catch (err) {
        motorError.value = err?.message || String(err);
    } finally {
        setTimeout(() => {
            yawPulseInFlight.value = false;
        }, YAW_PULSE_DURATION_MS);
    }
}

function recordYawObservation(result) {
    yawObservation.value = result;
}

function proceedFromYawWalk() {
    motorPhase.value = "yaw-reviewing";
}

async function runYawFlip() {
    const result = yawFlipResult.value;
    if (!result.needsFlip) {
        completed.value.add(STEP_MOTORS);
        await teardownMotorTest();
        step.value = STEP_DONE;
        return;
    }
    if (!props.applyYawFlipCallback) {
        motorError.value = i18n.getMessage("planeWizardMotorsNoCallback");
        return;
    }
    motorInFlight.value = true;
    motorError.value = null;
    try {
        await teardownMotorTest();
        await props.applyYawFlipCallback(result.cliLines);
        completed.value.add(STEP_MOTORS);
        step.value = STEP_DONE;
    } catch (err) {
        motorError.value = err?.message || String(err);
    } finally {
        motorInFlight.value = false;
    }
}

const selectedAirframe = computed(() => props.airframes.find((a) => a.id === airframeId.value) || null);
const surfaces = computed(() => selectedAirframe.value?.surfaces || []);
const currentSurface = computed(() => surfaces.value[surfaceIdx.value] || null);

const surfaceOptions = computed(() => surfaces.value.map((s) => ({ value: s.label, label: s.label })));

// Phase 7b — visual surface deflection bindings for the .wz-split
// left column. `currentVisualHighlight` picks the active surface
// (Discovery/Direction/Endpoints walking phases). `currentVisualDir`
// drives the rotation transform; +1 deflects up, -1 down. SVG
// components transition smoothly so any dir change animates.
const lastPulseDir = ref(0);

const currentVisualHighlight = computed(() => {
    if (step.value === STEP_DISCOVERY && discoveryPhase.value === "walking" && currentSurface.value) {
        return surfaceLabelToHighlight(currentSurface.value.label);
    }
    // Scan sub-phase: no expected surface up front (the whole point of
    // scanning is the user telling US what moved). Reflect their
    // observation back: if they picked a surface from the dropdown,
    // highlight it; if "Nothing moved" / "Multiple", leave null.
    if (step.value === STEP_DISCOVERY && discoveryPhase.value === "scanning") {
        const slot = scanSlots.value[scanSurfaceIdx.value];
        if (slot) {
            const obs = scanObservations.value[slot.servoN];
            if (obs && obs !== OBS_NOTHING && obs !== OBS_MULTIPLE && obs !== OBS_NO_SERVO) {
                return surfaceLabelToHighlight(obs);
            }
        }
    }
    if (step.value === STEP_DIRECTION && directionPhase.value === "walking" && currentDirectionSlot.value) {
        return surfaceLabelToHighlight(currentDirectionSlot.value.surface.label);
    }
    if (step.value === STEP_ENDPOINTS && endpointPhase.value === "walking" && currentEndpointSlot.value) {
        return surfaceLabelToHighlight(currentEndpointSlot.value.surface.label);
    }
    return null;
});

const currentVisualDir = computed(() => {
    if (step.value === STEP_DISCOVERY && discoveryPhase.value === "walking") {
        return lastPulseDir.value;
    }
    if (step.value === STEP_DISCOVERY && discoveryPhase.value === "scanning") {
        return lastPulseDir.value;
    }
    if (step.value === STEP_DIRECTION && directionPhase.value === "walking" && directionMode.value === "wizard") {
        return lastPulseDir.value;
    }
    if (step.value === STEP_DIRECTION && directionPhase.value === "walking" && directionMode.value === "pilot") {
        const axis = currentDirectionSlot.value?.axis;
        if (!axis) return 0;
        const ch = axis === "roll" ? rcRoll.value : axis === "pitch" ? rcPitch.value : rcYaw.value;
        return Math.max(-1, Math.min(1, (ch - 1500) / 500));
    }
    if (step.value === STEP_ENDPOINTS && endpointPhase.value === "walking") {
        if (endpointHoldEnd.value === END_MIN) return -1;
        if (endpointHoldEnd.value === null) return 0;
        return 1; // END_MAX
    }
    return 0;
});

// Direction step hint banner — sits below the plane SVG and tells
// the user what surface motion is expected for a positive stick
// command on the current axis. The hint describes physical surface
// deflection ("L AIL DOWN, R AIL UP"), not flight attitude — pilots
// using the wizard can see the surfaces but not the plane in flight.
//
// Same content in both modes: the wizard's pulse and the pilot's
// stick are both positive-input commands on the active axis. The
// hint shows the EXPECTED correct surface motion. If the user sees
// the opposite, that's "wrong direction" and the wizard flips the
// rate sign.
const directionStickHint = computed(() => {
    if (step.value !== STEP_DIRECTION || directionPhase.value !== "walking") return null;
    const slot = currentDirectionSlot.value;
    if (!slot) return null;
    const axis = slot.axis;
    const stickLabel = i18n.getMessage(`planeWizardDirectionStickPos_${axis}`);
    const motionKey = `planeWizardDirectionMotion_${airframeId.value}_${axis}`;
    const motionLabel = i18n.getMessage(motionKey);
    return {
        mode: directionMode.value,
        label: i18n.getMessage("planeWizardDirectionHintWizardLabel"),
        stick: stickLabel,
        motion: motionLabel || null,
    };
});

// Motors yaw walking hint — same shape as directionStickHint but for
// the diff-thrust verification step. Wizard always pulses M2 high /
// M1 low (right yaw), so the hint is fixed: "Yaw right → PLANE rotates
// clockwise from above". User confirms by watching plane rotation.
const motorYawHint = computed(() => {
    if (step.value !== STEP_MOTORS || motorPhase.value !== "yaw-walking") return null;
    return {
        mode: "wizard",
        label: i18n.getMessage("planeWizardYawHintLabel"),
        stick: i18n.getMessage("planeWizardYawHintStick"),
        motion: i18n.getMessage("planeWizardYawHintMotion"),
    };
});

const selectedAirframeLabel = computed(() => {
    const af = props.airframes.find((a) => a.id === airframeId.value);
    return af ? af.label : "";
});

const applyInFlight = computed(() => applyState.value === "applying");

const stepLabels = computed(() => [
    i18n.getMessage("planeWizardStepSafety"),
    i18n.getMessage("planeWizardStepAirframe"),
    i18n.getMessage("planeWizardStepApply"),
    i18n.getMessage("planeWizardStepDiscovery"),
    i18n.getMessage("planeWizardStepDirection"),
    i18n.getMessage("planeWizardStepEndpoints"),
    i18n.getMessage("planeWizardStepMotors"),
    i18n.getMessage("planeWizardStepDone"),
]);

const canContinue = computed(() => {
    if (step.value === STEP_SAFETY) return safety.propsRemoved && !props.armed;
    if (step.value === STEP_AIRFRAME) return airframeId.value !== null;
    if (step.value === STEP_APPLY) {
        return applyState.value === "idle" || applyState.value === "error" || applyState.value === "done";
    }
    if (step.value === STEP_DISCOVERY) {
        if (discoveryPhase.value === "gate") {
            return propsConfirmedForDiscovery.value && !props.armed;
        }
        if (discoveryPhase.value === "walking") {
            return !pulseInFlight.value;
        }
        if (discoveryPhase.value === "reviewing") {
            return !remapInFlight.value && !scanInFlight.value;
        }
        if (discoveryPhase.value === "scanning") {
            return !pulseInFlight.value;
        }
        if (discoveryPhase.value === "final-reviewing") {
            return finalRemapResult.value && !remapInFlight.value;
        }
    }
    if (step.value === STEP_DIRECTION) {
        if (directionPhase.value === "walking") return !pulseInFlight.value;
        if (directionPhase.value === "reviewing") return !directionInFlight.value;
    }
    if (step.value === STEP_ENDPOINTS) {
        if (endpointPhase.value === "walking") return !endpointHoldInFlight.value;
        if (endpointPhase.value === "reviewing") return !endpointInFlight.value;
    }
    if (step.value === STEP_MOTORS) {
        if (motorPhase.value === "walking") return !motorPulseInFlight.value;
        if (motorPhase.value === "reviewing") return !motorInFlight.value;
        if (motorPhase.value === "scanning") return !motorPulseInFlight.value;
        if (motorPhase.value === "final-reviewing") return !motorInFlight.value;
        if (motorPhase.value === "yaw-walking") return yawObservation.value !== null && !yawPulseInFlight.value;
        if (motorPhase.value === "yaw-reviewing") return !motorInFlight.value;
    }
    return true;
});

const continueLabel = computed(() => {
    if (step.value === STEP_APPLY) {
        if (applyState.value === "error") return i18n.getMessage("planeWizardRetry");
        if (applyState.value === "done") return i18n.getMessage("planeWizardContinue");
        return i18n.getMessage("planeWizardApply");
    }
    if (step.value === STEP_DISCOVERY) {
        if (discoveryPhase.value === "gate") return i18n.getMessage("planeWizardDiscoveryStart");
        if (discoveryPhase.value === "walking") {
            if (surfaceIdx.value < surfaces.value.length - 1) {
                return i18n.getMessage("planeWizardDiscoveryNextSurface");
            }
            return i18n.getMessage("planeWizardContinue");
        }
        if (discoveryPhase.value === "reviewing") {
            if (remapResult.value?.needsRemap) return i18n.getMessage("planeWizardRemapApply");
            return i18n.getMessage("planeWizardContinue");
        }
        if (discoveryPhase.value === "scanning") {
            if (scanSurfaceIdx.value < scanSlots.value.length - 1) {
                return i18n.getMessage("planeWizardDiscoveryNextSurface");
            }
            return i18n.getMessage("planeWizardContinue");
        }
        if (discoveryPhase.value === "final-reviewing") {
            return i18n.getMessage("planeWizardRemapApply");
        }
    }
    if (step.value === STEP_DIRECTION) {
        if (directionPhase.value === "walking") return i18n.getMessage("planeWizardContinue");
        if (directionPhase.value === "reviewing") return i18n.getMessage("planeWizardDirectionApply");
    }
    if (step.value === STEP_ENDPOINTS) {
        if (endpointPhase.value === "walking") {
            return endpointStopIdx.value < endpointStops.value.length - 1
                ? i18n.getMessage("planeWizardEndpointsCapture")
                : i18n.getMessage("planeWizardContinue");
        }
        if (endpointPhase.value === "reviewing") {
            return endpointChanges.value.length > 0
                ? i18n.getMessage("planeWizardEndpointsApply")
                : i18n.getMessage("planeWizardContinue");
        }
    }
    if (step.value === STEP_MOTORS) {
        if (motorPhase.value === "walking") {
            return motorWalkIdx.value < motorWalkPool.value.length - 1
                ? i18n.getMessage("planeWizardMotorsNextMotor")
                : i18n.getMessage("planeWizardContinue");
        }
        if (motorPhase.value === "reviewing") {
            return motorIdentityResult.value.needsApply
                ? i18n.getMessage("planeWizardMotorsApply")
                : i18n.getMessage("planeWizardContinue");
        }
        if (motorPhase.value === "scanning") {
            return motorScanIdx.value < motorScanSlots.value.length - 1
                ? i18n.getMessage("planeWizardMotorsNextMotor")
                : i18n.getMessage("planeWizardContinue");
        }
        if (motorPhase.value === "final-reviewing") {
            return motorScanFinalResult.value.cliLines.length > 0
                ? i18n.getMessage("planeWizardMotorsApply")
                : i18n.getMessage("planeWizardContinue");
        }
        if (motorPhase.value === "yaw-walking") {
            return i18n.getMessage("planeWizardContinue");
        }
        if (motorPhase.value === "yaw-reviewing") {
            return yawFlipResult.value.needsFlip
                ? i18n.getMessage("planeWizardYawApply")
                : i18n.getMessage("planeWizardContinue");
        }
    }
    return i18n.getMessage("planeWizardContinue");
});

const canShowBack = computed(() => {
    if (applyInFlight.value || pulseInFlight.value || remapInFlight.value || scanInFlight.value) return false;
    if (step.value === 0) return false;
    return true;
});

function back() {
    if (applyInFlight.value || pulseInFlight.value || remapInFlight.value || scanInFlight.value) return;
    if (step.value === STEP_DISCOVERY && discoveryPhase.value !== "gate") {
        // Step backwards within Discovery phases first.
        if (discoveryPhase.value === "final-reviewing") {
            discoveryPhase.value = "scanning";
            return;
        }
        if (discoveryPhase.value === "scanning") {
            if (scanSurfaceIdx.value > 0) {
                scanSurfaceIdx.value -= 1;
                return;
            }
            // Scan walk start — back returns to reviewing (which had
            // the scan offer that triggered this walk).
            discoveryPhase.value = "reviewing";
            return;
        }
        if (discoveryPhase.value === "reviewing") {
            discoveryPhase.value = "walking";
            return;
        }
        if (discoveryPhase.value === "walking") {
            if (surfaceIdx.value > 0) {
                surfaceIdx.value -= 1;
                return;
            }
            discoveryPhase.value = "gate";
            return;
        }
    }
    if (step.value === STEP_ENDPOINTS) {
        if (endpointPhase.value === "reviewing") {
            endpointPhase.value = "walking";
            return;
        }
        if (endpointPhase.value === "walking" && endpointStopIdx.value > 0) {
            endpointStopIdx.value -= 1;
            endpointHoldEnd.value = null;
            return;
        }
    }
    if (step.value === STEP_MOTORS) {
        if (motorPhase.value === "yaw-reviewing") {
            motorPhase.value = "yaw-walking";
            return;
        }
        if (motorPhase.value === "yaw-walking") {
            motorPhase.value = "reviewing";
            return;
        }
        if (motorPhase.value === "final-reviewing") {
            motorPhase.value = "scanning";
            return;
        }
        if (motorPhase.value === "scanning" && motorScanIdx.value > 0) {
            motorScanIdx.value -= 1;
            return;
        }
        if (motorPhase.value === "reviewing") {
            motorPhase.value = "walking";
            return;
        }
        if (motorPhase.value === "walking" && motorWalkIdx.value > 0) {
            motorWalkIdx.value -= 1;
            return;
        }
    }
    if (step.value > 0) step.value -= 1;
}

async function next() {
    if (step.value === STEP_APPLY) {
        if (applyState.value === "done") {
            completed.value.add(STEP_APPLY);
            step.value = STEP_DISCOVERY;
            discoveryPhase.value = "gate";
            return;
        }
        await runApply();
        return;
    }

    if (step.value === STEP_DIRECTION) {
        if (directionPhase.value === "walking") {
            // Per-axis advance happens inline via recordDirectionObservation.
            // Footer Continue is the escape hatch / "force advance" — used
            // to jump to reviewing if the user wants to skip remaining
            // axes (or already finished and the auto-advance hit the end).
            proceedFromDirectionWalk();
            return;
        }
        if (directionPhase.value === "reviewing") {
            await runDirection();
            return;
        }
    }

    if (step.value === STEP_ENDPOINTS) {
        if (endpointPhase.value === "walking") {
            captureCurrentEndpoint();
            return;
        }
        if (endpointPhase.value === "reviewing") {
            await runEndpoints();
            return;
        }
    }

    if (step.value === STEP_MOTORS) {
        if (motorPhase.value === "walking") {
            proceedFromMotorWalk();
            return;
        }
        if (motorPhase.value === "reviewing") {
            await runMotors();
            return;
        }
        if (motorPhase.value === "scanning") {
            proceedFromMotorScanWalk();
            return;
        }
        if (motorPhase.value === "final-reviewing") {
            await runMotorFinal();
            return;
        }
        if (motorPhase.value === "yaw-walking") {
            proceedFromYawWalk();
            return;
        }
        if (motorPhase.value === "yaw-reviewing") {
            await runYawFlip();
            return;
        }
    }

    if (step.value === STEP_DISCOVERY) {
        if (discoveryPhase.value === "gate") {
            discoveryPhase.value = "walking";
            return;
        }
        if (discoveryPhase.value === "walking") {
            // If the user didn't change the dropdown, the displayed
            // value (expected surface) is what we record.
            if (
                observations.value[surfaceIdx.value] === undefined ||
                observations.value[surfaceIdx.value] === null ||
                observations.value[surfaceIdx.value] === ""
            ) {
                observations.value[surfaceIdx.value] = currentSurface.value?.label ?? "";
            }
            if (surfaceIdx.value < surfaces.value.length - 1) {
                surfaceIdx.value += 1;
                return;
            }
            // Walk complete — compute remap and decide where to go next.
            await proceedFromWalking();
            return;
        }
        if (discoveryPhase.value === "reviewing") {
            // Reviewing's primary action: fire runRemap which calls
            // computeFinalRemap. Even with no swaps detected, the
            // commit binds motors to remaining silkscreen-motor pads
            // (Option 2 — Apply released motors, deferring their
            // assignment to this commit). Scan trigger is a SECONDARY
            // action via its own body button.
            await runRemap();
            return;
        }
        if (discoveryPhase.value === "scanning") {
            // Default scan observation to "Nothing moved" if the user
            // didn't change the dropdown — most scan slots are unused
            // motor pads with nothing wired to them.
            const slotN = scanSlots.value[scanSurfaceIdx.value]?.servoN;
            if (
                slotN != null &&
                (scanObservations.value[slotN] === undefined ||
                    scanObservations.value[slotN] === null ||
                    scanObservations.value[slotN] === "")
            ) {
                scanObservations.value[slotN] = OBS_NOTHING;
            }
            if (scanSurfaceIdx.value < scanSlots.value.length - 1) {
                scanSurfaceIdx.value += 1;
                return;
            }
            // Scan walk complete — compute final remap, transition to
            // final-reviewing.
            proceedFromScanning();
            return;
        }
        if (discoveryPhase.value === "final-reviewing") {
            await runFinalRemap();
            return;
        }
    }

    completed.value.add(step.value);
    step.value += 1;
}

async function runApply() {
    applyState.value = "applying";
    applyError.value = null;
    try {
        await props.applyCallback(airframeId.value);
        applyState.value = "done";
        completed.value.add(STEP_APPLY);
        // Reset Discovery state for a fresh walk after Apply commits.
        // (Note: in practice the reboot drops the configurator and this
        // component unmounts. resetState() runs again on remount via
        // resume-state.)
        surfaceIdx.value = 0;
        observations.value = [];
        pulseError.value = null;
        discoveryPhase.value = "gate";
        propsConfirmedForDiscovery.value = false;
        step.value = STEP_DISCOVERY;
    } catch (err) {
        applyState.value = "error";
        applyError.value = err?.message || String(err);
    }
}

async function pulseCurrentSurface() {
    if (!currentSurface.value || pulseInFlight.value) return;
    pulseError.value = null;
    pulseInFlight.value = true;
    lastPulseDir.value = PULSE_PWM > 1500 ? 1 : -1;
    try {
        await pulseServoMiddle(currentSurface.value.slot, PULSE_PWM, PULSE_DURATION_MS);
        // Hold the "pulsing" UI state through the firmware auto-clear
        // window so the dropdown re-enables exactly when the servo
        // re-centers — gives the user a clear "now pick" moment.
        await new Promise((resolve) => setTimeout(resolve, PULSE_DURATION_MS));
    } catch (err) {
        pulseError.value = err?.message || String(err);
    } finally {
        pulseInFlight.value = false;
        lastPulseDir.value = 0;
    }
}

// Pulse the current scan slot. The slot's pad was reassigned from a
// MOTOR resource to SERVO N+ during scan-prep; SERVO_OVERRIDE matches
// by SLOT enum so we send servoN+1 (slot 2 = SERVO 1, etc.).
async function pulseCurrentScanSlot() {
    const slot = scanSlots.value[scanSurfaceIdx.value];
    if (!slot || pulseInFlight.value) return;
    pulseError.value = null;
    pulseInFlight.value = true;
    lastPulseDir.value = PULSE_PWM > 1500 ? 1 : -1;
    try {
        // SLOT enum value = servoN + 1 (per planePresets convention:
        // SERVO 1 pad = SLOT 2 = ELEVATOR slot, etc.).
        await pulseServoMiddle(slot.servoN + 1, PULSE_PWM, PULSE_DURATION_MS);
        await new Promise((resolve) => setTimeout(resolve, PULSE_DURATION_MS));
    } catch (err) {
        pulseError.value = err?.message || String(err);
    } finally {
        pulseInFlight.value = false;
        lastPulseDir.value = 0;
    }
}

function pickObservation(value) {
    observations.value[surfaceIdx.value] = value;
}

function pickScanObservation(value) {
    const slotN = scanSlots.value[scanSurfaceIdx.value]?.servoN;
    if (slotN != null) scanObservations.value[slotN] = value;
}

// Surface-led scan-walking helpers. Original wizard UX (per
// WING_TUNING_GUIDE) walks each missing surface ("Searching for
// Aileron R") rather than each scratch slot, with 2-button
// Moved / Didn't move picks. currentSearchingSurface returns the
// first unmatched missing surface from scanPlan.missingSurfaces;
// once a slot gets marked as a positive match, the next missing
// surface auto-surfaces. Returns null when all matched, signalling
// the template's scan-complete branch.
const currentSearchingSurface = computed(() => {
    const missing = scanPlan.value?.missingSurfaces;
    if (!Array.isArray(missing) || missing.length === 0) return null;
    const matched = new Set();
    for (const v of Object.values(scanObservations.value)) {
        if (v && v !== OBS_NOTHING && v !== OBS_MULTIPLE && v !== OBS_NO_SERVO) {
            matched.add(v);
        }
    }
    return missing.find((s) => !matched.has(s)) ?? null;
});

function onScanSurfaceMoved() {
    const slot = scanSlots.value[scanSurfaceIdx.value];
    const surface = currentSearchingSurface.value;
    if (!slot || !surface) return;
    scanObservations.value[slot.servoN] = surface;
    advanceScanSlot();
}

function onScanSurfaceDidntMove() {
    const slot = scanSlots.value[scanSurfaceIdx.value];
    if (!slot) return;
    scanObservations.value[slot.servoN] = OBS_NOTHING;
    advanceScanSlot();
}

function advanceScanSlot() {
    if (scanSurfaceIdx.value < scanSlots.value.length - 1) {
        scanSurfaceIdx.value += 1;
    }
    // else: walked all slots; if any missing surface is still
    // unmatched, currentSearchingSurface still points at it and the
    // user can rewind via Back. Continue gating is unchanged —
    // proceedFromScanning runs whenever the user clicks Continue.
}

async function proceedFromWalking() {
    // Build airframeSurfaces input for computeRemap.
    const airframeSurfaces = surfaces.value.map((s) => ({
        servoN: s.pad,
        expectedSurface: s.label,
    }));
    // Convert observations array (indexed by surfaceIdx) into the
    // {servoN: outcome} shape the remap utility expects.
    const obsByServoN = {};
    surfaces.value.forEach((s, idx) => {
        const obs = observations.value[idx];
        if (obs !== undefined && obs !== null) {
            obsByServoN[s.pad] = obs;
        }
    });

    remapResult.value = computeRemap({
        currentResources: props.currentResources,
        airframeSurfaces,
        observations: obsByServoN,
    });

    // Phase 3.5 scan detection: if any surface reported Nothing AND
    // there are unused motor pads on the FC, offer to scan them. The
    // computeScanPlan utility generates the CLI batch + scanSlots; the
    // wizard only fires it when the user clicks "Scan unused pads" in
    // the reviewing phase.
    scanPlan.value = computeScanPlan({
        padDefaults: props.padDefaults,
        motorCount: props.motorCount,
        airframeSurfaces,
        observations: obsByServoN,
        currentResources: props.currentResources,
    });

    // Stash the original observations for use in computeFinalRemap
    // after a potential scan walk. The same map is sent to the parent
    // when the user triggers a scan so it survives the scan-prep reboot.
    originalObservationsForFinal.value = obsByServoN;

    // Always go to reviewing under Option 2 — even if there are no
    // swaps and nothing to scan, motors still need to be bound (Apply
    // released them, deferring their assignment to this commit).
    // Reviewing's "Apply Remap" button fires runRemap → computeFinalRemap
    // which handles the motor binding regardless of swap state.
    discoveryPhase.value = "reviewing";
}

async function runRemap() {
    if (!props.applyRemapCallback) {
        // Parent didn't wire the remap callback — surface as error so the
        // user knows the wizard can't auto-fix. They can still close + go
        // edit Pin Assignment manually.
        remapError.value = i18n.getMessage("planeWizardRemapNoCallback");
        return;
    }
    remapInFlight.value = true;
    remapError.value = null;
    try {
        // Use computeFinalRemap (with empty scan inputs) so motor
        // bindings get included even on the non-scan path. Apply
        // released motors per Option 2; this commit re-binds them
        // alongside the servo swaps.
        const finalForNonScan = computeFinalRemap({
            currentResources: props.currentResources,
            airframeSurfaces: surfaces.value.map((s) => ({
                servoN: s.pad,
                expectedSurface: s.label,
            })),
            originalObservations: originalObservationsForFinal.value,
            scanSlots: [],
            scanObservations: {},
            padDefaults: props.padDefaults,
            motorCount: props.motorCount,
            padTimers: props.hardwareAnalysis?.padTimers ?? null,
        });
        await props.applyRemapCallback(finalForNonScan.cliLines);
        // The parent's callback persists post-remap state and triggers
        // a reboot. Configurator drops; this component unmounts. On
        // reconnect, the wizard auto-resumes at Done. No advance needed
        // here — the resume path handles it.
    } catch (err) {
        remapError.value = err?.message || String(err);
    } finally {
        remapInFlight.value = false;
    }
}

// Phase 3.5: trigger scan setup. Releases unused motor pads, assigns
// them as new SERVO N+ slots, reboots. Wizard auto-resumes at the
// scanning sub-phase to walk the new slots.
async function runScan() {
    if (!props.applyScanCallback || !scanPlan.value?.eligible) {
        scanError.value = i18n.getMessage("planeWizardScanNoCallback");
        return;
    }
    scanInFlight.value = true;
    scanError.value = null;
    try {
        // Compute the post-scan resource map: existing airframe pads
        // + the new scan slot pads. Parent persists this so the
        // wizard's scan walk has accurate currentResources after
        // reboot.
        const postScanResources = { ...props.currentResources };
        for (const slot of scanPlan.value.scanSlots) {
            postScanResources[slot.servoN] = slot.pad;
        }
        await props.applyScanCallback({
            cliLines: scanPlan.value.cliLines,
            scanSlots: scanPlan.value.scanSlots,
            // missingSurfaces is what drives the surface-led "Searching
            // for X" banner during the scan walk. Round-tripping it
            // through the resume marker is what re-hydrates scanPlan
            // post-reboot — without it currentSearchingSurface always
            // returns null and the Moved button no-ops silently.
            missingSurfaces: scanPlan.value.missingSurfaces,
            originalObservations: originalObservationsForFinal.value,
            currentResources: postScanResources,
        });
        // Parent persists post-scan-prep + reboots. Component unmounts.
        // Resume path lands at scanning phase.
    } catch (err) {
        scanError.value = err?.message || String(err);
    } finally {
        scanInFlight.value = false;
    }
}

// Walk scan slots completed → derive final remap, advance to
// final-reviewing.
function proceedFromScanning() {
    finalRemapResult.value = computeFinalRemap({
        currentResources: props.currentResources,
        airframeSurfaces: surfaces.value.map((s) => ({
            servoN: s.pad,
            expectedSurface: s.label,
        })),
        originalObservations: originalObservationsForFinal.value,
        scanSlots: scanSlots.value,
        scanObservations: scanObservations.value,
        // Option 2: motors were released by Apply, so the final commit
        // re-binds them based on what's left after servo discovery.
        // Picker is greedy by silkscreen index with timer isolation.
        padDefaults: props.padDefaults,
        motorCount: props.motorCount,
        padTimers: props.hardwareAnalysis?.padTimers ?? null,
    });
    discoveryPhase.value = "final-reviewing";
}

// Apply the final remap. Same dance as runRemap — parent persists
// post-remap, fires CLI batch, reboots, wizard resumes at Done.
async function runFinalRemap() {
    if (!props.applyRemapCallback) {
        remapError.value = i18n.getMessage("planeWizardRemapNoCallback");
        return;
    }
    if (!finalRemapResult.value || !finalRemapResult.value.needsRemap) {
        // Edge case — somehow no work to do. Skip straight to Done.
        completed.value.add(STEP_DISCOVERY);
        step.value = STEP_DONE;
        return;
    }
    remapInFlight.value = true;
    remapError.value = null;
    try {
        await props.applyRemapCallback(finalRemapResult.value.cliLines);
    } catch (err) {
        remapError.value = err?.message || String(err);
    } finally {
        remapInFlight.value = false;
    }
}

function finish() {
    emit("complete");
    handleClose();
}

async function handleClose(value) {
    if (value === false || value === undefined) {
        if (applyInFlight.value || remapInFlight.value) return;
        // Restore any in-flight pulse values BEFORE the modal hides
        // and onBeforeUnmount fires its own cleanup. Idempotent —
        // pulseState.clear() makes the second call a no-op.
        await wizardServoPulseCleanup();
        await restoreMiddlesFromSnapshot();
        emit("update:modelValue", false);
        emit("close");
        resetState();
    }
}

function resetState() {
    if (props.resumeState && props.resumeState.airframeId != null) {
        // Post-reboot resume.
        airframeId.value = props.resumeState.airframeId;
        completed.value = new Set([STEP_SAFETY, STEP_AIRFRAME, STEP_APPLY]);
        safety.propsRemoved = true;
        applyState.value = "done";
        applyError.value = null;
        step.value = props.resumeState.startAtStep ?? STEP_DISCOVERY;
        propsConfirmedForDiscovery.value = false;
        if (step.value === STEP_DIRECTION) {
            // Post-remap resume lands at Direction. Discovery is done.
            completed.value.add(STEP_DISCOVERY);
            discoveryPhase.value = "gate"; // irrelevant for STEP_DIRECTION
        } else if (props.resumeState.phase === "post-motors" || props.resumeState.phase === "post-motor-final") {
            // Identity (or scan-final) committed via reboot. Twin-motor
            // wings still need yaw direction verification — single-motor
            // wings have no diff-thrust yaw to verify, so they advance
            // straight to Done.
            completed.value.add(STEP_DISCOVERY);
            completed.value.add(STEP_DIRECTION);
            completed.value.add(STEP_ENDPOINTS);
            discoveryPhase.value = "gate";
            if ((props.motorCount ?? 1) >= 2) {
                motorPhase.value = "yaw-walking";
            } else {
                completed.value.add(STEP_MOTORS);
                step.value = STEP_DONE;
            }
        } else if (props.resumeState.phase === "post-motor-scan-prep") {
            // Motor scan-prep just rebooted. Land at STEP_MOTORS with
            // motorPhase = "scanning", populated from the persisted
            // scanSlots payload. Mark earlier steps as completed.
            completed.value.add(STEP_DISCOVERY);
            completed.value.add(STEP_DIRECTION);
            completed.value.add(STEP_ENDPOINTS);
            discoveryPhase.value = "gate";
            motorPhase.value = "scanning";
            motorScanSlots.value = props.resumeState.scanSlots ?? [];
            motorScanIdx.value = 0;
            // Pre-default every scratch slot to "nothing moved" — the
            // common case during scan walks is most slots are silent and
            // only one or two have the missing motor. User just clicks
            // through with the dropdown already on the right answer for
            // most slots, only intervening on the spinning ones.
            motorScanObservations.value = Object.fromEntries(
                motorScanSlots.value.map((s) => [s.scratchIdx, { result: "none" }]),
            );
            // Recreate motorObservations from missingMotors so the
            // surface-led "Searching for MOTOR N" banner has a target
            // and computeMotorScanFinal sees the right "missing" set.
            // The parent's marker stores missingMotors directly (a
            // simple list of motorIdx); rebuild { [idx]: {result:
            // "none"} } to match what the original walk would have left
            // in motorObservations.
            const missingFromMarker = props.resumeState.missingMotors ?? [];
            motorObservations.value = Object.fromEntries(missingFromMarker.map((idx) => [idx, { result: "none" }]));
        } else if (step.value === STEP_DONE) {
            completed.value.add(STEP_DISCOVERY);
            completed.value.add(STEP_DIRECTION);
            completed.value.add(STEP_ENDPOINTS);
            completed.value.add(STEP_MOTORS);
            discoveryPhase.value = "gate";
        } else if (props.resumeState.phase === "post-scan-prep") {
            // Resume directly into the scan walking sub-phase. The
            // parent persisted scanSlots + originalObservations + the
            // missingSurfaces list across the scan-prep reboot so the
            // surface-led "Searching for X" banner has a target and
            // computeFinalRemap can run on Continue.
            discoveryPhase.value = "scanning";
            scanSlots.value = props.resumeState.scanSlots ?? [];
            originalObservationsForFinal.value = props.resumeState.originalObservations ?? {};
            // Re-hydrate enough of scanPlan that currentSearchingSurface
            // can compute. Eligible+cliLines aren't needed post-reboot
            // (the prep batch already ran).
            scanPlan.value = {
                eligible: true,
                cliLines: [],
                scanSlots: scanSlots.value,
                missingSurfaces: props.resumeState.missingSurfaces ?? [],
            };
            propsConfirmedForDiscovery.value = true; // already passed gate
        } else {
            discoveryPhase.value = "gate";
        }
    } else {
        step.value = 0;
        completed.value = new Set();
        safety.propsRemoved = false;
        airframeId.value = null;
        applyState.value = "idle";
        applyError.value = null;
        discoveryPhase.value = "gate";
        propsConfirmedForDiscovery.value = false;
        scanSlots.value = [];
        originalObservationsForFinal.value = {};
    }
    surfaceIdx.value = 0;
    observations.value = [];
    pulseInFlight.value = false;
    pulseError.value = null;
    remapResult.value = null;
    remapInFlight.value = false;
    remapError.value = null;
    // scanPlan: only reset when NOT resuming into the scan walk —
    // post-scan-prep resume rehydrates scanPlan above and nulling it
    // here would wipe the surface-led banner's target, leaving the
    // Moved button permanently disabled.
    if (props.resumeState?.phase !== "post-scan-prep") {
        scanPlan.value = null;
    }
    scanInFlight.value = false;
    scanError.value = null;
    scanObservations.value = {};
    scanSurfaceIdx.value = 0;
    finalRemapResult.value = null;
    // Direction step resets — kept fresh on every open. Post-remap
    // resume lands user at Direction (walking phase) regardless of
    // earlier scan path; observations start empty.
    directionMode.value = "pilot";
    directionPhase.value = "walking";
    directionSlotIdx.value = 0;
    directionObservations.value = {};
    directionFixes.value = null;
    directionInFlight.value = false;
    directionError.value = null;
}

watch(
    () => props.modelValue,
    (open) => {
        if (open) resetState();
    },
);

// Stage the preset on airframe pick so the parent's recommender + plan
// recompute, and the Apply step's pad table reflects the actual pads
// that will be committed (not "NONE" placeholders). Parent listens via
// @airframe-selected and calls its applyPreset() which mutates reactive
// state only — no MSP/CLI fires here.
watch(airframeId, (newId, oldId) => {
    if (newId && newId !== oldId) {
        emit("airframeSelected", newId);
    }
});

// Twin-motor toggle (Step 2). Mirrors the Mixer tab's "Use 2 motors"
// checkbox — when on, the staged preset adds MOTOR 2 with ±0.4 yaw
// and switches yaw_type to DIFF_THRUST. Computed setter emits
// motorCountSelected so the parent's motorCount ref updates and the
// pinAssignmentPlan recomputes for the right number of motor pads.
const wizardTwoMotors = computed({
    get: () => props.motorCount === 2,
    set: (val) => emit("motorCountSelected", val ? 2 : 1),
});

// Battery cell count picker (Step 2). 2S–6S — drives
// tpa_speed_max_voltage (cells × 420). Parent listens to
// cellCountSelected and stages fields.tpa_speed_max_voltage; the same
// MSP_SET_WING_TUNING write pushes it alongside the S-term defaults.
const wizardCellCount = computed({
    get: () => props.cellCount,
    set: (val) => emit("cellCountSelected", Number(val)),
});

const CELL_COUNT_OPTIONS = [2, 3, 4, 5, 6];

// ─── Servo pulse cleanup hooks (Phase 8 dual-support) ───────────────
// pulseServoMiddle()'s mainline-fallback path live-edits servo `middle`
// in FC RAM via MSP_SET_SERVO_CONFIGURATION (no EEPROM write). Restores
// happen via setTimeout after each pulse, BUT setTimeout is fragile to
// tab backgrounding, crashes, USB yanks, and step transitions mid-pulse.
// These hooks force-restore on every realistic exit path so a stuck
// pulse value can't persist to EEPROM via a follow-up Save.
//
// Wing-fork users are on the firmware-enforced override path — these
// hooks are no-ops for them (wizardServoPulseCleanup short-circuits
// when useFallback === false).
import { onMounted as _onMounted, onBeforeUnmount as _onBeforeUnmount } from "vue";

const PULSE_STEPS = new Set([STEP_DISCOVERY, STEP_DIRECTION, STEP_ENDPOINTS, STEP_MOTORS]);

function onWizardVisibilityChange() {
    if (document.hidden) {
        // Fire-and-forget — Chrome throttles setTimeout in background
        // tabs to ~1Hz, so the pulse's restore timer would fire late.
        // Force-restore now so we don't leak the pulse value when the
        // user tabs back.
        wizardServoPulseCleanup();
    }
}

_onMounted(() => {
    resetCapabilityCache();
    snapshotMiddles();
    document.addEventListener("visibilitychange", onWizardVisibilityChange);
});

_onBeforeUnmount(async () => {
    document.removeEventListener("visibilitychange", onWizardVisibilityChange);
    await wizardServoPulseCleanup();
    await restoreMiddlesFromSnapshot();
});

// In-flight cleanup on step boundaries — leaving Discovery / Direction
// / Endpoints / Motors should restore any servos still being pulsed.
watch(step, async (newStep, oldStep) => {
    if (PULSE_STEPS.has(oldStep) && newStep !== oldStep) {
        await wizardServoPulseCleanup();
    }
});
</script>

<style scoped>
.wizard-body {
    min-width: 540px;
    max-width: 680px;
    color: var(--surface-950);
}

.wizard-stepper {
    display: flex;
    gap: 6px;
    margin-bottom: 18px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--surface-300);
}

.wizard-step-pill {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--surface-100);
    border: 1px solid var(--surface-300);
    border-radius: 3px;
    font-size: 11px;
    color: var(--surface-700);
}

.wizard-step-pill--active {
    background: var(--primary-500);
    border-color: var(--primary-500);
    color: var(--surface-50);
}

.wizard-step-pill--done {
    background: var(--surface-200);
    border-color: var(--surface-400);
    color: var(--surface-800);
}

.wizard-step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--surface-50);
    color: var(--surface-900);
    font-weight: 600;
    font-size: 10px;
}

.wizard-step-pill--active .wizard-step-num {
    background: var(--surface-50);
    color: var(--primary-700);
}

.wizard-step h3 {
    margin: 0 0 8px 0;
    font-size: 15px;
}

.wizard-step h4 {
    margin: 12px 0 6px 0;
    font-size: 13px;
}

.wizard-help {
    font-size: 12px;
    color: var(--surface-700);
    margin: 0 0 12px 0;
}

.wizard-help--small {
    font-size: 11px;
    color: var(--surface-600);
}

.wizard-blocker {
    background: var(--negative-100);
    border-left: 3px solid var(--negative-500);
    padding: 10px 12px;
    margin: 8px 0;
    font-size: 12px;
}

.wizard-blocker strong {
    display: block;
    margin-bottom: 4px;
}

.wizard-check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
    cursor: pointer;
    font-size: 13px;
}

.wizard-airframe-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
    margin-top: 8px;
}

.wizard-airframe-card {
    text-align: left;
    padding: 12px;
    background: var(--surface-100);
    border: 2px solid var(--surface-300);
    border-radius: 4px;
    cursor: pointer;
    transition:
        border-color 0.15s,
        background 0.15s;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.wizard-airframe-card:hover {
    background: var(--surface-200);
}

.wizard-airframe-card--selected {
    border-color: var(--primary-500);
    background: var(--primary-100);
}

.wizard-airframe-card-visual {
    display: block;
    margin: 0 auto 8px;
    max-width: 100%;
    height: auto;
}

.wizard-airframe-card-title {
    align-self: stretch;
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 4px;
}

.wizard-airframe-card-desc {
    font-size: 11px;
    color: var(--surface-700);
}

.wizard-airframe-motorcount,
.wizard-airframe-cells {
    margin-top: 12px;
    padding: 10px 12px;
    background: var(--surface-100);
    border: 1px solid var(--surface-300);
    border-radius: 4px;
}

.wizard-cells-label {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    font-size: 13px;
}

.wizard-cells-select {
    padding: 4px 8px;
    background: var(--surface-200);
    color: var(--text-primary, #fff);
    border: 1px solid var(--surface-500);
    border-radius: 3px;
    font-size: 13px;
    min-width: 70px;
}

.wz-split {
    display: grid;
    grid-template-columns: 45fr 55fr;
    gap: 16px;
    align-items: start;
    margin-top: 12px;
    padding-top: 4px;
}

.wz-split-visual {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding: 10px;
    background: var(--surface-100);
    border: 1px solid var(--surface-300);
    border-radius: 4px;
    align-self: start;
}

.wz-split-visual svg {
    max-width: 100%;
    height: auto;
}

.wz-split-controls {
    min-width: 0;
}

.wz-stick-hint {
    width: 100%;
    padding: 10px 12px;
    background: var(--surface-300);
    border: 1px solid var(--surface-500);
    border-left: 4px solid var(--primary-500);
    border-radius: 4px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--text-primary, #fff);
}

.wz-stick-hint--pilot {
    border-left-color: var(--surface-700);
}

.wz-stick-hint-label {
    font-size: 10px;
    color: var(--text-muted, #aaa);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 600;
}

.wz-stick-hint-body {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 13px;
    line-height: 1.3;
}

.wz-stick-hint-stick {
    font-weight: 500;
    color: var(--text-primary, #fff);
}

.wz-stick-hint-arrow {
    color: var(--primary-500);
    font-weight: 700;
}

.wz-stick-hint-motion {
    font-weight: 700;
    color: var(--primary-500);
    letter-spacing: 0.3px;
}

@media (max-width: 700px) {
    .wz-split {
        grid-template-columns: 1fr;
    }
}

.wizard-observation-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 12px;
}

.wizard-observation-card {
    text-align: left;
    padding: 12px 14px;
    background: var(--surface-100);
    border: 2px solid var(--surface-300);
    border-radius: 4px;
    cursor: pointer;
    transition:
        border-color 0.15s,
        background 0.15s;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.wizard-observation-card:hover {
    background: var(--surface-200);
}

.wizard-observation-card strong {
    font-size: 13px;
}

.wizard-observation-card span {
    font-size: 11px;
    color: var(--surface-700);
}

.wizard-observation-card:nth-child(1).wizard-observation-card--selected {
    border-color: #4caf50;
    background: rgba(76, 175, 80, 0.12);
}

.wizard-observation-card:nth-child(2).wizard-observation-card--selected {
    border-color: var(--primary-500);
    background: var(--primary-100);
}

.wizard-endpoints-skip {
    display: flex;
    align-items: center;
    gap: 14px;
    justify-content: space-between;
}

.wizard-endpoints-skip > div {
    flex: 1;
}

.wizard-endpoint-value {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 14px 0;
    padding: 14px;
    background: var(--surface-100);
    border: 2px solid var(--surface-300);
    border-radius: 4px;
}

.wizard-endpoint-pwm {
    font-size: 28px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.wizard-endpoint-pwm span {
    font-size: 14px;
    color: var(--surface-700);
    margin-left: 4px;
}

.wizard-endpoint-steppers {
    display: flex;
    gap: 6px;
}

.wizard-endpoint-steppers .wizard-btn {
    min-width: 48px;
    font-variant-numeric: tabular-nums;
}

.wizard-motor-obs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px;
    margin-top: 8px;
}

.wizard-motor-obs .wizard-observation-card {
    text-align: left;
    padding: 10px 12px;
    background: var(--surface-100);
    border: 2px solid var(--surface-300);
    border-radius: 4px;
    cursor: pointer;
    transition:
        border-color 0.15s,
        background 0.15s;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.wizard-motor-obs .wizard-observation-card:hover {
    background: var(--surface-200);
}

.wizard-motor-obs .wizard-observation-card--selected {
    border-color: var(--primary-500);
    background: var(--primary-100);
}

.wizard-motor-obs .wizard-observation-card strong {
    font-size: 13px;
}

.wizard-motor-obs .wizard-observation-card span {
    font-size: 11px;
    color: var(--surface-700);
}

.wizard-cli-preview {
    background: var(--surface-100);
    border: 1px solid var(--surface-300);
    border-radius: 4px;
    padding: 10px 12px;
    font-family: monospace;
    font-size: 12px;
    margin: 10px 0;
    white-space: pre;
    overflow-x: auto;
}

.wizard-critical {
    background: var(--surface-100);
    border: 1px solid var(--primary-500);
    border-left-width: 4px;
    padding: 14px;
    text-align: center;
}

.wizard-critical strong {
    display: block;
    margin: 8px 0 4px 0;
}

.wizard-spinner {
    display: inline-block;
    width: 24px;
    height: 24px;
    border: 3px solid var(--surface-300);
    border-top-color: var(--primary-500);
    border-radius: 50%;
    animation: wizard-spin 0.8s linear infinite;
}

@keyframes wizard-spin {
    to {
        transform: rotate(360deg);
    }
}

.wizard-callout {
    background: var(--surface-100);
    border-left: 3px solid var(--primary-500);
    padding: 10px 12px;
    margin: 8px 0;
    font-size: 12px;
}

.wizard-callout strong {
    display: block;
    margin-bottom: 4px;
    color: var(--primary-700);
}

.wizard-callout--info {
    border-left-color: var(--primary-500);
}

.wizard-callout p {
    margin: 0;
}

.wizard-pads-summary {
    margin: 8px 0 12px 0;
}

.wizard-pads-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin: 6px 0;
}

.wizard-pads-table th,
.wizard-pads-table td {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--surface-200);
}

.wizard-pads-table th {
    background: var(--surface-100);
    font-weight: 600;
}

.wizard-pads-muted {
    color: var(--surface-600);
    font-size: 11px;
    font-style: italic;
}

.wizard-remap-from {
    color: var(--surface-700);
    text-decoration: line-through;
}

.wizard-remap-to {
    color: var(--primary-700);
    font-weight: 600;
}

.wizard-identity-progress {
    margin: 8px 0;
    font-size: 12px;
    color: var(--surface-700);
}

.wizard-identity-current {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    background: var(--surface-100);
    border: 1px solid var(--surface-300);
    border-radius: 4px;
    margin: 8px 0;
}

.wizard-identity-label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.wizard-identity-pad {
    font-family: "Consolas", monospace;
    font-size: 13px;
    font-weight: 600;
}

.wizard-identity-fn {
    font-size: 12px;
    color: var(--surface-700);
}

.wizard-dropdown-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 0;
}

.wizard-dropdown-label {
    font-size: 12px;
    color: var(--surface-800);
}

.wizard-dropdown {
    flex: 1;
    padding: 6px 8px;
    background: var(--surface-50);
    border: 1px solid var(--surface-400);
    border-radius: 3px;
    font-size: 13px;
    color: var(--surface-950);
}

.wizard-summary {
    list-style: none;
    padding: 0;
    margin: 8px 0;
}

.wizard-mode-toggle {
    display: flex;
    gap: 6px;
    margin: 8px 0 14px 0;
}

.wizard-joystick {
    display: flex;
    gap: 12px;
    align-items: center;
    margin: 12px 0;
}

.wizard-joystick-pad {
    position: relative;
    width: 120px;
    height: 120px;
    background: var(--surface-100);
    border: 2px solid var(--surface-400);
    border-radius: 50%;
    flex-shrink: 0;
}

.wizard-joystick-pad::before {
    content: "";
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--surface-400);
}

.wizard-joystick-pad::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--surface-400);
}

.wizard-joystick-thumb {
    position: absolute;
    width: 16px;
    height: 16px;
    background: var(--primary-500);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    transition:
        left 0.05s linear,
        top 0.05s linear;
}

.wizard-joystick-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: "Consolas", monospace;
    font-size: 12px;
    color: var(--surface-700);
}

.wizard-summary li {
    padding: 6px 0;
    border-bottom: 1px solid var(--surface-200);
    font-size: 12px;
}

.wizard-footer {
    display: flex;
    align-items: center;
    gap: 8px;
}

.wizard-footer-spacer {
    flex: 1;
}

.wizard-btn {
    padding: 6px 14px;
    font-size: 12px;
    border: 1px solid var(--surface-400);
    border-radius: 3px;
    background: var(--surface-100);
    color: var(--surface-900);
    cursor: pointer;
}

.wizard-btn:hover:not(:disabled) {
    background: var(--surface-200);
}

.wizard-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.wizard-btn--primary {
    background: var(--primary-500);
    border-color: var(--primary-500);
    color: var(--surface-50);
}

.wizard-btn--primary:hover:not(:disabled) {
    background: var(--primary-600);
    border-color: var(--primary-600);
}
</style>
