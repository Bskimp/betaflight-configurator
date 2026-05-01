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
        <!-- Horizontal stabilizer -->
        <rect x="70" y="120" width="60" height="10" fill="#6a6a6a" stroke="#1c1c1c" />
        <!-- Elevator -->
        <g
            :style="{ transformOrigin: '100px 128px', transition: 'transform .35s' }"
            :transform="highlight === 'elevator' ? `rotate(${dir * 18})` : ''"
        >
            <rect
                x="70"
                y="128"
                width="60"
                height="4"
                :fill="highlight === 'elevator' ? '#ffb000' : '#d0d0d0'"
                stroke="#1c1c1c"
                :style="{ filter: highlight === 'elevator' ? 'drop-shadow(0 0 8px rgba(255,176,0,.7))' : 'none' }"
            />
        </g>
        <!-- Rudder -->
        <g
            :style="{ transformOrigin: '100px 130px', transition: 'transform .35s' }"
            :transform="highlight === 'rudder' ? `rotate(${dir * 22})` : ''"
        >
            <rect
                x="97"
                y="130"
                width="6"
                height="18"
                :fill="highlight === 'rudder' ? '#ffb000' : '#8a8a8a'"
                stroke="#1c1c1c"
                :style="{ filter: highlight === 'rudder' ? 'drop-shadow(0 0 8px rgba(255,176,0,.7))' : 'none' }"
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
