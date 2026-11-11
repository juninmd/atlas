import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
try { const t = JSON.parse(localStorage.getItem('atlas-theme')); if (t) document.documentElement.dataset.theme = t } catch { /* sem preferência salva */ }
createApp(App).mount('#app')
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
