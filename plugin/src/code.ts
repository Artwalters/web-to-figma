figma.showUI(__html__, { width: 320, height: 480, themeColors: true })

figma.ui.onmessage = (msg) => {
  if (msg.type === 'render') {
    figma.notify('Not implemented yet - Task 12 adds the backend call')
    figma.ui.postMessage({ type: 'error', text: 'Not implemented yet' })
  }
}
