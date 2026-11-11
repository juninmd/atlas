<script setup>
import { ref, watch, computed } from 'vue'
import { filtered, openRepo, resetFilters } from '../store.js'
import RepoCard from './RepoCard.vue'
const shown = ref(24)
watch(filtered, () => shown.value = 24)
const visible = computed(() => filtered.value.slice(0, shown.value))
</script>

<template>
  <div class="view" id="v-grid">
    <div v-if="!filtered.length" class="empty"><h3>Nenhuma aplicação por aqui.</h3><p>Experimente outro termo ou remova os filtros.</p><button class="btn" @click="resetFilters">Explorar tudo</button></div>
    <div v-else class="grid" id="grid"><RepoCard v-for="(r, i) in visible" :key="r.name" :repo="r" :index="i" @open="openRepo" /></div>
    <div v-if="filtered.length > shown" class="more"><button class="btn" id="more" @click="shown += 24">Mostrar mais ({{ filtered.length - shown }})</button></div>
  </div>
</template>
