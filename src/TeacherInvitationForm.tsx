import { useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Mail } from 'lucide-react'
import { supabase } from './supabase'

type Result = { email: string; outcome: 'sent' | 'authorized' | 'already_authorized' }

const resultMessages: Record<Result['outcome'], string> = {
  sent: '邀請信已寄出，老師權限已開通。請老師從邀請信設定密碼。',
  authorized: '老師權限已開通。這個帳號已接受邀請，可以直接登入。',
  already_authorized: '這個帳號已有老師權限，可以直接登入。',
}

export function TeacherInvitationForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [canSubmit, setCanSubmit] = useState(true)

  async function invite(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy || !canSubmit) return
    setBusy(true)
    setMessage('')
    setResult(null)
    try {
      const { data, error } = await supabase.functions.invoke<Result>('invite-teacher', { body: { email: email.trim() } })
      if (error) {
        const response = error.context
        const body = response instanceof Response ? await response.json().catch(() => null) : null
        if (response?.status === 401 || response?.status === 403) setCanSubmit(false)
        if (response?.status === 401) setMessage('登入已失效，請重新登入。')
        else setMessage(typeof body?.message === 'string' ? body.message : '無法寄送邀請，請稍後再試。')
        return
      }
      if (!data) throw new Error('Missing invitation response')
      setResult(data)
      setEmail('')
    } catch {
      setMessage('無法確認邀請結果，請用同一個 Email 重試。')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <h2>老師權限管理</h2>
    <p>寄出邀請後，老師可以從信件設定密碼。</p>
    <form className="profile-name-row teacher-invitation-form" onSubmit={invite} aria-busy={busy}>
      <label className="field"><span>受邀老師 Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} disabled={busy || !canSubmit} required /></label>
      <button className="button primary" type="submit" disabled={busy || !canSubmit || !email.trim()}>{busy ? '處理中…' : '寄出邀請並授權'} <Mail size={17} /></button>
    </form>
    {message && <div className="teacher-admin-feedback failure" role="alert">{message}</div>}
    {result && <div className="teacher-admin-feedback" role="status"><Check size={18} /><div><strong>{result.email}</strong>{resultMessages[result.outcome]}</div></div>}
  </>
}
