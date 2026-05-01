<template>
    <svg viewBox="0 0 200 160" :width="size" style="overflow: visible">
        <!-- Fuselage -->
        <rect x="94" y="20" width="12" height="110" fill="#4a4a4a" stroke="#1c1c1c" stroke-width="1.5" />
        <!-- Main wing -->
        <rect x="20" y="65" width="160" height="18" fill="#6a6a6a" stroke="#1c1c1c" stroke-width="1.5" />
        <!-- Aileron L -->
        <g
            :style="{ transformOrigin: '90px 80px', transition: 'transform .35s' }"
            :transform="highlight === 'aileron-l' ? `rotate(${-dir * 18})` : ''"
        >
            <rect
                x="20"
                y="80"
                width="70"
                height="5"
                :fill="highlight === 'aileron-l' ? '#ffb000' : '#d0d0d0'"
                stroke="#1c1c1c"
                :style="{ filter: highlight === 'aileron-l' ? 'drop-shadow(0 0 8px rgba(255,176,0,.7))' : 'none' }"
            />
        </g>
        <!-- Aileron R -->
        <g
            :style="{ transformOrigin: '110px 80px', transition: 'transform .35s' }"
            :transform="highlight === 'aileron-r' ? `rotate(${dir * 18})` : ''"
        >
            <rect
                x="110"
                y="80"
                width="70"
                height="5"
                :fill="highlight === 'aileron-r' ? '#ffb000' : '#d0d0d0'"
                stroke="#1c1c1c"
                :style="{ filter: highlight === 'aileron-r' ? 'drop-shadow(0 0 8px rgba(255,176,0,.7))' : 'none' }"
            />
        </g>
        <!-- V-tail Left -->
        <g
            :style="{ transformOrigin: '100px 130px', transition: 'transform .35s' }"
            :transform="highlight === 'vtail-l' ? `rotate(${-dir * 16})` : ''"
        >
            <path
                d="M100 130 L65 150 L75 154 L100 138 Z"
                :fill="highlight === 'vtail-l' ? '#ffb000' : '#d0d0d0'"
                stroke="#1c1c1c"
                :style="{ filter: highlight === 'vtail-l' ? 'drop-shadow(0 0 8px rgba(255,176,0,.7))' : 'none' }"
            />
        </g>
        <!-- V-tail Right -->
        <g
            :style="{ transformOrigin: '100px 130px', transition: 'transform .35s' }"
            :transform="highlight === 'vtail-r' ? `rotate(${dir * 16})` : ''"
        >
            <path
                d="M100 130 L135 150 L125 154 L100 138 Z"
                :fill="highlight === 'vtail-r' ? '#ffb000' : '#d0d0d0'"
                stroke="#1c1c1c"
                :style="{ filter: highlight === 'vtail-r' ? 'drop-shadow(0 0 8px rgba(255,176,0,.7))' : 'none' }"
            />
        </g>
        <!-- Nose -->
        <ellipse cx="100" cy="20" rx="10" ry="6" fill="#cf2020" stroke="#1c1c1c" />
    </svg>
</template>

<script setup>
defineProps({
    highlight: { type: String, default: null },
    dir: { type: Number, default: 0 },
    size: { type: Number, default: 280 },
});
</script>
