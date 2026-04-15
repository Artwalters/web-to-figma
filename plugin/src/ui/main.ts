import './styles.css'

const urlInput = document.getElementById('url') as HTMLInputElement
const validity = document.querySelector('.validity') as HTMLElement
const segs = document.querySelectorAll<HTMLButtonElement>('.seg')
const importBtn = document.getElementById('import') as HTMLButtonElement

urlInput.addEventListener('input', () => {
  const v = urlInput.value.trim()
  if (!v) {
    validity.dataset.state = 'idle'
    importBtn.disabled = true
    return
  }
  try {
    const u = new URL(v.startsWith('http') ? v : 'https://' + v)
    const ok = u.protocol === 'http:' || u.protocol === 'https:'
    validity.dataset.state = ok ? 'valid' : 'invalid'
    importBtn.disabled = !ok
  } catch {
    validity.dataset.state = 'invalid'
    importBtn.disabled = true
  }
})

segs.forEach((btn) => {
  btn.addEventListener('click', () => {
    segs.forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
  })
})

importBtn.addEventListener('click', () => {
  parent.postMessage({ pluginMessage: { type: 'render', url: urlInput.value } }, '*')
})
