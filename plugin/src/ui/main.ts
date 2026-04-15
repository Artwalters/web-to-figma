import './styles.css'

const urlInput = document.getElementById('url') as HTMLInputElement
const validity = document.querySelector('.validity') as HTMLElement
const segs = document.querySelectorAll<HTMLButtonElement>('.seg')
const importBtn = document.getElementById('import') as HTMLButtonElement
const btnLabel = importBtn.querySelector('.btn-label') as HTMLSpanElement
const btnSpinner = importBtn.querySelector('.btn-spinner') as HTMLSpanElement
const statusEl = document.getElementById('status') as HTMLElement

let viewport = 1440

const validate = (url: string): boolean => {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const setStatus = (kind: 'success' | 'error' | 'info' | null, text: string) => {
  if (!kind) {
    statusEl.hidden = true
    return
  }
  statusEl.hidden = false
  statusEl.dataset.kind = kind
  statusEl.textContent = text
}

const resetBtn = () => {
  btnLabel.textContent = 'Import'
  btnSpinner.hidden = true
  importBtn.disabled = !validate(urlInput.value.trim())
}

urlInput.addEventListener('input', () => {
  const v = urlInput.value.trim()
  if (!v) {
    validity.dataset.state = 'idle'
    importBtn.disabled = true
    return
  }
  const ok = validate(v)
  validity.dataset.state = ok ? 'valid' : 'invalid'
  importBtn.disabled = !ok
})

urlInput.addEventListener('blur', () => {
  const v = urlInput.value.trim()
  if (v && !/^https?:\/\//.test(v)) {
    urlInput.value = 'https://' + v
    urlInput.dispatchEvent(new Event('input'))
  }
})

segs.forEach((btn) => {
  btn.addEventListener('click', () => {
    segs.forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    viewport = Number(btn.dataset.viewport)
  })
})

importBtn.addEventListener('click', () => {
  const url = urlInput.value.trim()
  btnLabel.textContent = 'Rendering...'
  btnSpinner.hidden = false
  importBtn.disabled = true
  setStatus('info', 'Opening page in headless Chromium...')
  parent.postMessage({ pluginMessage: { type: 'render', url, viewport } }, '*')
})

window.onmessage = (e) => {
  const msg = e.data.pluginMessage
  if (!msg) return
  if (msg.type === 'progress') setStatus('info', msg.text)
  if (msg.type === 'success') {
    const fontsNote = msg.missingFonts.length > 0
      ? ` | Missing fonts: ${msg.missingFonts.join(', ')}`
      : ''
    const imgNote = typeof msg.imagesTotal === 'number'
      ? ` (${msg.images}/${msg.imagesTotal} embedded, ${msg.imagesSvgSkipped ?? 0} svg skipped, ${msg.imagesFailed ?? 0} failed)`
      : ''
    setStatus('success', `Imported ${msg.frames} frames. Images${imgNote}${fontsNote}`)
    resetBtn()
  }
  if (msg.type === 'error') {
    setStatus('error', msg.text)
    resetBtn()
  }
}
