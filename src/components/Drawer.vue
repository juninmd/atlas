<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { state, loadReadme, renderFor, saveNote, removeRepo, toast, analyzeOne, CATEGORY_NAMES, projectTypes } from '../store.ts'
import type { ReadmeDoc, Repo } from '../core/types.ts'
import type { Tab } from '../store.ts'
import { STATUS, SEV, statusOf, statusVar, healthOf, fmtDate, initial } from '../lib/format.ts'
import { hue } from '../lib/constellation.ts'
const dlg = ref<HTMLDialogElement | null>(null), readme = ref<ReadmeDoc>({ status: 'unloaded', text: '' }), purpose = ref(''), cats = ref<string[]>([]), saving = ref(false), ring = ref(false), scanning = ref(false)
const TABS: [Tab, string][] = [['over', 'Visão geral'], ['tech', 'Raio-X'], ['risks', 'Riscos e melhorias'], ['readme', 'README'], ['ficha', 'Ficha']]
const r = computed(() => state.selected as Repo | null)
const C = 2 * Math.PI * 32
const html = computed(() => r.value && readme.value.text ? renderFor(r.value, readme.value.text) : '')
const topics = computed(() => r.value ? [...new Set([...(r.value.suggestedTopics || []), ...(r.value.topics || [])])] : [])
const sig = computed(() => r.value?.scan.signals ?? null)
const YN = (v: boolean | null): string => v === null ? 'não se aplica' : v ? 'sim' : 'não'
let req = 0
watch(r, async (repo: Repo | null) => {
  if (!repo) { dlg.value?.open && dlg.value.close(); return }
  const id = ++req
  ring.value = false; purpose.value = repo.purpose; cats.value = [...repo.categories]
  readme.value = repo.readme || { status: 'missing', text: '' }
  await nextTick(); if (!dlg.value!.open) dlg.value!.showModal()
  requestAnimationFrame(() => ring.value = true)
  const rd = await loadReadme(repo); if (id === req) readme.value = rd
})
const close = () => { state.selected = null }
const onClick = (e: MouseEvent) => { if (e.target === dlg.value) close() }
const toggleCat = (c: string) => cats.value = cats.value.includes(c) ? cats.value.filter(x => x !== c) : [...cats.value, c]
async function save() { saving.value = true; try { await saveNote(r.value!, { purpose: purpose.value.trim(), categories: cats.value }); toast('Ficha salva neste navegador.') } finally { saving.value = false } }
function remove() { const repo = r.value!; close(); removeRepo(repo) }
async function scan() { scanning.value = true; try { await analyzeOne(r.value!) } finally { scanning.value = false } }
</script>

<template>
  <dialog id="drawer" ref="dlg" aria-label="Raio-X do repositório" @close="close" @click="onClick">
    <template v-if="r">
      <div class="d-head">
        <span class="mg" :style="{ '--h': hue(r.language) }">{{ initial(r) }}</span>
        <div style="min-width:0"><h3>{{ r.name }}</h3>
          <p class="mono" style="font-size:12px;color:var(--mut)">{{ r.language || 'Sem linguagem' }} · {{ r.fork ? 'fork' : 'original' }} · {{ r.private ? 'privado' : 'público' }}<template v-if="r.archived"> · arquivado</template> · push {{ fmtDate(r.pushed_at) }}</p></div>
        <button class="x" id="dx" aria-label="Fechar" @click="close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
      </div>
      <div class="d-top" :style="{ '--c': statusVar(r) }">
        <div class="ring"><svg viewBox="0 0 76 76"><circle class="bg" cx="38" cy="38" r="32" /><circle class="fg" cx="38" cy="38" r="32" :stroke-dasharray="C" :stroke-dashoffset="ring ? C * (1 - healthOf(r) / 100) : C" /></svg><b>{{ healthOf(r) }}</b></div>
        <div class="facts" style="flex:1;min-width:220px">
          <div class="fact"><span>Status</span><b style="font-size:16px" :style="{ color: statusVar(r) }">{{ STATUS[statusOf(r)] }}</b></div>
          <div class="fact"><span>Riscos</span><b>{{ r.scan.riskCount }}</b></div>
          <div class="fact"><span>Estrelas</span><b>{{ r.stars }}</b></div>
          <div class="fact"><span>Issues</span><b>{{ r.open_issues }}</b></div>
        </div>
      </div>
      <div class="tabs" role="tablist"><button v-for="[k, l] in TABS" :key="k" role="tab" :aria-selected="state.tab === k" @click="state.tab = k">{{ l }}</button></div>
      <div :key="state.tab" class="d-body" role="tabpanel" id="dbody">
        <template v-if="state.tab === 'over'">
          <p class="big">{{ r.purpose }}</p>
          <p class="mono" style="font-size:12px">Fonte: {{ r.purposeSource }}<template v-if="r.projectType"> · {{ projectTypes[r.projectType] || r.projectType }}</template></p>
          <h4>Categorias</h4><div class="chips"><span v-for="c in r.categories" :key="c" class="tag t-cat">{{ c }}</span><span v-if="!r.categories.length" class="note" style="padding:6px 10px">Sem categoria. Use a aba Ficha.</span></div>
          <h4>Topics</h4><div class="chips"><span v-for="t in topics" :key="t" class="tag t-new">{{ t }}</span><span v-if="!topics.length" class="note" style="padding:6px 10px">Nenhum topic.</span></div>
          <div class="chips"><a class="btn" :href="r.url" target="_blank" rel="noopener noreferrer">Abrir no GitHub ↗</a></div>
        </template>
        <template v-else-if="state.tab === 'tech'">
          <template v-if="sig">
            <div class="tbl"><div style="font-weight:700"><span>Sinal</span><span>Situação</span><span>Detalhe</span></div>
              <div><span>CI (GitHub Actions)</span><span :class="{ bad: !sig.ci }">{{ YN(sig.ci) }}</span><span class="mono">{{ sig.ci ? 'workflow encontrado' : 'nenhum workflow' }}</span></div>
              <div><span>Lockfile</span><span :class="{ bad: sig.lockfile === false }">{{ YN(sig.lockfile) }}</span><span class="mono">{{ sig.ecosystems.join(', ') || '—' }}</span></div>
              <div v-for="(v, k) in r.scan.runtimes" :key="k"><span>Runtime {{ k }}</span><span class="mono">{{ Array.isArray(v) ? v.join(', ') : v }}</span><span></span></div></div>
            <h4>Dependências ({{ r.scan.techs.length }})</h4>
            <div class="chips"><span v-for="t in r.scan.techs" :key="t.ecosystem + t.name" class="tag t-cat" :title="t.kind">{{ t.name }} <span class="mono">{{ t.range }}</span></span><span v-if="!r.scan.techs.length" class="note" style="padding:6px 10px">Nenhum manifesto de dependências encontrado.</span></div>
          </template>
          <div v-else class="note">Este repositório ainda não teve a stack lida. A análise busca a árvore de arquivos, os manifestos (package.json, requirements.txt, Cargo.toml, go.mod, Dockerfile) e os workflows, com cerca de 6 consultas à API.
            <div class="chips" style="margin-top:10px"><button class="btn pri" :disabled="scanning" @click="scan">{{ scanning ? 'Analisando…' : 'Analisar este repositório' }}</button></div>
            <p v-if="state.analysis.message" style="margin-top:8px">{{ state.analysis.message }}</p></div>
        </template>
        <template v-else-if="state.tab === 'risks'">
          <ul v-if="r.scan.risks.length" class="risk"><li v-for="x in r.scan.risks" :key="x.id"><b>{{ SEV[x.sev] }}:</b> {{ x.text }}<br><span class="fix">{{ x.fix }}</span></li></ul>
          <p v-else class="note">Nenhum risco encontrado{{ r.scan.deep ? '' : ' nos metadados. A análise da stack pode achar mais' }}.</p>
          <p v-if="!r.scan.deep" class="mono small">Riscos de CI, lockfile e imagem Docker aparecem depois da análise na aba Raio-X.</p>
        </template>
        <template v-else-if="state.tab === 'readme'">
          <div v-if="html" class="readme" v-html="html"></div>
          <p v-else class="note">{{ readme.status === 'error' ? (readme.message || 'Não foi possível ler o README.') : readme.status === 'unloaded' ? 'Carregando…' : 'Este repositório não tem README.' }}</p>
          <div class="chips"><span class="tag t-cat">sem HTML</span><span class="tag t-cat">links http/https</span><span class="tag t-cat">imagens como legenda</span></div>
        </template>
        <template v-else>
          <h4>Finalidade</h4><textarea id="fPurpose" v-model="purpose" aria-label="Finalidade" maxlength="1200"></textarea>
          <h4>Categorias</h4><div class="chips" id="fCats"><button v-for="c in CATEGORY_NAMES" :key="c" class="chip" :aria-pressed="cats.includes(c)" @click="toggleCat(c)">{{ c }}</button></div>
          <div class="chips"><button id="saveN" class="btn pri" :disabled="saving || !purpose.trim()" @click="save">{{ saving ? 'Salvando…' : 'Salvar ficha' }}</button><button id="delBtn" class="danger" @click="remove">Remover do catálogo</button></div>
          <p>Fichas ficam só neste navegador e não alteram a descrição no GitHub.</p>
        </template>
      </div>
    </template>
  </dialog>
</template>
