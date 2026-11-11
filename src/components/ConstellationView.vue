<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { state, activeSet, openRepo, setTip } from '../store.ts'
import { createConstellation } from '../lib/constellation.ts'
import { STATUS, statusOf } from '../lib/format.ts'
const cv = ref<HTMLCanvasElement | null>(null); let c: ReturnType<typeof createConstellation> | undefined
onMounted(() => {
  c = createConstellation(cv.value!, {
    labels: true, getRepos: () => state.repos, isActive: i => activeSet.value.has(i), colorMode: () => state.colorBy,
    onPick: r => openRepo(r), onHover: (r, x, y) => setTip(r ? `${r.name} · ${r.language || '—'} · ${STATUS[statusOf(r)]}` : null, x, y),
  })
})
onBeforeUnmount(() => c?.destroy())
watch(() => state.repos, () => c?.refresh())
watch(activeSet, () => c?.draw())
watch(() => state.colorBy, () => c?.draw())
watch(() => state.theme, () => nextTick(() => c?.recolor()))
watch(() => state.view, v => { if (v === 'const') nextTick(() => c?.size()) })
</script>

<template>
  <div class="view cv-full" id="v-const">
    <div class="legend2">
      <span v-for="s in ['ativo', 'manutencao', 'experimento', 'abandonado']" :key="s" class="chip" :style="{ '--c': `var(--st-${s})`, background: 'var(--surf)' }"><i></i>{{ STATUS[s] }}</span>
      <button class="chip" style="background:var(--surf)" @click="state.colorBy = state.colorBy === 'status' ? 'lang' : 'status'">Cor por: {{ state.colorBy === 'status' ? 'status' : 'linguagem' }}</button>
    </div>
    <canvas ref="cv" aria-label="Constelação interativa com um ponto por repositório" role="img"></canvas>
    <div class="hint">clique em uma estrela para abrir o dossiê</div>
  </div>
</template>
