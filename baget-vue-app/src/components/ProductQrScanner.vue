<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { trackingToken } from '../calculation/tracking.js'
const props = defineProps({ disabled: Boolean })
const emit = defineEmits(['scan'])
const input = ref(''), video = ref(null), running = ref(false), error = ref('')
let stream = null, timer = null, generation = 0
function stop() { generation++; running.value = false; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); stream = null; if (video.value) video.value.srcObject = null }
function submit(value = input.value) {
 if (props.disabled) return
 try { const token = trackingToken(value); stop(); error.value = ''; input.value = ''; emit('scan', token) } catch (e) { error.value = e.message }
}
async function start() {
 if (props.disabled || running.value) return
 error.value = ''
 if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { error.value = 'Для камери в додатку відкрийте сайт через HTTPS. Можна відсканувати етикетку звичайною камерою телефона й відкрити посилання.'; return }
 if (!window.BarcodeDetector) { error.value = 'Цей браузер не підтримує сканування всередині додатка. Відкрийте QR звичайною камерою телефона або вставте посилання нижче.'; return }
 const run = ++generation; running.value = true
 try {
  const formats = await window.BarcodeDetector.getSupportedFormats()
  if (run !== generation) return
  if (!formats.includes('qr_code')) throw new Error('QR не підтримується браузером. Скористайтеся звичайною камерою телефона.')
  const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
  const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
  if (run !== generation) { acquired.getTracks().forEach(t => t.stop()); return }
  stream = acquired; await nextTick()
  if (run !== generation || !video.value) return
  video.value.srcObject = stream; await video.value.play()
  async function detect() {
   if (run !== generation) return
   try {
    const codes = video.value?.readyState >= 2 ? await detector.detect(video.value) : []
    if (run !== generation) return
    for (const code of codes) {
     try { trackingToken(code.rawValue); submit(code.rawValue); return } catch { error.value = 'Це не QR виробу. Наведіть камеру на етикетку виробу.' }
    }
   } catch { if (run === generation) { stop(); error.value = 'Камера недоступна. Спробуйте ще раз або відкрийте QR звичайною камерою телефона.' } return }
   if (run === generation) timer = setTimeout(detect, 250)
  }
  if (run === generation) detect()
 } catch (e) { if (run === generation) { stop(); error.value = e.name === 'NotAllowedError' ? 'Дозвольте доступ до камери або відкрийте QR звичайною камерою телефона.' : e.message } }
}
function hidden() { if (document.hidden) stop() }
watch(() => props.disabled, value => { if (value) stop() })
onMounted(() => document.addEventListener('visibilitychange', hidden))
onBeforeUnmount(() => { stop(); document.removeEventListener('visibilitychange', hidden) })
</script>
<template>
 <section class="qr-scanner" aria-label="Сканування QR виробу">
  <button v-if="!running" type="button" :disabled="disabled" @click="start">Сканувати QR камерою</button>
  <button v-else type="button" @click="stop">Зупинити камеру</button>
  <video v-show="running" ref="video" autoplay muted playsinline aria-label="Камера для QR" />
  <form @submit.prevent="submit()"><label>Посилання або код з етикетки<input v-model="input" :disabled="disabled || running" maxlength="2000" autocomplete="off" placeholder="Вставте посилання з QR"></label><button :disabled="disabled || running || !input.trim()">Відкрити виріб</button></form>
  <p v-if="error" role="alert">{{ error }}</p>
 </section>
</template>
<style scoped>
.qr-scanner{padding:12px;border:1px solid #c8dadd;border-radius:9px;margin:12px 0}video{display:block;width:100%;max-width:480px;max-height:45vh;margin:10px auto;background:#17282d;border-radius:8px}form{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-top:8px}label{display:grid;gap:5px;flex:1;min-width:180px;font-size:13px}button,input{font:inherit;box-sizing:border-box;padding:10px;border:1px solid #b9cbd0;border-radius:7px;min-height:44px;max-width:100%}button{cursor:pointer}button:disabled{opacity:.5}input{width:100%}[role=alert]{color:#922;font-size:13px}@media(max-width:600px){input{font-size:16px}}
</style>
