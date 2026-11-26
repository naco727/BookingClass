import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { version } from '../package.json'

const releaseNotes = [
  '選課結束後，快速點兩下斜線空堂即可排入正式學生。點一下區塊可開啟編輯。',
  '修正原始時段中間已被預約時，無法在後半段空堂加課的問題。',
  '新版發布後，第一次進入教師後台會顯示版本和更新內容。',
]

export function ReleaseNotice({ userId }: { userId: string }) {
  const storageKey = `bookingclass:release-seen:${userId}:${version}`
  const [visible, setVisible] = useState(() => {
    try { return localStorage.getItem(storageKey) !== '1' } catch { return true }
  })
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!visible || !dialog) return

    const syncSeen = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue === '1') setVisible(false)
    }
    window.addEventListener('storage', syncSeen)
    dialog.showModal()
    return () => {
      window.removeEventListener('storage', syncSeen)
      dialog.close()
    }
  }, [storageKey, visible])

  const dismiss = () => {
    try { localStorage.setItem(storageKey, '1') } catch { /* Storage can be unavailable in private browsing. */ }
    setVisible(false)
  }

  if (!visible) return null

  return createPortal(
    <dialog ref={dialogRef} className="modal release-notice" aria-labelledby="release-notice-title" onCancel={(event) => { event.preventDefault(); dismiss() }}>
      <div className="release-notice-heading">
        <h2 id="release-notice-title">課間更新</h2>
        <span className="release-version">v{version}</span>
      </div>
      <ul>{releaseNotes.map((note) => <li key={note}>{note}</li>)}</ul>
      <button type="button" className="button primary full" onClick={dismiss} autoFocus>我知道了 <Check size={17} /></button>
    </dialog>,
    document.body,
  )
}
