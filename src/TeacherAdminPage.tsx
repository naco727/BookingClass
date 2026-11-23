import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, LogIn, Mail, ShieldCheck } from 'lucide-react'
import { supabase } from './supabase'

export const teacherAdminUrl = `${import.meta.env.BASE_URL}?mode=admin`

export async function isTeacherAdmin() {
  if (!supabase) return false
  const { data, error } = await supabase.rpc('is_teacher_admin')
  if (error) throw error
  return data === true
}

type Access = 'checking' | 'signed-out' | 'denied' | 'admin' | 'unavailable'
type Result = { email: string; outcome: 'sent' | 'authorized' | 'already_authorized' }

const resultMessages: Record<Result['outcome'], string> = {
  sent: '邀請信已寄出，老師權限已開通。請老師從邀請信設定密碼。',
  authorized: '老師權限已開通。這個帳號已接受邀請，可以直接登入。',
  already_authorized: '這個帳號已有老師權限，可以直接登入。',
}

export default function TeacherAdminPage() {
  const [access, setAccess] = useState<Access>('checking')
  const [loginEmail, setLoginEmail] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    if (!supabase) { setAccess('unavailable'); return }
    const client = supabase
    let active = true
    void (async () => {
      try {
        const { data, error } = await client.auth.getSession()
        if (error) throw error
        const nextAccess = data.session ? await isTeacherAdmin() ? 'admin' : 'denied' : 'signed-out'
        if (active) setAccess(nextAccess)
      } catch {
        if (active) setAccess('unavailable')
      }
    })()
    return () => { active = false }
  }, [])

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password })
      if (error) { setMessage('無法登入，請確認 Email 與密碼。'); return }
      setPassword('')
      setAccess(await isTeacherAdmin() ? 'admin' : 'denied')
    } catch {
      setAccess('unavailable')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setMessage('')
    const response = await supabase?.auth.signOut({ scope: 'local' })
    if (response?.error) { setMessage('登出失敗，請稍後再試。'); return }
    setEmail('')
    setResult(null)
    setAccess('signed-out')
  }

  async function invite(event: FormEvent) {
    event.preventDefault()
    if (!supabase || access !== 'admin' || busy) return
    setBusy(true)
    setMessage('')
    setResult(null)
    try {
      const { data, error } = await supabase.functions.invoke<Result>('invite-teacher', { body: { email: email.trim() } })
      if (error) {
        const response = error.context
        const body = response instanceof Response ? await response.json().catch(() => null) : null
        if (response?.status === 403) setAccess('denied')
        if (response?.status === 401) setAccess('signed-out')
        setMessage(typeof body?.message === 'string' ? body.message : '無法寄送邀請，請稍後再試。')
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

  return <main className="login-page compact-login teacher-admin-page">
    <section className="login-panel" aria-labelledby="teacher-admin-title">
      <div className="teacher-admin-icon"><ShieldCheck size={23} /></div>
      <h2 id="teacher-admin-title">老師權限管理</h2>
      {access === 'checking' && <p role="status">正在確認管理員身分…</p>}
      {access === 'unavailable' && <p role="status">無法載入管理員權限，請稍後重新開啟此頁。</p>}
      {access === 'denied' && <p role="status">此帳號沒有老師邀請權限。</p>}
      {access === 'signed-out' && <form onSubmit={signIn}>
        <label className="field"><span>管理員 Email</span><input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} autoComplete="username" required /></label>
        <label className="field"><span>密碼</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
        <button className="button primary full" disabled={busy}>{busy ? '登入中…' : '登入'} <LogIn size={16} /></button>
      </form>}
      {access === 'admin' && <form onSubmit={invite}>
        <label className="field"><span>受邀老師 Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} disabled={busy} required /></label>
        <button className="button primary full" disabled={busy}>{busy ? '處理中…' : '寄出邀請並授權'} <Mail size={17} /></button>
      </form>}
      {message && <div className="teacher-admin-feedback failure" role="alert">{message}</div>}
      {result && access === 'admin' && <div className="teacher-admin-feedback" role="status"><Check size={18} /><div><strong>{result.email}</strong>{resultMessages[result.outcome]}</div></div>}
      <div className="teacher-admin-nav">
        <a className="text-button" href={import.meta.env.BASE_URL}>返回老師後台</a>
        {(access === 'admin' || access === 'denied') && <button className="text-button" type="button" disabled={busy} onClick={() => void signOut()}>登出</button>}
      </div>
    </section>
  </main>
}
