// Google Picker lets a person choose files from their own Google Drive. It runs in the browser
// and needs a short-lived access token, which our server hands out (drive.file permission only).

let loading: Promise<void> | null = null

export function loadPicker(): Promise<void> {
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const w = window as unknown as { gapi?: { load: (name: string, cb: () => void) => void } }
    const ready = () => w.gapi!.load('picker', () => resolve())
    if (w.gapi) return ready()
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.onload = ready
    script.onerror = () => {
      loading = null
      reject(new Error('Could not load Google Picker. Check your connection and try again.'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export async function pickVideo(opts: { token: string; apiKey: string; appId: string }): Promise<{ id: string; name?: string } | null> {
  await loadPicker()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = (window as unknown as { google: any }).google
  return new Promise((resolve) => {
    const view = new g.picker.DocsView(g.picker.ViewId.DOCS_VIDEOS).setIncludeFolders(false)
    const picker = new g.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(opts.token)
      .setDeveloperKey(opts.apiKey)
      .setAppId(opts.appId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .setCallback((data: any) => {
        if (data.action === g.picker.Action.PICKED) resolve(data.docs?.[0] ?? null)
        else if (data.action === g.picker.Action.CANCEL) resolve(null)
      })
      .build()
    picker.setVisible(true)
  })
}
