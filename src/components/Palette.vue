<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { state, filtered, openRepo, toggleTheme, toast, resetFilters, refresh, analyzeAll } from '../store.js'
const dlg = ref(null), q = ref(''), idx = ref(0), input = ref(null)
const go = (view, label) => ({ t: 'Ir para ' + label, s: 'visão', f: () => state.view = view })
const ACTS = [go('const', 'Constelação'), go('grid', 'Grade'), go('deck', 'Deck (carrossel)'), go('health', 'Saúde'), go('stack', 'Quem usa?'),
  { t: 'Alternar tema', s: 'ação', f: toggleTheme }, { t: 'Limpar filtros', s: 'ação', f: resetFilters },
  { t: 'Mostrar só ativos', s: 'filtro', f: () => state.status = 'ativo' }, { t: 'Mostrar só abandonados', s: 'filtro', f: () => state.status = 'abandonado' },
  { t: 'Ordenar por mais riscos', s: 'filtro', f: () => state.sort = 'risks' },
  { t: 'Atualizar do GitHub', s: 'ação', f: () => state.phase === 'ready' ? refresh() : state.connectOpen = true },
  { t: 'Analisar stack e CI', s: 'ação', f: analyzeAll },
  { t: 'Conexão e credenciais', s: 'ação', f: () => state.connectOpen = true },
  { t: 'Gerar plano de topics', s: 'cli', f: () => toast('No terminal: pnpm topics:plan grava .catalog/topics-plan.json.') }]
const list = computed(() => {
  const s = q.value.trim().toLowerCase()
  const a = ACTS.filter(x => !s || x.t.toLowerCase().includes(s))
  const rp = s ? filtered.value.concat([]).filter(r => r.name.toLowerCase().includes(s)).slice(0, 7).map(r => ({ t: r.name, s: r.language || '—', f: () => openRepo(r) })) : []
  return [...a, ...rp]
})
watch(() => state.palette, async v => { if (v) { q.value = ''; idx.value = 0; await nextTick(); dlg.value.showModal(); input.value.focus() } else if (dlg.value.open) dlg.value.close() })
watch(q, () => idx.value = 0)
function run(i) { const x = list.value[i]; if (!x) return; state.palette = false; x.f() }
function key(e) {
  if (e.key === 'ArrowDown') { idx.value = Math.min(list.value.length - 1, idx.value + 1); e.preventDefault() }
  else if (e.key === 'ArrowUp') { idx.value = Math.max(0, idx.value - 1); e.preventDefault() }
  else if (e.key === 'Enter') run(idx.value)
}
</script>

<template>
  <dialog id="pal" ref="dlg" aria-label="Paleta de comandos" @close="state.palette = false" @click="$event.target === dlg && (state.palette = false)">
    <input id="palq" ref="input" v-model="q" placeholder="Digite um comando ou o nome de um repositório…" aria-label="Comando" @keydown="key">
    <ul><li v-for="(x, i) in list" :key="x.t + i"><button :class="{ on: i === idx }" @click="run(i)" @pointerenter="idx = i">{{ x.t }}<small>{{ x.s }}</small></button></li>
      <li v-if="!list.length" class="empty">Nada encontrado.</li></ul>
  </dialog>
</template>
