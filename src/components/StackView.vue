<script setup>
import { ref, computed } from 'vue'
import { state, openRepo, analyzeAll, totals } from '../store.js'
import { STATUS, statusOf } from '../lib/format.js'
const term = ref('')
const pool = computed(() => state.repos.filter(r => !state.removed.has(r.name)))
const chips = computed(() => { const c = {}; pool.value.forEach(r => r.scan.techs.forEach(t => { const k = t.name.toLowerCase(); c[k] = (c[k] || 0) + 1 })); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 14).map(x => x[0]) })
const matches = computed(() => {
  const q = term.value.trim().toLowerCase(); if (!q) return []
  return pool.value.map(r => {
    const t = r.scan.techs.find(t => t.name.toLowerCase().includes(q))
    return t || [r.name, r.purpose, r.language, ...(r.topics || [])].join(' ').toLowerCase().includes(q) ? { r, t } : null
  }).filter(Boolean)
})
const topRisk = computed(() => [...pool.value].sort((a, b) => b.scan.riskCount - a.scan.riskCount).slice(0, 6))
const noCI = computed(() => pool.value.filter(r => r.scan.deep && r.scan.risks.some(x => x.id === 'no-ci')).slice(0, 6))
</script>

<template>
  <div class="view" id="v-stack">
    <div v-if="!totals.deep" class="note">A busca por tecnologia usa os manifestos dos repositórios (package.json, requirements.txt, Cargo.toml, go.mod, Dockerfile). Rode a análise para preencher: com token são cerca de 6 consultas por repositório.
      <div class="chips" style="margin-top:10px"><button class="btn pri" :disabled="state.analysis.running" @click="analyzeAll">{{ state.analysis.running ? `Analisando ${state.analysis.done}/${state.analysis.total}…` : 'Analisar stack e CI' }}</button></div></div>
    <div class="who">
      <label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg><input id="who" v-model="term" aria-label="Tecnologia ou dependência" placeholder="vue, electron, express…"></label>
      <div class="filters"><button v-for="c in chips" :key="c" class="chip" @click="term = c">{{ c }}</button></div>
    </div>
    <p class="mono" id="whoN" style="margin-top:14px;font-size:13px;color:var(--mut)">{{ term.trim() ? `${matches.length} repositórios usam ou mencionam "${term.trim()}"` : 'Digite uma tecnologia para ver quem a usa.' }}</p>
    <div class="res" id="whoRes">
      <button v-for="m in matches.slice(0, 40)" :key="m.r.name" class="row" @click="openRepo(m.r, 'tech')">
        <span>{{ m.r.name }} <small>{{ m.t ? `${m.t.name} ${m.t.range} · ${m.t.kind}` : (m.r.purpose || '').slice(0, 70) }}</small></span>
        <small>{{ m.r.language || '—' }}</small>
        <span class="pill" :style="{ '--c': `var(--st-${statusOf(m.r)})` }">{{ STATUS[statusOf(m.r)] }}</span>
      </button>
    </div>
    <div class="rep">
      <div class="panel"><h4>Mais riscos</h4><ol><li v-for="r in topRisk" :key="r.name"><button @click="openRepo(r, 'risks')"><span>{{ r.name }}</span><small>{{ r.scan.riskCount }} riscos</small></button></li></ol></div>
      <div class="panel"><h4>Sem CI (análise a fundo)</h4><ol><li v-for="r in noCI" :key="r.name"><button @click="openRepo(r, 'risks')"><span>{{ r.name }}</span><small>{{ r.language || '—' }}</small></button></li><li v-if="!noCI.length" class="mono small" style="color:var(--mut)">{{ totals.deep ? 'Nenhum.' : 'Rode a análise.' }}</li></ol></div>
    </div>
  </div>
</template>
