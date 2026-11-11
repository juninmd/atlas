<script setup lang="ts">
import { STATUS, statusOf, statusVar, healthOf, initial } from '../lib/format.ts'
import { hue } from '../lib/constellation.ts'
import type { Repo } from '../core/types.ts'
withDefaults(defineProps<{ repo: Repo; index?: number }>(), { index: 0 })
defineEmits<{ open: [repo: Repo] }>()
function tilt(e: PointerEvent): void {
  if (!matchMedia('(hover:hover)').matches) return
  const el = e.currentTarget as HTMLElement, b = el.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height
  el.style.setProperty('--ry', (x - .5) * 7 + 'deg'); el.style.setProperty('--rx', (.5 - y) * 7 + 'deg'); el.style.setProperty('--mx', x * 100 + '%'); el.style.setProperty('--my', y * 100 + '%')
}
function untilt(e: PointerEvent): void { const el = e.currentTarget as HTMLElement; el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg') }
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
