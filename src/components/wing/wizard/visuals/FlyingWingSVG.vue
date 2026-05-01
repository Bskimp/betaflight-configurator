<template>
    <svg :viewBox="`0 0 ${W} ${H}`" :width="size" style="overflow: visible">
        <!-- Center fuselage / body -->
        <path d="M200 40 L215 60 L230 180 L170 180 L185 60 Z" fill="#4a4a4a" stroke="#1c1c1c" stroke-width="2" />
        <!-- Wings - left -->
        <path d="M185 60 L40 150 L55 170 L170 180 Z" fill="#6a6a6a" stroke="#1c1c1c" stroke-width="2" />
        <!-- Wings - right -->
        <path d="M215 60 L360 150 L345 170 L230 180 Z" fill="#6a6a6a" stroke="#1c1c1c" stroke-width="2" />
        <!-- Nose -->
        <ellipse cx="200" cy="40" rx="16" ry="10" fill="#cf2020" stroke="#1c1c1c" stroke-width="1.5" />
        <!-- Arrow indicator -->
        <path d="M200 14 L195 26 L200 23 L205 26 Z" fill="#ff5656" />

        <!-- Left elevon -->
        <g transform="translate(100 168)">
            <g
                :style="{ transformOrigin: '60px 0', transition: 'transform .35s' }"
                :transform="highlight === 'left-elevon' ? `rotate(${-dir * 20})` : ''"
            >
                <path
                    d="M0 0 L70 4 L72 18 L5 14 Z"
                    :fill="highlight === 'left-elevon' ? '#ffb000' : '#d0d0d0'"
                    stroke="#1c1c1c"
                    stroke-width="1.5"
                    :style="{
                        filter: highlight === 'left-elevon' ? 'drop-shadow(0 0 10px rgba(255,176,0,.8))' : 'none',
                    }"
                />
            </g>
        </g>
        <!-- Right elevon -->
        <g transform="translate(228 172)">
            <g
                :style="{ transformOrigin: '0px 0', transition: 'transform .35s' }"
                :transform="highlight === 'right-elevon' ? `rotate(${dir * 20})` : ''"
            >
                <path
                    d="M0 0 L70 -4 L67 10 L2 14 Z"
                    :fill="highlight === 'right-elevon' ? '#ffb000' : '#d0d0d0'"
                    stroke="#1c1c1c"
                    stroke-width="1.5"
                    :style="{
                        filter: highlight === 'right-elevon' ? 'drop-shadow(0 0 10px rgba(255,176,0,.8))' : 'none',
                    }"
                />
            </g>
        </g>
        <!-- Optional rudder (tiny vertical fin at tail) -->
        <g transform="translate(200 180)">
            <g
                :style="{ transformOrigin: '0 0', transition: 'transform .35s' }"
                :transform="highlight === 'rudder' ? `rotate(${dir * 22})` : ''"
            >
                <path
                    d="M-8 0 L8 0 L4 30 L-4 30 Z"
                    :fill="highlight === 'rudder' ? '#ffb000' : '#8a8a8a'"
                    stroke="#1c1c1c"
                    stroke-width="1.5"
                    :style="{ filter: highlight === 'rudder' ? 'drop-shadow(0 0 10px rgba(255,176,0,.8))' : 'none' }"
                />
            </g>
        </g>

        <!-- Motor -->
        <circle cx="200" cy="190" r="6" fill="#2a2a2a" stroke="#666" stroke-width="1" />

        <template v-if="showLabels">
            <text x="60" y="190" fill="#999" font-size="10" font-family="Consolas">S2 · L elevon</text>
            <text x="300" y="195" fill="#999" font-size="10" font-family="Consolas">S3 · R elevon</text>
        </template>
    </svg>
</template>

<script setup>
defineProps({
    highlight: { type: String, default: null },
    dir: { type: Number, default: 0 },
    size: { type: Number, default: 280 },
    showLabels: { type: Boolean, default: false },
});

const W = 400;
const H = 260;
</script>
