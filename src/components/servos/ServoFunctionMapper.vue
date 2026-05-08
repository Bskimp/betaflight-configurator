<template>
    <div class="gui_box servo-function-mapper">
        <div class="gui_box_titlebar">
            <div class="spacer_box_title">{{ title }}</div>
        </div>
        <div class="spacer">
            <p v-if="description">{{ description }}</p>

            <div class="table_overflow">
                <table class="fields servo-mixer-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>{{ outputLabel }}</th>
                            <th>{{ inputLabel }}</th>
                            <th>{{ rateLabel }}</th>
                            <th>{{ speedLabel }}</th>
                            <th>{{ minLabel }}</th>
                            <th>{{ maxLabel }}</th>
                            <th :title="boxHelp">{{ boxLabel }}</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(rule, idx) in rules"
                            :key="idx"
                            class="servo-mixer-row"
                            :style="ruleAccentStyle(rule)"
                        >
                            <td>{{ idx + 1 }}</td>
                            <td class="output-cell">
                                <span class="servo-output-dot" :style="ruleAccentStyle(rule)"></span>
                                <select v-model.number="rule.target" :disabled="loading">
                                    <option
                                        v-for="opt in outputOptionsForRule(rule)"
                                        :key="opt.value"
                                        :value="opt.value"
                                    >
                                        {{ opt.label }}
                                    </option>
                                </select>
                            </td>
                            <td>
                                <select v-model.number="rule.input" :disabled="loading">
                                    <option v-for="(lbl, i) in inputLabels" :key="i" :value="i">
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
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    min="0"
                                    max="255"
                                    v-model.number="rule.speed"
                                    :disabled="loading"
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    :min="-100"
                                    :max="100"
                                    v-model.number="rule.min"
                                    :disabled="loading"
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    :min="-100"
                                    :max="100"
                                    v-model.number="rule.max"
                                    :disabled="loading"
                                />
                            </td>
                            <td>
                                <select v-model.number="rule.box" :disabled="loading">
                                    <option v-for="(lbl, i) in boxLabels" :key="i" :value="i">
                                        {{ lbl }}
                                    </option>
                                </select>
                            </td>
                            <td>
                                <button
                                    type="button"
                                    class="rule_delete"
                                    :disabled="loading"
                                    :title="deleteTitle"
                                    @click="$emit('remove-rule', idx)"
                                >
                                    x
                                </button>
                            </td>
                        </tr>
                        <tr v-if="rules.length === 0">
                            <td colspan="9" class="empty_row">
                                {{ noRulesText }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="rule_actions">
                <button
                    v-for="tpl in quickAddTemplates"
                    :key="tpl.id"
                    type="button"
                    class="quick_add_button"
                    :disabled="!canAddTemplate(tpl)"
                    :title="$t(tpl.labelKey)"
                    @click="$emit('add-template', tpl.id)"
                >
                    + {{ $t(tpl.labelKey) }}
                </button>
                <span class="rule_count">{{ rules.length }} / {{ maxRules }}</span>
            </div>
            <p v-if="quickAddHint" class="quick_add_hint">{{ quickAddHint }}</p>
        </div>
    </div>
</template>

<script>
import { defineComponent } from "vue";
import {
    servoMixOutputIndexForTarget,
    servoMixOutputLabel,
    servoOutputAccentStyle,
} from "../../js/utils/servoMixerModel";

export default defineComponent({
    name: "ServoFunctionMapper",
    props: {
        rules: {
            type: Array,
            required: true,
        },
        outputOptions: {
            type: Array,
            required: true,
        },
        inputLabels: {
            type: Array,
            required: true,
        },
        boxLabels: {
            type: Array,
            required: true,
        },
        quickAddTemplates: {
            type: Array,
            default: () => [],
        },
        maxRules: {
            type: Number,
            required: true,
        },
        mixerMode: {
            type: Number,
            default: 0,
        },
        loading: {
            type: Boolean,
            default: false,
        },
        title: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            default: "",
        },
        outputLabel: {
            type: String,
            required: true,
        },
        inputLabel: {
            type: String,
            required: true,
        },
        rateLabel: {
            type: String,
            required: true,
        },
        speedLabel: {
            type: String,
            required: true,
        },
        minLabel: {
            type: String,
            required: true,
        },
        maxLabel: {
            type: String,
            required: true,
        },
        boxLabel: {
            type: String,
            required: true,
        },
        boxHelp: {
            type: String,
            default: "",
        },
        deleteTitle: {
            type: String,
            required: true,
        },
        noRulesText: {
            type: String,
            required: true,
        },
        quickAddLabel: {
            type: String,
            required: true,
        },
        quickAddHint: {
            type: String,
            default: "",
        },
    },
    emits: ["add-template", "remove-rule"],
    setup(props) {
        function outputOptionsForRule(rule) {
            if (props.outputOptions.some((option) => option.value === rule.target)) {
                return props.outputOptions;
            }

            return [
                ...props.outputOptions,
                {
                    value: rule.target,
                    label: servoMixOutputLabel(rule.target, props.mixerMode),
                    outputIndex: servoMixOutputIndexForTarget(rule.target, props.mixerMode),
                },
            ];
        }

        function ruleAccentStyle(rule) {
            return servoOutputAccentStyle(servoMixOutputIndexForTarget(rule.target, props.mixerMode));
        }

        function canAddTemplate(template) {
            return !props.loading && props.rules.length + template.rules.length <= props.maxRules;
        }

        return {
            canAddTemplate,
            outputOptionsForRule,
            ruleAccentStyle,
        };
    },
});
</script>

<style lang="less" scoped>
.servo-function-mapper {
    .table_overflow {
        overflow-x: visible;
    }

    .servo-mixer-table {
        width: 100%;
        margin-bottom: 10px;
        table-layout: fixed;

        th,
        td {
            text-align: center;
            padding: 2px 3px;
        }

        th:nth-child(1),
        td:nth-child(1) {
            width: 28px;
        }

        th:nth-child(4),
        td:nth-child(4),
        th:nth-child(5),
        td:nth-child(5),
        th:nth-child(6),
        td:nth-child(6),
        th:nth-child(7),
        td:nth-child(7) {
            width: 60px;
        }

        th:nth-child(8),
        td:nth-child(8) {
            width: 78px;
        }

        th:nth-child(9),
        td:nth-child(9) {
            width: 40px;
        }

        input,
        select {
            width: 100%;
            min-width: 0;
            min-height: 29px;
            border: 1px solid var(--surface-500);
            border-radius: 5px;
            background-color: var(--surface-100);
            box-sizing: border-box;
        }

        input {
            text-align: right;
        }

        .servo-mixer-row {
            border-left: 4px solid var(--servo-output-accent);
            background-image: linear-gradient(90deg, var(--servo-output-accent-bg), transparent 24px);
        }

        .output-cell {
            display: grid;
            grid-template-columns: 12px minmax(90px, 1fr);
            gap: 6px;
            align-items: center;
        }

        .servo-output-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: var(--servo-output-accent);
            box-shadow: 0 0 0 2px var(--servo-output-accent-bg);
        }
    }

    .rule_actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        margin-top: 10px;
    }

    .rule_count {
        font-weight: normal;
    }

    .quick_add_button,
    .rule_delete {
        min-height: 28px;
        border: 1px solid var(--surface-500);
        border-radius: 5px;
        background-color: var(--surface-200);
        color: var(--text);
        cursor: pointer;
    }

    .quick_add_button {
        padding: 0 8px;
        font-size: 0.9em;
        white-space: nowrap;
    }

    .rule_delete {
        width: 28px;
        color: var(--error-500, #ff335f);
        border-color: currentColor;
        background: transparent;
    }

    .empty_row {
        color: var(--text-muted, #888);
        font-style: italic;
    }

    .quick_add_hint {
        margin-top: 8px;
        color: var(--text-muted, #888);
        font-style: italic;
    }
}
</style>
