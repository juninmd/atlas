<script setup>
import { computed } from 'vue'
import { state, filtered, activeSet, openRepo, setTip } from '../store.js'
import { STATUS, STATUS_ORDER, statusOf, statusVar, healthOf } from '../lib/format.js'
import { hue } from '../lib/constellation.js'
const groups = computed(() => STATUS_ORDER.map(s => {
  const L = state.repos.filter(r => !state.removed.has(r.name) && statusOf(r) === s).sort((a, b) => healthOf(b) - healthOf(a))
  const avg = L.length ? Math.round(L.reduce((a, r) => a + healthOf(r), 0) / L.length) : null
  return { s, L, avg }
}).filter(g => g.L.length))
const langs = computed(() => { const c = {}; filtered.value.forEach(r => { const l = r.language || '—'; c[l] = (c[l] || 0) + 1 }); const e = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8); return e.map(([l, n]) => ({ l, n, w: n / e[0][1] * 100 })) })
const risks = computed(() => { const r = ['ativo', 'manutencao', 'experimento', 'abandonado'].map(s => { const L = filtered.value.filter(x => statusOf(x) === s); return { s, v: L.length ? L.reduce((a, x) => a + x.scan.riskCount, 0) / L.length : 0 } }); const m = Math.max(1, ...r.map(x => x.v)); return r.map(x => ({ ...x, w: x.v / m * 100 })) })
</script>

<template>
  <div class="view" id="v-health">
    <div id="mosaic">
      <section v-for="g in groups" :key="g.s" class="mosaic-sec" :style="{ '--c': `var(--st-${g.s})` }">
        <header><b>{{ STATUS[g.s] }}</b><span>{{ g.L.length }} repositórios· saúde média {{ g.avg }}</span></header>
        <div class="cells">
          <button v-for="(r, i) in g.L" :key="r.name" class="cell" :class="{ off: !activeSet.has(r._i), lockc: r.private }" :aria-label="`${r.name}, saúde ${healthOf(r)}`"
            :style="{ '--c': statusVar(r), '--o': (healthOf(r) / 100).toFixed(2), '--d': Math.min(900, i * 2) }"
            @click="openRepo(r)" @pointerenter="setTip(`${r.name} · saúde ${healthOf(r)}`, $event.clientX, $event.clientY)" @pointerleave="setTip(null)"></button>
        </div>
      </section>
    </div>
    <div class="charts">
      <div class="panel"><h4>Linguagens no filtro atual</h4>
        <div class="bars"><div v-for="x in langs" :key="x.l"><span>{{ x.l }}</span><em :style="{ '--w': x.w + '%', width: x.w + '%', '--c': `hsl(${hue(x.l)} 75% var(--sl))` }"></em><span>{{ x.n }}</span></div></div></div>
      <div class="panel"><h4>Riscos médios por status</h4>
        <div class="bars"><div v-for="x in risks" :key="x.s"><span>{{ STATUS[x.s] }}</span><em :style="{ '--w': x.w + '%', width: x.w + '%', '--c': `var(--st-${x.s})` }"></em><span>{{ x.v.toFixed(1) }}</span></div></div></div>
    </div>
  </div>
</template>
