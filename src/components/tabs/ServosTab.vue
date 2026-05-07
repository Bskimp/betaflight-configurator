<template>
    <BaseTab tab-name="servos" :extra-class="isSupported ? 'supported' : ''">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabServos") }}</div>
            <WikiButton docUrl="servos" />
            <div class="grid-row">
                <!-- Servo configuration table (when supported) -->
                <div v-if="isSupported" class="require-support">
                    <div class="title">{{ $t("servosChangeDirection") }}</div>
                    <div class="table_overflow">
                        <table class="fields">
                            <thead>
                                <tr class="main">
                                    <th style="width: 110px">{{ $t("servosName") }}</th>
                                    <th>{{ $t("servosMin") }}</th>
                                    <th>{{ $t("servosMid") }}</th>
                                    <th>{{ $t("servosMax") }}</th>
                                    <th class="short">CH1</th>
                                    <th class="short">CH2</th>
                                    <th class="short">CH3</th>
                                    <th class="short">CH4</th>
                                    <th v-for="i in auxChannelCount" :key="i">A{{ i }}</th>
                                    <th style="width: 110px">{{ $t("servosRateAndDirection") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="(servo, index) in servoConfigs"
                                    :key="index"
                                    class="servo-config-row"
                                    :style="servoOutputAccentStyle(index)"
                                >
                                    <td class="servo-name-cell">
                                        <span class="servo-resource-label">
                                            <span class="servo-output-dot" :style="servoOutputDotStyle(index)"></span>
                                            Servo {{ index + 1 }}
                                        </span>
                                    </td>
                                    <td class="min">
                                        <UInputNumber
                                            :min="500"
                                            :max="2500"
                                            :step="1"
                                            v-model="servo.min"
                                            @change="onServoChange"
                                        />
                                    </td>
                                    <td class="middle">
                                        <UInputNumber
                                            :min="500"
                                            :max="2500"
                                            :step="1"
                                            v-model="servo.middle"
                                            @change="onServoChange"
                                        />
                                    </td>
                                    <td class="max">
                                        <UInputNumber
                                            :min="500"
                                            :max="2500"
                                            :step="1"
                                            v-model="servo.max"
                                            @change="onServoChange"
                                        />
                                    </td>
                                    <td v-for="ch in totalChannels" :key="ch" class="channel">
                                        <input
                                            type="checkbox"
                                            :checked="servo.indexOfChannelToForward === ch - 1"
                                            @change="setChannelForward(index, ch - 1, $event)"
                                        />
                                    </td>
                                    <td class="direction">
                                        <select class="rate" v-model.number="servo.rate" @change="onServoChange">
                                            <option v-for="rate in rateOptions" :key="rate" :value="rate">
                                                {{ $t("servosRate") }} {{ rate }}%
                                            </option>
                                        </select>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Upgrade required message -->
                <div v-else class="note require-upgrade">
                    <p>{{ $t("servosFirmwareUpgradeRequired") }}</p>
                </div>
            </div>

            <div class="spacer"></div>

            <!-- Servo visualization bars and resource assignments -->
            <div class="grid-row grid-box col2 max-[1055px]:!grid-cols-1" v-if="isSupported">
                <div class="col-span-1">
                    <div class="gui_box grey servoblock">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("servosText") }}</div>
                        </div>
                        <div class="spacer_box">
                            <div class="servos">
                                <ul class="titles">
                                    <li
                                        v-for="i in 8"
                                        :key="i"
                                        class="servo-output-title"
                                        :style="servoOutputAccentStyle(i - 1)"
                                        :title="$t(`servoNumber${i}`)"
                                    >
                                        {{ i }}
                                    </li>
                                </ul>
                                <div class="bar-wrapper">
                                    <div
                                        v-for="i in 8"
                                        :key="i"
                                        :class="`m-block servo-${i - 1}`"
                                        :style="servoOutputAccentStyle(i - 1)"
                                    >
                                        <div class="meter-bar">
                                            <div class="indicator" :style="getBarStyle(servoData[i - 1] || 1500)">
                                                <div class="label"></div>
                                            </div>
                                            <div class="label">{{ servoData[i - 1] || 1500 }}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="clear-both"></div>
                            <div class="live resource-live">
                                <input type="checkbox" class="togglemedium" v-model="liveMode" />
                                <span>{{ $t("servosLiveMode") }}</span>
                            </div>
                        </div>
                    </div>
                    <ServoFunctionMapper
                        :rules="servoMixRules"
                        :output-options="servoMixOutputOptions"
                        :input-labels="servoMixInputLabels"
                        :box-labels="servoMixBoxLabels"
                        :quick-add-templates="servoMixTemplates"
                        :max-rules="maxServoRules"
                        :mixer-mode="mixerMode"
                        :loading="saving"
                        :title="$t('servosMixerRulesTitle')"
                        :description="$t('servosMixerRulesDesc')"
                        :output-label="$t('servosMixerOutput')"
                        :input-label="$t('servosMixerInput')"
                        :rate-label="$t('servosMixerRate')"
                        :speed-label="$t('servosMixerSpeed')"
                        :min-label="$t('servosMixerMin')"
                        :max-label="$t('servosMixerMax')"
                        :box-label="$t('servosMixerBox')"
                        :box-help="$t('servosMixerBoxHelp')"
                        :delete-title="$t('servosMixerDeleteRule')"
                        :no-rules-text="$t('servosMixerNoRules')"
                        :quick-add-label="$t('servosMixerQuickAddLabel')"
                        :quick-add-hint="$t('servosMixerQuickAddHint')"
                        @add-template="addServoMixTemplate"
                        @remove-rule="removeServoMixRule"
                    />
                </div>

                <div class="col-span-1">
                    <div class="gui_box grey resource-block">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("servosResourceAssignments") }}</div>
                        </div>
                        <div class="spacer_box">
                            <div class="note" v-if="!hasResourceData">
                                <p>{{ $t("servosResourceNotAvailable") }}</p>
                            </div>
                            <template v-else>
                                <p class="resource-status" v-if="smartResourceLoading">
                                    {{ $t("servosResourceSmartLoading") }}
                                </p>
                                <p class="resource-status hw_muted" v-else-if="smartResourceAnalysis">
                                    {{ $t("servosResourceSmartReady") }}
                                </p>
                                <p class="resource-status hw_muted" v-else-if="smartResourceError">
                                    {{ $t("servosResourceSmartUnavailable") }}
                                </p>
                                <div class="resource-grid">
                                    <div class="resource-section">
                                        <h4>{{ $t("servosMotorResources") }}</h4>
                                        <table class="resource-table">
                                            <thead>
                                                <tr>
                                                    <th>{{ $t("servosResourceIndex") }}</th>
                                                    <th>{{ $t("servosResourcePin") }}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr v-for="motor in motorResources" :key="motor.index">
                                                    <td>{{ $t("servosResourceMotorLabel") }} {{ motor.index + 1 }}</td>
                                                    <td>
                                                        <select
                                                            class="resource-select"
                                                            :value="motor.pin"
                                                            @change="onMotorPinChange(motor.index, $event)"
                                                        >
                                                            <option value="NONE">NONE</option>
                                                            <option
                                                                v-for="option in resourcePinOptions('motor', motor)"
                                                                :key="option.value"
                                                                :value="option.value"
                                                            >
                                                                {{ option.label }}
                                                            </option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div class="resource-section">
                                        <h4>{{ $t("servosServoResources") }}</h4>
                                        <table class="resource-table">
                                            <thead>
                                                <tr>
                                                    <th>{{ $t("servosResourceIndex") }}</th>
                                                    <th>{{ $t("servosResourcePin") }}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr
                                                    v-for="servo in servoResources"
                                                    :key="servo.index"
                                                    class="servo-resource-row"
                                                    :class="{
                                                        'servo-resource-row--inactive': resourceSlotInactive(
                                                            servo.index,
                                                        ),
                                                    }"
                                                    :style="resourceAccentStyle(servo.index)"
                                                >
                                                    <td>
                                                        <span class="servo-resource-label">
                                                            <span
                                                                class="servo-output-dot"
                                                                :style="resourceDotStyle(servo.index)"
                                                            ></span>
                                                            {{ $t("servosResourceServoLabel") }} {{ servo.index + 1 }}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <select
                                                            class="resource-select"
                                                            :value="servo.pin"
                                                            @change="onServoPinChange(servo.index, $event)"
                                                        >
                                                            <option value="NONE">NONE</option>
                                                            <option
                                                                v-for="option in resourcePinOptions('servo', servo)"
                                                                :key="option.value"
                                                                :value="option.value"
                                                            >
                                                                {{ option.label }}
                                                            </option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div class="note">
                                    <p>{{ $t("servosResourceEditHint") }}</p>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Save button toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom" v-if="isSupported">
            <div class="btn save_btn">
                <button type="button" class="save" @click="saveServoConfig">{{ $t("servosButtonSave") }}</button>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, ref, reactive, computed, onMounted } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { gui_log } from "../../js/gui_log";
import { i18n } from "../../js/localization";
import WikiButton from "../elements/WikiButton.vue";
import ServoFunctionMapper from "../servos/ServoFunctionMapper.vue";
import { useInterval } from "../../composables/useInterval";
import { useTimeout } from "../../composables/useTimeout";
import {
    discoverPadTimerOptions,
    parseDmaShow,
    parseResourceShow,
    parseTimerDump,
    parseTimerShow,
    readCli,
} from "../../js/utils/cliOneShot";
import { analyzeResources } from "../../js/utils/resourceAnalyzer";
import { mcuFamilyFromName } from "../../js/utils/mcuFamily";
import {
    RESOURCE_NONE,
    parseResourceOptionValue,
    resourceOptions,
    stableResourcePins,
} from "../../js/utils/motorServoResourceCandidates";
import {
    AIRCRAFT_SERVO_MIX_TEMPLATES,
    MAX_SERVO_RULES,
    SERVO_MIX_BOX_LABELS,
    SERVO_MIX_INPUT_LABELS,
    cloneServoMixRules,
    padServoMixRulesToMax,
    pwmSlotToServoIndex,
    servoMixTargetOptions,
    servoOutputAccentStyle as buildServoOutputAccentStyle,
    servoOutputColor as buildServoOutputColor,
} from "../../js/utils/servoMixerModel";

const INACTIVE_ACCENT_STYLE = {
    "--servo-output-accent": "var(--surface-500)",
    "--servo-output-accent-bg": "transparent",
};
const INACTIVE_DOT_STYLE = { backgroundColor: "var(--surface-500)" };

// For the Resource Assignments table: PWM-slot index N from the firmware
// drives a logical servoIndex_e per the active mixer (see firmware
// writeServos() switch). Color the row by that logical index so the dot
// matches the live bar / smix-mapper color of the servo it actually drives.
function computeResourceAccentStyle(slotIndex, mixerMode) {
    const idx = pwmSlotToServoIndex(slotIndex, mixerMode);
    if (idx === null) return INACTIVE_ACCENT_STYLE;
    return buildServoOutputAccentStyle(idx);
}

function computeResourceDotStyle(slotIndex, mixerMode) {
    const idx = pwmSlotToServoIndex(slotIndex, mixerMode);
    if (idx === null) return INACTIVE_DOT_STYLE;
    return { backgroundColor: buildServoOutputColor(idx) };
}

function isResourceSlotInactive(slotIndex, mixerMode) {
    return pwmSlotToServoIndex(slotIndex, mixerMode) === null;
}

// Calculate bar style for servo visualization
function getBarStyle(value) {
    const rangeMin = 1000;
    const rangeMax = 2000;
    const blockHeight = 100;
    const fullBlockScale = rangeMax - rangeMin;
    const barHeight = value - rangeMin;
    const clamped = Math.min(Math.max(barHeight * (blockHeight / fullBlockScale), 0), blockHeight);
    const marginTop = blockHeight - clamped;
    const height = clamped;

    const alpha = Math.min(Math.max(barHeight / fullBlockScale, 0), 1).toFixed(2);

    return {
        marginTop: `${marginTop}px`,
        height: `${height}px`,
        backgroundColor: `rgba(255,187,0,${alpha})`,
    };
}

export default defineComponent({
    name: "ServosTab",
    components: {
        BaseTab,
        WikiButton,
        ServoFunctionMapper,
    },
    setup() {
        const isSupported = ref(false);
        const liveMode = ref(false);
        const saving = ref(false);
        const servoConfigs = reactive([]);
        const servoData = reactive([]);
        const servoMixRules = reactive([]);
        const motorResources = reactive([]);
        const servoResources = reactive([]);
        const initialResourcePins = ref([]);
        const hasResourceData = ref(false);
        const smartResourceAnalysis = ref(null);
        const smartResourceLoading = ref(false);
        const smartResourceError = ref(null);
        const mixerMode = ref(0);

        const { addInterval } = useInterval();
        const { addTimeout } = useTimeout();

        // Calculate aux channels from RC active channels
        const totalChannels = computed(() => FC.RC?.active_channels || 8);
        const auxChannelCount = computed(() => Math.max(0, totalChannels.value - 4));
        const servoMixOutputOptions = computed(() => servoMixTargetOptions(mixerMode.value));
        const availablePins = computed(() =>
            stableResourcePins(motorResources, servoResources, initialResourcePins.value),
        );
        // Generate rate options from 100 to -100
        const rateOptions = [];
        for (let i = 100; i > -101; i--) {
            rateOptions.push(i);
        }

        function servoOutputAccentStyle(outputIndex) {
            return buildServoOutputAccentStyle(outputIndex);
        }

        function servoOutputDotStyle(outputIndex) {
            return { backgroundColor: buildServoOutputColor(outputIndex) };
        }

        function resourceAccentStyle(slotIndex) {
            return computeResourceAccentStyle(slotIndex, mixerMode.value);
        }

        function resourceDotStyle(slotIndex) {
            return computeResourceDotStyle(slotIndex, mixerMode.value);
        }

        function resourceSlotInactive(slotIndex) {
            return isResourceSlotInactive(slotIndex, mixerMode.value);
        }

        // Handle channel forward checkbox (only one per servo)
        function setChannelForward(servoIndex, channelIndex, event) {
            if (event.target.checked) {
                servoConfigs[servoIndex].indexOfChannelToForward = channelIndex;
            } else {
                servoConfigs[servoIndex].indexOfChannelToForward = -1;
            }
            onServoChange();
        }

        // Called when any servo setting changes
        function onServoChange() {
            if (liveMode.value) {
                // Apply changes to FC in live mode
                addTimeout("servos_update", () => updateServos(false), 10);
            }
        }

        function syncServoConfigsToFc() {
            const SERVO_MIN = 500;
            const SERVO_MAX = 2500;

            // Copy local state to FC with clamping and keep Vue state in sync
            for (let i = 0; i < servoConfigs.length; i++) {
                const src = servoConfigs[i];
                const cfg = FC.SERVO_CONFIG[i];

                const min = Math.min(Math.max(src.min ?? SERVO_MIN, SERVO_MIN), SERVO_MAX);
                const middle = Math.min(Math.max(src.middle ?? SERVO_MIN, SERVO_MIN), SERVO_MAX);
                const max = Math.min(Math.max(src.max ?? SERVO_MAX, SERVO_MIN), SERVO_MAX);

                cfg.min = min;
                cfg.middle = middle;
                cfg.max = max;
                cfg.rate = src.rate;
                cfg.indexOfChannelToForward = src.indexOfChannelToForward ?? -1;

                // reflect any clamping back into the reactive model
                src.min = min;
                src.middle = middle;
                src.max = max;
            }
        }

        function sendServoConfigurationsToFc() {
            return new Promise((resolve, reject) => {
                try {
                    mspHelper.sendServoConfigurations(resolve);
                } catch (err) {
                    reject(err);
                }
            });
        }

        function sendServoMixRulesToFc() {
            return new Promise((resolve, reject) => {
                try {
                    mspHelper.sendServoMixRules(resolve);
                } catch (err) {
                    reject(err);
                }
            });
        }

        // Update FC.SERVO_CONFIG from local state and send to FC
        function updateServos(saveToEeprom) {
            syncServoConfigsToFc();

            mspHelper.sendServoConfigurations(() => {
                if (saveToEeprom) {
                    mspHelper.writeConfiguration(false, () => {
                        gui_log(i18n.getMessage("servosEepromSave"));
                    });
                }
            });
        }

        // Save button handler
        async function saveServoConfig() {
            if (saving.value) return;

            saving.value = true;
            try {
                syncServoConfigsToFc();

                const nextMixerMode = mixerMode.value || FC.MIXER_CONFIG?.mixer;
                if (nextMixerMode && FC.MIXER_CONFIG?.mixer !== nextMixerMode) {
                    FC.MIXER_CONFIG.mixer = nextMixerMode;
                    await MSP.promise(MSPCodes.MSP_SET_MIXER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MIXER_CONFIG));
                }

                await sendServoConfigurationsToFc();

                FC.SERVO_RULES = padServoMixRulesToMax(servoMixRules);
                await sendServoMixRulesToFc();

                await new Promise((resolve) => {
                    mspHelper.writeConfiguration(false, () => {
                        gui_log(i18n.getMessage("servosEepromSave"));
                        resolve();
                    });
                });
            } catch (e) {
                console.error("Failed to save servo configuration", e);
                gui_log(i18n.getMessage("servosMixerSaveFailed"));
            } finally {
                saving.value = false;
            }
        }

        function addServoMixTemplate(templateId) {
            const template = AIRCRAFT_SERVO_MIX_TEMPLATES.find((item) => item.id === templateId);
            if (!template || servoMixRules.length + template.rules.length > MAX_SERVO_RULES) return;

            if (template.mixerMode) {
                mixerMode.value = template.mixerMode;
            }

            for (const rule of template.rules) {
                servoMixRules.push({ ...rule });
            }
        }

        function removeServoMixRule(index) {
            servoMixRules.splice(index, 1);
        }

        function resourcePinOptions(kind, resource) {
            return resourceOptions({
                kind,
                resource,
                motorResources,
                servoResources,
                hardwareAnalysis: smartResourceAnalysis.value,
                fallbackPins: availablePins.value,
                allowLedStrip: true,
            });
        }

        function syncResourceState(resourceType, resources, index, pin, ioTag) {
            const resource = resources.find((item) => item.index === index);
            if (resource) {
                resource.pin = pin;
                resource.ioTag = ioTag;
            }

            const fcResources = resourceType === 0 ? FC.MOTOR_RESOURCES : FC.SERVO_RESOURCES;
            const fcResource = fcResources?.find?.((item) => item.index === index);
            if (fcResource) {
                fcResource.pin = pin;
                fcResource.ioTag = ioTag;
            }
            initialResourcePins.value = stableResourcePins(motorResources, servoResources, initialResourcePins.value);
        }

        async function onResourcePinChange(resourceType, resources, index, event) {
            const resource = resources.find((item) => item.index === index);
            if (!resource) return;

            const previousPin = resource.pin || RESOURCE_NONE;
            const rawValue = event.target.value || RESOURCE_NONE;
            // Option values are encoded `pin` (default AF) or `pin@AFn`
            // (alternate AF). When AF is set we run the `timer <pin> AF n`
            // CLI command before the MSP resource bind so the FC switches
            // the pad to the chosen alternate timer/channel.
            const { pin: newPin, af: altAf } = parseResourceOptionValue(rawValue);
            const ioTag = newPin === RESOURCE_NONE ? 0 : mspHelper.pinToIoTag(newPin);
            if (newPin !== RESOURCE_NONE && ioTag === 0) {
                event.target.value = previousPin;
                gui_log(i18n.getMessage("servosResourceSetFailed"));
                return;
            }

            const labelKey = resourceType === 0 ? "servosResourceMotorLabel" : "servosResourceServoLabel";

            if (altAf != null && newPin !== RESOURCE_NONE) {
                try {
                    await readCli(`timer ${newPin} AF ${altAf}`);
                } catch (e) {
                    console.error("Failed to set alternate AF", e);
                    event.target.value = previousPin;
                    gui_log(i18n.getMessage("servosResourceSetFailed"));
                    return;
                }
            }

            mspHelper.setMotorServoResource(resourceType, index, ioTag, (response) => {
                if (response?.crcError || response?.unsupported) {
                    event.target.value = previousPin;
                    gui_log(i18n.getMessage("servosResourceSetFailed"));
                    return;
                }
                syncResourceState(resourceType, resources, index, newPin, ioTag);
                gui_log(
                    i18n.getMessage("servosResourceSetOk", {
                        resource: i18n.getMessage(labelKey),
                        index: index + 1,
                        pin: newPin,
                    }),
                );
            });
        }

        function onMotorPinChange(index, event) {
            onResourcePinChange(0, motorResources, index, event);
        }

        function onServoPinChange(index, event) {
            onResourcePinChange(1, servoResources, index, event);
        }

        // Pull servo data for visualization
        function getServoData() {
            MSP.send_message(MSPCodes.MSP_SERVO, false, false, () => {
                for (let i = 0; i < FC.SERVO_DATA.length; i++) {
                    servoData[i] = FC.SERVO_DATA[i];
                }
            });
        }

        // Load all servo data from FC
        async function loadServoData() {
            // Check if we're actually connected to a FC
            if (!FC.CONFIG?.apiVersion) {
                isSupported.value = false;
                GUI.content_ready();
                return;
            }

            try {
                await MSP.promise(MSPCodes.MSP_SERVO_CONFIGURATIONS);
                await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
                // Set mixerMode immediately so resource-panel first paint
                // already knows which mixer is active (slot→servoIndex_e map).
                mixerMode.value = FC.MIXER_CONFIG?.mixer || 0;
                await MSP.promise(MSPCodes.MSP_SERVO_MIX_RULES);
                await MSP.promise(MSPCodes.MSP_RC);
                await MSP.promise(MSPCodes.MSP_BOXNAMES);

                try {
                    await MSP.promise(MSPCodes.MSP2_MOTOR_SERVO_RESOURCE);
                    loadResourceData();
                } catch {
                    hasResourceData.value = false;
                }

                initializeUI();
                loadSmartResourceAnalysis();
            } catch (e) {
                console.error("Failed to load servo configs", e);
                isSupported.value = false;
                GUI.content_ready(); // Ensure tab doesn't hang
            }
        }

        function loadResourceData() {
            motorResources.length = 0;
            servoResources.length = 0;

            for (const resource of FC.MOTOR_RESOURCES ?? []) {
                motorResources.push({ ...resource });
            }
            for (const resource of FC.SERVO_RESOURCES ?? []) {
                servoResources.push({ ...resource });
            }

            initialResourcePins.value = stableResourcePins(motorResources, servoResources);
            hasResourceData.value = motorResources.length > 0 || servoResources.length > 0;
        }

        async function loadSmartResourceAnalysis() {
            if (!hasResourceData.value || smartResourceLoading.value) return;

            smartResourceLoading.value = true;
            smartResourceError.value = null;
            try {
                const resourceShow = await readCli("resource show");
                const timerShow = await readCli("timer show");
                const dmaShow = await readCli("dma show");
                const timerDump = await readCli("timer");

                const analysis = analyzeResources({
                    resourceShow: parseResourceShow(resourceShow.lines),
                    timerShow: parseTimerShow(timerShow.lines),
                    dmaShow: parseDmaShow(dmaShow.lines),
                    timerDump: parseTimerDump(timerDump.lines),
                    serialPorts: FC.SERIAL_CONFIG?.ports || [],
                    mcuFamily: mcuFamilyFromName(FC.MCU_INFO?.name),
                });
                smartResourceAnalysis.value = analysis;

                // Per-pad alternate-AF discovery. Loops `timer <pad>` for
                // every PWM-capable pad on the board (~100ms each, pool is
                // typically <=12 so ~1s total). Result feeds the candidate
                // dropdown so pilots can park a pad on a non-default timer
                // without dropping to CLI. Skipped silently on firmware that
                // doesn't expose `timer <pad>`.
                const altAfPool = analysis.padTimers instanceof Map ? [...analysis.padTimers.keys()] : [];
                if (altAfPool.length > 0) {
                    try {
                        const padTimerOptions = await discoverPadTimerOptions(altAfPool);
                        smartResourceAnalysis.value = { ...analysis, padTimerOptions };
                    } catch (afErr) {
                        console.warn("Servos: alt-AF discovery failed", afErr);
                        // Fall through with analysis already set; alt-AF
                        // dropdown entries simply won't appear.
                    }
                }
            } catch (e) {
                smartResourceAnalysis.value = null;
                smartResourceError.value = e.message || String(e);
            } finally {
                smartResourceLoading.value = false;
            }
        }

        // Initialize UI after data is loaded
        function initializeUI() {
            // Check if servo configuration is available
            if (!FC.SERVO_CONFIG || FC.SERVO_CONFIG.length === 0) {
                isSupported.value = false;
                GUI.content_ready();
                return;
            }

            isSupported.value = true;
            mixerMode.value = FC.MIXER_CONFIG?.mixer || 0;

            // Clear and populate reactive servoConfigs array
            servoConfigs.length = 0;
            for (let i = 0; i < 8; i++) {
                if (FC.SERVO_CONFIG[i]) {
                    servoConfigs.push({
                        min: FC.SERVO_CONFIG[i].min,
                        middle: FC.SERVO_CONFIG[i].middle,
                        max: FC.SERVO_CONFIG[i].max,
                        rate: FC.SERVO_CONFIG[i].rate,
                        indexOfChannelToForward: FC.SERVO_CONFIG[i].indexOfChannelToForward,
                    });
                }
            }

            servoMixRules.length = 0;
            for (const rule of cloneServoMixRules(FC.SERVO_RULES)) {
                servoMixRules.push(rule);
            }

            // Start servo data polling for visualization
            addInterval("servo_data_pull", getServoData, 50);

            // Status polling
            addInterval("status_pull", () => MSP.send_message(MSPCodes.MSP_STATUS), 250, true);

            GUI.content_ready();
        }

        onMounted(() => {
            loadServoData();
        });

        // Interval/timeout cleanup handled automatically by composables on unmount

        return {
            isSupported,
            liveMode,
            saving,
            servoConfigs,
            servoData,
            servoMixRules,
            servoMixInputLabels: SERVO_MIX_INPUT_LABELS,
            servoMixBoxLabels: SERVO_MIX_BOX_LABELS,
            servoMixTemplates: AIRCRAFT_SERVO_MIX_TEMPLATES,
            servoMixOutputOptions,
            maxServoRules: MAX_SERVO_RULES,
            mixerMode,
            motorResources,
            servoResources,
            hasResourceData,
            smartResourceAnalysis,
            smartResourceLoading,
            smartResourceError,
            resourcePinOptions,
            totalChannels,
            auxChannelCount,
            rateOptions,
            getBarStyle,
            servoOutputAccentStyle,
            servoOutputDotStyle,
            resourceAccentStyle,
            resourceDotStyle,
            resourceSlotInactive,
            setChannelForward,
            onServoChange,
            addServoMixTemplate,
            removeServoMixRule,
            onMotorPinChange,
            onServoPinChange,
            saveServoConfig,
        };
    },
});
</script>

<style lang="less">
.bar-wrapper {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
}

.tab-servos {
    height: 100%;

    .title {
        margin-top: 0;
        line-height: 30px;
        text-align: center;
        font-weight: bold;
        border: 1px solid var(--surface-500);
        border-bottom: 0;
        background-color: var(--surface-300);
        color: var(--text);
        border-top-right-radius: 5px;
        border-top-left-radius: 5px;
    }
    table {
        margin-bottom: 10px;
        width: 100%;
        border-collapse: collapse;
        border-left: 0;
        border-right: 0;
        border-top: 0;
        th {
            border-left: 0;
            border-right: 0;
            border-top: 0;
            padding-top: 3px;
            padding-bottom: 3px;
            text-align: center;
            border: 1px solid var(--surface-500);
            line-height: 14px;
        }
        td {
            border-top: 0;
            border-bottom: 1px solid var(--surface-500);
            border-left: 1px solid var(--surface-500);
            border-right: 1px solid var(--surface-500);
            padding: 6px 5px 7px 5px;
            &:nth-child(2) {
                width: 140px;
            }
            &:nth-child(3) {
                width: 140px;
            }
            &:nth-child(4) {
                width: 140px;
            }
            &:nth-child(19) {
                width: 110px;
            }
        }
        tr {
            &:nth-child(even) {
                background-color: var(--surface-200);
            }
            td {
                &:first-child {
                    text-align: left;
                    width: 55px;
                }
            }
        }
        .main {
            font-weight: bold;
            text-align: center;
            background-color: var(--surface-400);
        }
        .channel {
            width: 40px;
            text-align: center;
            input {
                vertical-align: middle;
            }
        }
        input {
            border: 1px solid var(--surface-500);
            border-radius: 3px;
        }
        select {
            border: 1px solid var(--surface-500);
            border-radius: 3px;
        }
        :deep(input:not([type="checkbox"])) {
            display: block;
            width: 100%;
            height: 20px;
            line-height: 20px;
            text-align: right;
        }
        input[type="checkbox"] {
            width: 16px;
            height: 16px;
        }
    }
    .directions {
        .direction {
            select {
                height: 19px;
                line-height: 19px;
            }
        }
    }
    .direction {
        .name {
            float: left;
            display: block;
            width: 60px;
        }
        .alternate {
            float: left;
            display: block;
            width: 60px;
        }
        .first {
            float: left;
            margin: 2px 10px 0 20px;
        }
        .second {
            float: left;
            margin: 2px 10px 0 0;
        }
        .rate {
            width: 110px;
            text-align: center;
        }
    }
    .live {
        float: left;
        margin-top: 0;
        span {
            float: left;
            margin-right: 10px;
        }
        input {
            float: left;
            margin: 0 0 0 5px;
        }
    }
    .buttons {
        width: calc(100% - 20px);
        position: absolute;
        bottom: 10px;
    }
    .require-support {
        display: none;
    }
    .require-upgrade {
        display: block;
    }
    .wide {
        width: 120px;
    }
    .short {
        width: 40px;
    }
    .table_overflow {
        overflow: auto;
    }
    position: relative;
    .spacer_box {
        padding-bottom: 10px;
        float: left;
        width: calc(100% - 20px);
    }
    .gui_box_titlebar {
        margin-bottom: 0;
    }
    .gui_box {
        margin-bottom: 10px;
        font-weight: bold;
        span {
            font-style: normal;
            font-weight: normal;
            line-height: 19px;
            color: var(--text);
            font-size: 11px;
        }
    }
    .spacer {
        width: calc(100% - 34px);
        margin: 10px;
    }
    .servoblock {
        margin-bottom: 24px;
        background-color: var(--surface-400);
    }
    .resource-block {
        min-height: 178px;
    }
    .resource-live {
        float: none;
        margin-top: 15px;
        padding-top: 10px;
        border-top: 1px solid var(--surface-400);
    }
    .hw_muted {
        color: var(--text-muted, #888);
    }
    .resource-status {
        margin: 0 0 10px 0;
        font-weight: normal;
    }
    .resource-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        margin-bottom: 15px;
    }
    .resource-section {
        flex: 1;
        min-width: 200px;
        h4 {
            margin: 0 0 10px 0;
            font-size: 13px;
            font-weight: bold;
        }
    }
    .servo-resource-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
    }
    .servo-output-dot {
        flex: 0 0 auto;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background-color: var(--servo-output-accent);
        box-shadow: 0 0 0 2px var(--servo-output-accent-bg);
    }
    .servo-config-row {
        border-left: 4px solid var(--servo-output-accent);
        background-image: linear-gradient(90deg, var(--servo-output-accent-bg), transparent 32px);
        .servo-name-cell {
            text-align: left;
            padding-left: 10px;
        }
    }
    .resource-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        th,
        td {
            border: 1px solid var(--surface-500);
            padding: 4px 8px;
            text-align: center;
        }
        th {
            background-color: var(--surface-400);
            font-weight: bold;
        }
        tr:nth-child(even) {
            background-color: var(--surface-200);
        }
        .servo-resource-row {
            border-left: 4px solid var(--servo-output-accent);
            background-image: linear-gradient(90deg, var(--servo-output-accent-bg), transparent 24px);

            .resource-select {
                border-color: var(--servo-output-accent);
                box-shadow: inset 3px 0 0 var(--servo-output-accent);
            }
        }
        .servo-resource-row--inactive {
            opacity: 0.55;
            .resource-select {
                box-shadow: none;
            }
        }
    }
    .resource-select {
        width: 100%;
        padding: 2px 4px;
        font-size: 12px;
        border: 1px solid var(--surface-500);
        border-radius: 3px;
        background-color: var(--surface-100);
        cursor: pointer;
    }
    .title2 {
        padding-bottom: 2px;
        text-align: center;
        font-size: 12px;
        font-weight: 300;
    }
    .titles {
        display: grid;
        grid-template-columns: repeat(8, minmax(0, 1fr));
        gap: 10px;
        height: 20px;
        margin: 0;
        padding: 0;
        list-style: none;
        li {
            float: none;
            width: auto;
            margin-right: 0;
            text-align: center;
        }
        .servo-output-title {
            border-bottom: 3px solid var(--servo-output-accent);
        }
        .active {
            color: green;
        }
    }
    .servos {
        .titles {
            li {
                float: none;
                width: auto;
                margin-right: 0;
            }
        }
        .m-block {
            float: none;
            width: auto;
            min-width: 0;
            margin-right: 0;
            border-radius: 3px;
            box-shadow: inset 0 -3px 0 var(--servo-output-accent);
        }
    }
    .m-block {
        float: left;
        width: calc((100% / 9) - 10px);
        height: 100px;
        margin-right: 10px;
        text-align: center;
        background-color: var(--surface-300);
        border-radius: 3px;
        box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.2);
        .meter-bar {
            position: relative;
            width: 100%;
            height: 100px;
            box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.2);
            background-color: var(--surface-300);
            border-radius: 3px;
            border: 1px solid var(--surface-500);
        }
        .label {
            position: absolute;
            width: 100%;
            bottom: 45px;
            text-align: center;
            font-weight: bold;
            font-size: 10px;
            color: var(--surface-950);
        }
        .label.rpm_info {
            bottom: 28px;
        }
        .indicator {
            .label {
                color: white;
            }
        }
    }
    .indicator {
        position: absolute;
        overflow: hidden;
        width: 100%;
        text-align: center;
        border-radius: 2px;
    }
}
.tab-servos.supported {
    .require-support {
        display: block;
        overflow-x: auto;
    }
    .require-upgrade {
        display: none;
    }
}
@media all and (max-width: 575px) {
    .tab-servos {
        table {
            th {
                min-width: 30px;
            }
        }
        .min {
            min-width: 60px;
        }
        .max {
            min-width: 60px;
        }
        .middle {
            min-width: 60px;
        }
        .gui_box {
            min-height: auto;
        }
        .left.motors {
            width: 100%;
            order: 1;
        }
        .right.servos {
            width: 100%;
            order: 3;
            margin-top: 15px;
        }
        .titles {
            li {
                width: calc((100% - 80px) / 9);
                &:last-child {
                    margin-right: 0;
                }
            }
        }
        .servos {
            .titles {
                li {
                    width: auto;
                }
            }
        }
        .m-block {
            width: calc((100% - 80px) / 9);
        }
        .servos {
            .m-block {
                width: auto;
            }
        }
        .servo_testing {
            .values {
                li {
                    &:last-child {
                        margin-left: 4px;
                    }
                }
            }
        }
    }
}
@media only screen and (max-width: 1055px) {
    .tab-servos {
        .gui_box {
            span {
                line-height: 17px;
            }
        }
    }
}
@media only screen and (max-device-width: 1055px) {
    .tab-servos {
        .gui_box {
            span {
                line-height: 17px;
            }
        }
    }
}
</style>
