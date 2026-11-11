<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { state, connect, disconnect } from '../store.js'
import { credentials } from '../lib/credentials.js'
const dlg = ref(null), user = ref(''), token = ref(''), remember = ref(false), busy = computed(() => state.loading)
const connected = computed(() => state.phase === 'ready')
watch(() => state.connectOpen, async v => {
  if (v) { user.value = state.conn.user || credentials.user(); token.value = ''; remember.value = credentials.remembered(); await nextTick(); if (!dlg.value.open) dlg.value.showModal() }
  else if (dlg.value?.open) dlg.value.close()
})
async function submit(withToken) { await connect({ user: user.value, token: withToken ? (token.value.trim() || credentials.token() || '') : '', remember: remember.value }); if (!state.error) token.value = '' }
async function leave() { await disconnect(); user.value = ''; token.value = ''; remember.value = false }
const reset = computed(() => state.rate.reset ? new Date(state.rate.reset).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '')
</script>

<template>
  <dialog id="connect" ref="dlg" aria-labelledby="connTitle" @close="state.connectOpen = false" @cancel="!connected && $event.preventDefault()">
    <form @submit.prevent="submit(true)">
      <div class="c-head"><h2 id="connTitle">Conectar ao GitHub</h2>
        <button v-if="connected" type="button" class="x" aria-label="Fechar" @click="state.connectOpen = false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18" /></svg></button></div>
      <p class="lead">O Atlas lê seus repositórios direto da API do GitHub, no seu navegador. Nada passa por servidor nosso.</p>
      <label class="fld"><span>Usuário do GitHub</span><input id="cUser" v-model="user" autocomplete="username" spellcheck="false" placeholder="octocat"></label>
      <label class="fld"><span>Token de acesso <em>(opcional)</em></span>
        <input id="cToken" v-model="token" type="password" autocomplete="off" spellcheck="false" :placeholder="state.conn.hasToken ? 'Token já informado. Deixe vazio para manter.' : 'github_pat_…'"></label>
      <label class="chk"><input id="cRemember" v-model="remember" type="checkbox"> Lembrar o token neste navegador <small>(senão vale só até fechar a aba)</small></label>
      <div class="note">
        <b>Sem token:</b> só repositórios públicos, 60 consultas por hora.<br>
        <b>Com token:</b> inclui os privados do seu usuário e sobe para 5.000 por hora.
        Crie um <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">token fine-grained</a> com acesso somente leitura a <i>Contents</i> e <i>Metadata</i>.
      </div>
      <ul class="trust"><li>O token só é enviado para <span class="mono">api.github.com</span>.</li><li>Nunca vai para URL, log ou arquivo. A página bloqueia conexões para outros domínios.</li><li>Seu inventário fica em cache neste navegador. "Sair" apaga tudo.</li></ul>
      <p v-if="state.error" class="err" role="alert">{{ state.error }}</p>
      <p v-if="connected && state.rate.limit" class="mono small">Cota: {{ state.rate.remaining }} de {{ state.rate.limit }}<template v-if="reset"> · renova às {{ reset }}</template></p>
      <div class="actions">
        <button class="btn pri" type="submit" :disabled="busy || (!user.trim() && !token.trim() && !state.conn.hasToken)">{{ busy ? 'Conectando…' : 'Conectar' }}</button>
        <button class="btn" type="button" :disabled="busy || !user.trim()" @click="submit(false)">Só públicos, sem token</button>
        <button v-if="connected" class="danger" type="button" @click="leave">Sair e apagar dados</button>
      </div>
    </form>
  </dialog>
</template>
