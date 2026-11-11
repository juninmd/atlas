<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { state, init, refresh, analyzeAll, filtered, totals, resetFilters, options, CATEGORY_NAMES, projectTypes, toggleTheme } from './store.ts'
import type { View } from './store.ts'
import type { Status } from './core/types.ts'
import { STATUS } from './lib/format.ts'
import ConstellationView from './components/ConstellationView.vue'
import GridView from './components/GridView.vue'
import DeckView from './components/DeckView.vue'
import HealthView from './components/HealthView.vue'
import StackView from './components/StackView.vue'
import Drawer from './components/Drawer.vue'
import Palette from './components/Palette.vue'
import ConnectModal from './components/ConnectModal.vue'

const VIEWS: [View, string, string][] = [
  ['const', 'Constelação', 'M6 7a2 2 0 1 0 0 .01M17 5a1.5 1.5 0 1 0 0 .01M14 14a2.5 2.5 0 1 0 0 .01M5 18a1.5 1.5 0 1 0 0 .01M19 19a2 2 0 1 0 0 .01M6 7l8 7M17 5l-3 9M14 14l5 5M5 18l9-4'],
  ['grid', 'Grade', 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
  ['deck', 'Deck', 'M5 5h14v14H5zM2 8v8M22 8v8'],
  ['health', 'Saúde', 'M3 12h4l3-8 4 16 3-8h4'],
  ['stack', 'Quem usa?', 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5'],
]
const search = ref<HTMLInputElement | null>(null)
const statuses: Status[] = ['ativo', 'manutencao', 'experimento', 'abandonado']
const counts = (): Partial<Record<Status, number>> => { const c: Partial<Record<Status, number>> = {}; state.repos.forEach(r => { c[r.scan.status] = (c[r.scan.status] ?? 0) + 1 }); return c }
const width = innerWidth
const rateTxt = () => state.rate.limit ? `${state.rate.remaining}/${state.rate.limit} consultas` : ''

function onKey(e: KeyboardEvent): void {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '')
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); state.palette = !state.palette; return }
  if (e.key === '/' && !typing && !state.selected && !state.palette) { e.preventDefault(); search.value?.focus() }
}
const onOnline = () => state.online = true, onOffline = () => state.online = false
const onInstall = (e: Event): void => { e.preventDefault(); state.installEvent = e as typeof state.installEvent }
onMounted(() => { init(); addEventListener('keydown', onKey); addEventListener('online', onOnline); addEventListener('offline', onOffline); addEventListener('beforeinstallprompt', onInstall) })
onBeforeUnmount(() => { removeEventListener('keydown', onKey); removeEventListener('online', onOnline); removeEventListener('offline', onOffline); removeEventListener('beforeinstallprompt', onInstall) })
async function install() { const e = state.installEvent; if (!e) return; e.prompt(); await e.userChoice; state.installEvent = null }
watch(() => state.view, () => document.querySelector('.stage')?.scrollTo(0, 0))
</script>

<template>
  <div class="app">
    <aside class="rail" aria-label="Visões">
      <div class="brand"><i></i>atlas</div>
      <button v-for="[id, label, path] in VIEWS" :key="id" class="vbtn" :data-view="id" :aria-pressed="state.view === id" @click="state.view = id">
        <svg viewBox="0 0 24 24"><path :d="path" /></svg>{{ label }}
      </button>
      <button class="vbtn" aria-label="Abrir paleta de comandos" @click="state.palette = true"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>Comandos <small class="mono" style="margin-left:auto">Ctrl K</small></button>
      <div class="sp"></div>
      <button v-if="state.installEvent" class="btn install" @click="install">Instalar app</button>
      <button class="vbtn" id="connBtn" @click="state.connectOpen = true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>{{ state.phase === 'ready' ? state.conn.user : 'Conectar' }}</button>
      <button v-if="state.phase === 'ready'" class="vbtn" @click="refresh"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg>Atualizar</button>
      <button class="vbtn" @click="toggleTheme"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>Tema</button>
      <div class="net"><i :style="{ background: state.online ? '' : 'var(--st-experimento)' }"></i><span id="netTxt">{{ !state.online ? 'Você está offline' : state.phase === 'ready' ? `${state.conn.scope === 'private' ? 'Com privados' : 'Só públicos'} · ${rateTxt()}` : 'Não conectado' }}</span></div>
    </aside>

    <div class="main">
      <div class="bar">
        <label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input ref="search" id="q" v-model="state.q" type="search" placeholder="Busque uma ideia, ferramenta, linguagem, tecnologia ou topic…" aria-label="Buscar aplicações"><kbd>/</kbd></label>
        <div class="filters" id="chips">
          <button class="chip" :aria-pressed="!state.status" @click="state.status = ''">Todos</button>
          <button v-for="s in statuses" :key="s" class="chip" :aria-pressed="state.status === s" :style="{ '--c': `var(--st-${s})` }" @click="state.status = state.status === s ? '' : s"><i></i>{{ STATUS[s] }} <span class="mono">{{ counts()[s] ?? 0 }}</span></button>
          <button class="chip" :aria-pressed="state.pending" @click="state.pending = !state.pending">Finalidade pendente</button>
        </div>
        <div class="filters">
          <select v-model="state.lang" class="sel" aria-label="Linguagem"><option value="">Todas as linguagens</option><option v-for="l in options.languages" :key="l">{{ l }}</option></select>
          <select v-model="state.cat" class="sel" aria-label="Categoria"><option value="">Todas as categorias</option><option v-for="c in CATEGORY_NAMES" :key="c">{{ c }}</option><option value="uncategorized">Sem categoria</option></select>
          <select v-model="state.topic" class="sel" aria-label="Topic"><option value="">Todos os topics</option><option value="missing">Sem topics</option><option v-for="t in options.topics" :key="t">{{ t }}</option></select>
          <select v-model="state.ptype" class="sel" aria-label="Tipo de projeto"><option value="">Todos os tipos</option><option v-for="t in options.types" :key="t" :value="t">{{ projectTypes[t] || t }}</option></select>
          <select v-model="state.kind" class="sel" aria-label="Origem"><option value="">Originais, forks e arquivados</option><option value="own">Só originais</option><option value="fork">Só forks</option><option value="archived">Só arquivados</option></select>
          <select v-if="state.conn.scope === 'private'" v-model="state.vis" class="sel" aria-label="Visibilidade"><option value="">Públicos e privados</option><option value="public">Públicos</option><option value="private">Privados</option></select>
          <select v-model="state.sort" class="sel" aria-label="Ordenar"><option value="recent">Mais recentes</option><option value="health">Maior saúde</option><option value="risks">Mais riscos</option><option value="stars">Mais estrelas</option><option value="name">Nome A–Z</option></select>
          <button class="chip" id="reset" @click="resetFilters">Limpar</button>
        </div>
        <div class="countline"><span id="count">{{ filtered.length }} de {{ state.repos.length }} repositórios</span>
          <span class="kpistrip"><span><b>{{ totals.deep }}</b>analisados a fundo</span><span><b>{{ totals.risks }}</b>riscos</span><span v-if="totals.deep"><b>{{ totals.noCI }}</b>sem CI</span>
            <button class="chip" id="analyzeBtn" :disabled="state.analysis.running" @click="analyzeAll">{{ state.analysis.running ? `Analisando ${state.analysis.done}/${state.analysis.total}…` : 'Analisar stack e CI' }}</button></span></div>
        <p v-if="state.analysis.message" class="note" role="status">{{ state.analysis.message }}</p>
      </div>
      <div class="stage">
        <div v-if="state.phase === 'welcome'" class="empty" id="welcome"><h3>Conheça tudo que você construiu.</h3><p>Conecte sua conta do GitHub para ver seus repositórios com raio-X de saúde, riscos e stack.</p><button class="btn pri" @click="state.connectOpen = true">Conectar ao GitHub</button></div>
        <div v-else-if="state.loading && !state.repos.length" class="loading" role="status">Coletando seus repositórios…</div>
        <template v-else>
          <ConstellationView v-show="state.view === 'const'" />
          <GridView v-if="state.view === 'grid'" />
          <DeckView v-if="state.view === 'deck'" />
          <HealthView v-if="state.view === 'health'" />
          <StackView v-if="state.view === 'stack'" />
        </template>
      </div>
    </div>
  </div>
  <Drawer />
  <Palette />
  <ConnectModal />
  <div v-if="state.tip" class="tip show" :style="{ left: Math.min(width - 270, state.tip.x + 14) + 'px', top: state.tip.y + 16 + 'px' }" role="tooltip">{{ state.tip.text }}</div>
  <div v-if="state.toast" class="toast" role="status"><span>{{ state.toast.msg }}</span><button v-if="state.toast.undo" @click="state.toast.undo(); state.toast = null">Desfazer</button></div>
</template>
