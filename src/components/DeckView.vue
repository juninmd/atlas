<script setup>
import { ref, watch, computed } from 'vue'
import { filtered, openRepo, removeRepo, loadReadme, renderFor, projectTypes } from '../store.js'
import { STATUS, statusOf, statusVar, healthOf, fmtDate } from '../lib/format.js'
const cursor = ref(0), swap = ref(0), readme = ref({ status: 'unloaded', text: '' }), loading = ref(false)
let req = 0
const repo = computed(() => filtered.value[cursor.value])
const html = computed(() => repo.value && readme.value.text ? renderFor(repo.value, readme.value.text) : '')
watch(filtered, () => { cursor.value = Math.min(cursor.value, Math.max(0, filtered.value.length - 1)) })
watch(repo, async r => {
  swap.value++
  if (!r) { readme.value = { status: 'missing', text: '' }; return }
  const id = ++req; readme.value = r.readme || { status: 'missing', text: '' }; loading.value = true
  const d = await loadReadme(r); if (id === req) { readme.value = d; loading.value = false }
}, { immediate: true })
const step = n => cursor.value = Math.max(0, Math.min(filtered.value.length - 1, cursor.value + n))
function key(e) { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1) }
let sx = 0
</script>

<template>
  <div class="view" id="v-deck" @keydown="key" tabindex="-1">
    <div v-if="!repo" class="empty"><h3>Nenhum repositório no filtro.</h3></div>
    <div v-else class="deck">
      <div class="deck-bar">
        <button class="nb" aria-label="Anterior" :disabled="cursor <= 0" @click="step(-1)"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7" /></svg></button>
        <button class="nb" aria-label="Próximo" :disabled="cursor >= filtered.length - 1" @click="step(1)"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg></button>
        <span class="mono" style="font-size:13px;color:var(--mut)">{{ cursor + 1 }} / {{ filtered.length }}</span>
        <div class="prog"><b :style="{ '--p': ((cursor + 1) / filtered.length * 100) + '%' }"></b></div>
        <button class="danger" title="Remover este repositório do catálogo" @click="removeRepo(repo)">Remover</button>
      </div>
      <article :key="swap" class="slide swap" tabindex="0" aria-live="polite" :style="{ '--c': statusVar(repo) }" @pointerdown="sx = $event.clientX" @pointerup="Math.abs($event.clientX - sx) > 60 && step($event.clientX < sx ? 1 : -1)">
        <div class="l">
          <div class="chips"><span class="pill">{{ STATUS[statusOf(repo)] }}</span><span class="tag t-cat">{{ repo.private ? 'privado' : 'público' }}</span><span v-if="repo.fork" class="tag t-warn">fork</span><span v-if="repo.projectType" class="tag t-new">{{ projectTypes[repo.projectType] || repo.projectType }}</span></div>
          <h3>{{ repo.name }}</h3>
          <p class="big">{{ repo.purpose }}</p>
          <p v-if="repo.categories.length" class="mono" style="font-size:12px;color:var(--mut)">{{ repo.categories.join(' · ') }}</p>
          <div class="chips"><span v-for="t in repo.topics" :key="t" class="tag t-cat">{{ t }}</span></div>
          <div class="facts">
            <div class="fact"><span>Saúde</span><b>{{ healthOf(repo) }}</b></div>
            <div class="fact"><span>Riscos</span><b>{{ repo.scan.riskCount }}</b></div>
            <div class="fact"><span>Estrelas</span><b>{{ repo.stars }} ★</b></div>
            <div class="fact"><span>Último push</span><b style="font-size:15px">{{ fmtDate(repo.pushed_at) }}</b></div>
          </div>
          <div class="chips" style="margin-top:auto"><button class="btn pri" @click="openRepo(repo)">Abrir raio-X</button><a class="btn" :href="repo.url" target="_blank" rel="noopener noreferrer">GitHub ↗</a></div>
        </div>
        <div class="r readme-pane">
          <h4>README</h4>
          <p v-if="loading" style="color:var(--mut)">Carregando…</p>
          <div v-else-if="html" class="readme" v-html="html"></div>
          <p v-else style="color:var(--mut)">{{ readme.status === 'error' ? (readme.message || 'Não foi possível ler o README.') : 'Este repositório não tem README.' }}</p>
        </div>
      </article>
    </div>
  </div>
</template>
