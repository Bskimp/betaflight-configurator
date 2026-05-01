<template>
    <FlyingWingSVG
        v-if="airframeId === 'flying_wing'"
        :highlight="highlight"
        :dir="dir"
        :size="size"
        :show-labels="showLabels"
    />
    <VTailSVG v-else-if="airframeId === 'v_tail'" :highlight="highlight" :dir="dir" :size="size" />
    <TraditionalPlaneSVG v-else :highlight="highlight" :dir="dir" :size="size" />
</template>

<script setup>
import FlyingWingSVG from "./FlyingWingSVG.vue";
import TraditionalPlaneSVG from "./TraditionalPlaneSVG.vue";
import VTailSVG from "./VTailSVG.vue";

defineProps({
    airframeId: { type: String, default: "standard" },
    highlight: { type: String, default: null },
    dir: { type: Number, default: 0 },
    size: { type: Number, default: 280 },
    showLabels: { type: Boolean, default: false },
});
</script>

<script>
// Map a wizard-emitted surface label (e.g. "Aileron L", "Left Elevon")
// to the SVG component's highlight token. Surface labels come from
// wizardAirframes in WingTuningTab.vue, sourced from
// planePresets.js[].wiring[].fn.
//
// Exposed as a named export (alongside default-export Vue component)
// so callers can do:
//   import WizardSurfaceVisual, { surfaceLabelToHighlight }
//     from "./visuals/WizardSurfaceVisual.vue";
export function surfaceLabelToHighlight(label) {
    if (!label) return null;
    const norm = String(label).trim().toLowerCase();
    if (norm === "elevator") return "elevator";
    if (norm === "rudder") return "rudder";
    if (norm === "aileron l") return "aileron-l";
    if (norm === "aileron r") return "aileron-r";
    if (norm === "left elevon") return "left-elevon";
    if (norm === "right elevon") return "right-elevon";
    if (norm === "left v-tail") return "vtail-l";
    if (norm === "right v-tail") return "vtail-r";
    return null;
}
</script>
