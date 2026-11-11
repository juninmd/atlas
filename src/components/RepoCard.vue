<script setup>
import { STATUS, statusOf, statusVar, healthOf, initial } from '../lib/format.js'
import { hue } from '../lib/constellation.js'
defineProps({ repo: Object, index: { type: Number, default: 0 } })
defineEmits(['open'])
function tilt(e) {
  if (!matchMedia('(hover:hover)').matches) return
  const el = e.currentTarget, b = el.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height
  el.style.setProperty('--ry', (x - .5) * 7 + 'deg'); el.style.setProperty('--rx', (.5 - y) * 7 + 'deg'); el.style.setProperty('--mx', x * 100 + '%'); el.style.setProperty('--my', y * 100 + '%')
}
function untilt(e) { e.currentTarget.style.setProperty('--rx', '0deg'); e.currentTarget.style.setProperty('--ry', '0deg') }
</script>

<template>
  <button class="card repo-card" :style="{ '--h': hue(repo.language), '--d': (index % 24) * 28 + 'ms', '--c': statusVar(repo) }" @click="$emit('open', repo)" @pointermove="tilt" @pointerleave="untilt">
    <div class="c-top">
      <span class="mg">{{ initial(repo) }}</span>
      <span class="chips"><span v-if="repo.private" class="tag t-warn">privado</span><span class="pill">{{ STATUS[statusOf(repo)] }}</span></span>
    </div>
    <h3>{{ repo.name }}</h3>
    <p>{{ repo.purpose }}</p>
    <div class="c-foot">
      <span class="lang"><i></i>{{ repo.language || 'Sem linguagem' }}</span>
      <span>{{ repo.scan.riskCount }} riscos</span>
      <span class="hbar"><span><b :style="{ '--w': healthOf(repo) + '%', width: healthOf(repo) + '%' }"></b></span>{{ healthOf(repo) }}</span>
    </div>
  </button>
</template>
