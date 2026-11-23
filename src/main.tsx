import { StrictMode, useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { CalendarDays, Check, ChevronRight, Clock3, Copy, DoorOpen, GraduationCap, LogIn, MapPin, Menu, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import './styles.css'
import { supabase } from './supabase'
import { addSlot, approveRegistration, bookSelections, cancelBooking, deleteRegistration, deleteSlot, deleteStudent, getCurrentTeacherSession, getParentAvailability, getPublicBookingStatus, getPublicTeacher, getSettings, getTeacherAvailability, listRegistrations, listSlots, listStudents, lookupStudents, renameLocationLabel, saveSettings, submitRegistration, teacherBookExistingStudent, teacherCreateBooking, teacherSignIn, teacherSignOut, updateBooking, updateSlot, updateStudent, updateTeacherPassword, updateTeacherProfile } from './services'
import type { AvailabilitySlot, Booking, BookingSelection, MaterialPlan, PublicAvailability, PublicStudent, Registration, Region, Settings, Student, TeacherProfile, TeacherSession, Weekday } from './types'

type View = 'home' | 'register' | 'book' | 'teacher'
const navItems: Array<{ id: View; label: string }> = [{ id: 'home', label: '首頁' }, { id: 'register', label: '新生登記' }, { id: 'book', label: '家長選課' }, { id: 'teacher', label: '老師後台' }]
const weekdayLabels: Record<Weekday, string> = { 0: '星期日', 1: '星期一', 2: '星期二', 3: '星期三', 4: '星期四', 5: '星期五', 6: '星期六' }
const formatTimestamp = (value: string) => new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const timeOptions = Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`)
const publicLink = (teacherSlug: string, mode: 'book' | 'register' | 'availability') => {
  const url = new URL(import.meta.env.BASE_URL || '/', window.location.origin)
  url.searchParams.set('teacher', teacherSlug)
  url.searchParams.set('mode', mode)
  return url.toString()
}

function App() {
  const [view, setView] = useState<View>('home')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [authCallback, setAuthCallback] = useState<'invite' | 'recovery' | null>(null)
  const [checkingAuthCallback, setCheckingAuthCallback] = useState(true)
  const [linkTeacher, setLinkTeacher] = useState<TeacherProfile | null>(null)
  const params = new URLSearchParams(window.location.search)
  const teacherSlug = params.get('teacher')
  const linkMode = ['register', 'book', 'availability'].includes(params.get('mode') ?? '') ? params.get('mode') as 'register' | 'book' | 'availability' : null
  const scoped = Boolean(teacherSlug && linkMode)
  useEffect(() => { void getPublicTeacher(teacherSlug ?? 'lin').then(setLinkTeacher) }, [teacherSlug])
  useEffect(() => {
    let active = true
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const queryParams = new URLSearchParams(window.location.search)
    const type = hashParams.get('type') ?? queryParams.get('type')
    const hasAuthToken = hashParams.has('access_token') || hashParams.has('code') || queryParams.has('code')
    const callbackType = type === 'invite' ? 'invite' : type === 'recovery' ? 'recovery' : hasAuthToken ? 'invite' : null
    if (!supabase || !callbackType) { setCheckingAuthCallback(false); return () => { active = false } }
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setAuthCallback(data.session ? callbackType : null)
      setCheckingAuthCallback(false)
    }).catch(() => { if (active) setCheckingAuthCallback(false) })
    return () => { active = false }
  }, [])
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3600) }
  if (checkingAuthCallback) return <div className="app-shell"><div className="scoped-loading">正在確認邀請連結…</div></div>
  if (authCallback) return <div className="app-shell"><TeacherPasswordSetup mode={authCallback} onComplete={() => { window.history.replaceState({}, document.title, window.location.pathname); setAuthCallback(null) }} notify={notify} />{toast && <div className="toast"><Check size={17} />{toast}</div>}</div>
  if (scoped && !linkTeacher) return <div className="app-shell"><div className="scoped-loading">正在載入老師專屬頁面…</div></div>
  if (!scoped) return <div className="app-shell"><TeacherPage notify={notify} />{toast && <div className="toast"><Check size={17} />{toast}</div>}</div>
  return <div className="app-shell">
    <Header view={view} onNavigate={(next) => { setView(next); setMobileOpen(false) }} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} scoped={scoped} teacher={linkTeacher} />
    <main>
      {scoped && linkMode === 'register' && <RegistrationPage notify={notify} teacher={linkTeacher} />}
      {scoped && linkMode === 'book' && <ParentBookingPage notify={notify} teacher={linkTeacher} />}
      {scoped && linkMode === 'availability' && <TeacherAvailabilityPage notify={notify} teacher={linkTeacher} />}
    </main>
    <footer><span>課間 Between Classes</span><span>給每一次相遇一個剛好的時間</span><span>本機 MVP · Supabase ready</span></footer>
    {toast && <div className="toast"><Check size={17} />{toast}</div>}
  </div>
}

function Header({ view, onNavigate, mobileOpen, setMobileOpen, scoped, teacher }: { view: View; onNavigate: (view: View) => void; mobileOpen: boolean; setMobileOpen: (open: boolean) => void; scoped: boolean; teacher: TeacherProfile | null }) {
  return <header className="topbar">
    <button className="brand" onClick={() => onNavigate('home')}><span className="brand-mark"><img className="brand-image" src={`${import.meta.env.BASE_URL}app-icon.jpg`} alt="" /></span><span>課間<small>BETWEEN CLASSES</small></span></button>
    {scoped ? <div className="scoped-caption"><span className="live-dot" />{teacher?.displayName} 專屬家長頁面</div> : <><button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="開啟選單"><Menu /></button><nav className={mobileOpen ? 'nav mobile-open' : 'nav'}>{navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => onNavigate(item.id)}>{item.label}{item.id === 'teacher' && <ShieldCheck size={14} />}</button>)}</nav></>}
  </header>
}

function Home({ onNavigate }: { onNavigate: (view: View) => void }) {
  return <div className="home-page">
    <section className="hero page-width">
      <div className="hero-copy"><div className="eyebrow"><span className="live-dot" /> 家教時段管理 · 台北市</div><h1>把每一次<br /><em>上課，排得剛好。</em></h1><p>專為小班家教設計的安心選課空間。老師掌握每個空檔，家長只看見適合孩子的時間。</p><div className="hero-actions"><button className="button primary" onClick={() => onNavigate('book')}>查看可選時段 <ChevronRight size={17} /></button><button className="button quiet" onClick={() => onNavigate('register')}>我是新學生</button></div><div className="hero-note"><span>✦</span> 不用下載 App，手機就能完成選課</div></div>
      <div className="hero-visual"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="calendar-card"><div className="calendar-top"><span>FEB 2025</span><CalendarDays size={17} /></div><div className="calendar-grid">{['一','二','三','四','五','六','日'].map((d) => <span className="day-label" key={d}>{d}</span>)}{Array.from({ length: 35 }, (_, i) => <span className={i === 18 ? 'calendar-day selected' : i === 15 || i === 21 ? 'calendar-day has-dot' : 'calendar-day'} key={i}>{i < 3 ? '' : i - 2}</span>)}</div><div className="time-pill"><Clock3 size={15} /><span>今天 14:00 — 16:00</span><b>已預約</b></div></div><div className="floating-note note-top"><span className="avatar">林</span><div><strong>林老師</strong><small>新增一個可選時段</small></div><Plus size={16} /></div><div className="floating-note note-bottom"><span className="check-badge"><Check size={14} /></span><div><strong>預約完成</strong><small>陳昀安 · 天母</small></div></div></div>
    </section>
    <section className="trust-strip"><div className="page-width trust-inner"><span>簡單三步，開始上課</span><div><b>01</b><span>新生登記</span></div><ChevronRight /><div><b>02</b><span>老師審核</span></div><ChevronRight /><div><b>03</b><span>家長選課</span></div></div></section>
    <section className="feature-section page-width"><div className="section-intro"><div className="eyebrow">為每個人，留一點餘裕</div><h2>清楚的時間，<br /><em>放心的選擇。</em></h2></div><div className="feature-grid"><Feature icon={<Users />} title="一人一份課表" text="每個孩子只會看見自己的可選空檔，聯絡資料留在老師手上。" /><Feature icon={<MapPin />} title="地區自動判斷" text="天母、北投分開管理，第一筆預約會穩定鎖定時段地區。" /><Feature icon={<ShieldCheck />} title="先到先得" text="送出時即時檢查，成功或失敗都清楚告訴你下一步。" /></div></section>
  </div>
}
function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="feature-card"><div className="icon-box">{icon}</div><h3>{title}</h3><p>{text}</p></div> }

function RegistrationPage({ notify, teacher }: { notify: (message: string) => void; teacher: TeacherProfile | null }) {
  const [submitted, setSubmitted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', grade: '', school: '', focus: '', location: '', phone: '', material: '自編' as const, note: '' })
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const onSubmit = async (event: FormEvent) => { event.preventDefault(); setLoading(true); try { await submitRegistration(form, teacher?.id ?? 'teacher-a'); setSubmitted(true); notify('已送出新生登記'); } catch (error) { notify(error instanceof Error ? error.message : '送出失敗') } finally { setLoading(false) } }
  const copyReminder = async () => { const message = `老師好，我已完成新生登記。再麻煩確認謝謝。\n學生姓名：${form.name}`; await navigator.clipboard?.writeText(message); setCopied(true); notify('提醒文字已複製，可貼到 LINE 傳給老師') }
  if (submitted) return <div className="page-width centered-page"><div className="success-card"><div className="success-icon"><Check /></div><div className="eyebrow">REGISTRATION RECEIVED</div><h1>資料已收到，<br /><em>接下來交給老師。</em></h1><p>已記錄學生資訊，請等候老師審核與回覆。<br />老師完成建檔後，會再通知您開始選課。</p><div className="receipt"><span>登記時間</span><b>{formatTimestamp(new Date().toISOString())}</b></div><div className="reminder-card"><div><b>傳給老師做提醒</b><small>複製後貼到 LINE 或訊息中</small></div><button className="copy-message-button" onClick={copyReminder}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? '已複製' : '複製提醒文字'}</button><pre>老師好，我已完成新生登記。再麻煩確認謝謝。{`\n`}學生姓名：{form.name}</pre></div><button className="button primary" onClick={() => { setSubmitted(false); setCopied(false) }}>再登記一位學生</button></div></div>
  return <div className="page-width form-page"><div className="page-heading"><div><div className="eyebrow">NEW STUDENT / 01</div><h1>先讓我們認識<br /><em>你的孩子。</em></h1></div><p>填寫後送出，老師會在確認學生資訊與地區後，建立正式檔案。</p></div><form className="form-card" onSubmit={onSubmit}><div className="form-section"><div className="section-number">01</div><div className="form-section-content"><h2>學生基本資料</h2><p className="helper">這些資訊只會提供給老師查看。</p><div className="form-grid two"><Field label="學生姓名" required><input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="例如：陳昀安" /></Field><Field label="年級" required><select required value={form.grade} onChange={(e) => update('grade', e.target.value)}><option value="">請選擇年級</option>{['小一','小二','小三','小四','小五','小六','國一','國二','國三','高一','高二','高三'].map((grade) => <option key={grade}>{grade}</option>)}</select></Field></div><div className="form-grid two"><Field label="學校" required><input required value={form.school} onChange={(e) => update('school', e.target.value)} placeholder="例如：蘭雅國中" /></Field><Field label="欲加強項目" required><input required value={form.focus} onChange={(e) => update('focus', e.target.value)} placeholder="例如：數學、理化" /></Field></div></div></div><div className="form-section"><div className="section-number">02</div><div className="form-section-content"><h2>上課與聯絡</h2><p className="helper">請填寫完整上課地址（不用填樓層）；地區會由老師審核後標記。</p><div className="form-grid two"><Field label="詳盡地址（無須樓層）" required><input required value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="例如：台北市士林區中山北路六段 123 號" /></Field><Field label="家長聯絡電話" required><input required type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="0912-345-678" /></Field></div><Field label="講義安排" required><div className="choice-row">{(['自編','已有','購買市售'] as const).map((item) => <label className={form.material === item ? 'choice selected' : 'choice'} key={item}><input type="radio" name="material" checked={form.material === item} onChange={() => update('material', item)} />{item}</label>)}</div></Field><Field label="給老師的備註"><textarea value={form.note} onChange={(e) => update('note', e.target.value)} placeholder="有想特別告訴老師的事嗎？（選填）" rows={3} /></Field></div></div><div className="form-submit"><span><ShieldCheck size={16} /> 資料會安全留存，僅供課務使用</span><button className="button primary" disabled={loading}>{loading ? '送出中…' : '送出新生登記'} <ChevronRight size={17} /></button></div></form></div>
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) { return <label className="field"><span>{label}{required && <i> *</i>}</span>{children}</label> }

function TimeWheels({ value, onChange, options }: { value: string; onChange: (value: string) => void; options?: string[] }) {
  const safeOptions = Array.from(new Set((options ?? timeOptions).filter((item) => /^\d{2}:\d{2}$/.test(item)))).sort((a, b) => toMinutes(a) - toMinutes(b))
  const selected = safeOptions.includes(value) ? value : safeOptions[0] ?? '00:00'
  const [selectedHour, selectedMinute] = selected.split(':')
  const hours = Array.from(new Set(safeOptions.map((item) => item.slice(0, 2))))
  const minutes = Array.from(new Set(safeOptions.map((item) => item.slice(3))))
  const hourRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const minuteRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  useEffect(() => {
    // Scroll only the wheel. Moving the page or dialog can hide its header.
    const frame = window.requestAnimationFrame(() => {
      for (const button of [hourRefs.current[selectedHour], minuteRefs.current[selectedMinute]]) {
        const wheel = button?.parentElement
        if (button && wheel) {
          wheel.scrollTop = button.offsetTop - (wheel.clientHeight - button.offsetHeight) / 2
        }
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selectedHour, selectedMinute])
  if (!safeOptions.length) return <div className="picker-empty">目前沒有符合條件的時間</div>
  const choose = (part: 'hour' | 'minute', next: string) => {
    const candidate = part === 'hour' ? `${next}:${selectedMinute}` : `${selectedHour}:${next}`
    if (safeOptions.includes(candidate)) { onChange(candidate); return }
    const compatible = part === 'hour' ? safeOptions.find((item) => item.slice(0, 2) === next) : undefined
    if (compatible) onChange(compatible)
  }
  return <div className="picker-time-wheels"><div className="picker-wheel-column"><span className="picker-wheel-label">時</span><div className="picker-wheel" role="listbox" aria-label="選擇小時">{hours.map((hour) => <button type="button" role="option" aria-selected={hour === selectedHour} className={hour === selectedHour ? 'selected' : ''} key={hour} ref={(element) => { hourRefs.current[hour] = element }} onClick={() => choose('hour', hour)}>{hour}</button>)}</div></div><div className="picker-wheel-column"><span className="picker-wheel-label">分</span><div className="picker-wheel" role="listbox" aria-label="選擇分鐘">{minutes.map((minute) => <button type="button" role="option" aria-selected={minute === selectedMinute} disabled={!safeOptions.includes(`${selectedHour}:${minute}`)} className={minute === selectedMinute ? 'selected' : ''} key={minute} ref={(element) => { minuteRefs.current[minute] = element }} onClick={() => choose('minute', minute)}>{minute}</button>)}</div></div></div>
}

function PickerDialog({ label, onDismiss, children }: { label: string; onDismiss: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return createPortal(
    <dialog ref={dialogRef} className="picker-dialog" aria-label={label} onCancel={(event) => { event.preventDefault(); onDismiss() }}>
      {children}
    </dialog>,
    document.body,
  )
}

function TimePicker({ value, onChange, options, disabled = false }: { value: string; onChange: (value: string) => void; options?: string[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const optionKey = options?.join('|') ?? 'all-times'
  useEffect(() => {
    if (options?.length && !options.includes(value)) onChange(options[0])
  }, [optionKey, value])
  return <div className="custom-picker time-picker">
    <button type="button" className="custom-picker-trigger" disabled={disabled || options?.length === 0} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setDraft(value); setOpen(true) }}>
      <Clock3 size={15} /><span>{value || '選擇時間'}</span><ChevronRight size={14} />
    </button>
    {open && <PickerDialog label="選擇時間" onDismiss={() => setOpen(false)}>
      <div className="picker-header">
        <div><b>選擇時間</b><small>24 小時制・每 15 分鐘</small></div>
        <button type="button" className="picker-control" aria-label="取消選擇" onClick={() => setOpen(false)}><X size={18} /></button>
      </div>
      <TimeWheels value={draft} options={options} onChange={setDraft} />
      <button type="button" className="picker-done" onClick={() => { onChange(draft); setOpen(false) }}>完成</button>
    </PickerDialog>}
  </div>
}

const padNumber = (value: number) => String(value).padStart(2, '0')
const localDate = (value: Date) => `${value.getFullYear()}-${padNumber(value.getMonth() + 1)}-${padNumber(value.getDate())}`
const toLocalDateTime = (value: string) => {
  const date = new Date(value)
  return `${localDate(date)}T${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

const dateFromInput = (value: string) => {
  const [datePart, timePart = '09:00'] = value.split('T')
  const date = datePart || localDate(new Date())
  const [year, month] = date.split('-').map(Number)
  return { date, time: timePart.slice(0, 5) || '09:00', month: new Date(year, (month || 1) - 1, 1) }
}

function DateTimePicker({ label, value, minimum, onChange }: {
  label: string
  value: string
  minimum: 'today' | { after: string }
  onChange: (value: string) => void
}) {
  const initial = dateFromInput(value)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'date' | 'time'>('date')
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time)
  const [month, setMonth] = useState(initial.month)
  const stepHeading = useRef<HTMLElement>(null)
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstDay = month.getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const [minDate, cutoff] = minimum === 'today' ? [localDate(new Date()), ''] : minimum.after.split('T')
  const firstDayTimes = timeOptions.filter((option) => option > cutoff)
  const timesFor = (day: string) => {
    if (day < minDate) return []
    return day === minDate ? firstDayTimes : timeOptions
  }
  const availableTimes = timesFor(date)
  const canGoBack = localDate(month).slice(0, 7) > minDate.slice(0, 7)

  useEffect(() => {
    if (open) stepHeading.current?.focus({ preventScroll: true })
  }, [open, step])

  const start = () => {
    const earliestDate = minimum === 'today' ? localDate(new Date()) : minDate
    setDate(initial.date)
    setTime(timeOptions.includes(initial.time) ? initial.time : `${initial.time.slice(0, 2)}:${padNumber(Math.floor(Number(initial.time.slice(3)) / 15) * 15)}`)
    setMonth(initial.date < earliestDate ? dateFromInput(earliestDate).month : initial.month)
    setStep('date')
    setOpen(true)
  }
  const chooseDate = (day: string) => {
    const options = timesFor(day)
    if (!options.length) return
    setDate(day)
    setTime((current) => options.includes(current) ? current : options[0])
    setStep('time')
  }
  const dismiss = () => setOpen(false)
  const displayValue = `${initial.date.replaceAll('-', '/')} ${initial.time}`

  return <div className="field">
    <span>{label}</span>
    <button type="button" className="custom-picker-trigger" aria-label={`${label} ${displayValue}`} aria-haspopup="dialog" aria-expanded={open} onClick={start}>
      <CalendarDays size={15} /><span>{displayValue}</span><ChevronRight size={14} />
    </button>
    {open && <PickerDialog label={label} onDismiss={dismiss}>
      <div className="picker-header">
        <div>
          <b tabIndex={-1} ref={stepHeading}>{step === 'date' ? '選擇日期' : '選擇時間'}</b>
          <small>{step === 'time' ? '24 小時制・每 15 分鐘' : minimum === 'today' ? '開始日期最早為今天' : '結束時間必須晚於開始時間'}</small>
        </div>
        <button type="button" className="picker-control" aria-label="取消選擇" onClick={dismiss}><X size={18} /></button>
      </div>
      {step === 'date' ? <>
        <div className="picker-calendar-head">
          <button type="button" className="picker-control" aria-label="上個月" disabled={!canGoBack} onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}>‹</button>
          <b>{year} 年 {monthIndex + 1} 月</b>
          <button type="button" className="picker-control" aria-label="下個月" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}>›</button>
        </div>
        <div className="picker-calendar-week">{['日', '一', '二', '三', '四', '五', '六'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="picker-calendar-grid">
          {Array.from({ length: firstDay }, (_, index) => <span key={`empty-${index}`} />)}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const day = index + 1
            const dayValue = localDate(new Date(year, monthIndex, day))
            const disabled = timesFor(dayValue).length === 0
            return <button type="button" key={day} aria-pressed={!disabled && date === dayValue} disabled={disabled} className="calendar-picker-day" onClick={() => chooseDate(dayValue)}>{day}</button>
          })}
        </div>
      </> : <>
        <button type="button" className="picker-selected-date" onClick={() => setStep('date')}>
          <Check size={16} aria-hidden="true" />
          <time dateTime={date}>{date.replaceAll('-', '/')}</time>
          <span>更改日期</span>
        </button>
        <TimeWheels value={time} options={availableTimes} onChange={setTime} />
        <button type="button" className="picker-done confirm" disabled={!availableTimes.includes(time)} onClick={() => { onChange(`${date}T${time}`); dismiss() }}>完成</button>
      </>}
    </PickerDialog>}
  </div>
}

function ParentBookingPage({ notify, teacher }: { notify: (message: string) => void; teacher: TeacherProfile | null }) {
  const [name, setName] = useState('')
  const [matches, setMatches] = useState<PublicStudent[]>([])
  const [student, setStudent] = useState<PublicStudent | null>(null)
  const [availability, setAvailability] = useState<PublicAvailability[]>([])
  const [selected, setSelected] = useState<Record<string, BookingSelection>>({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: number; rejected: number } | null>(null)
  const teacherId = teacher?.id ?? 'teacher-a'
  const [bookingOpen, setBookingOpen] = useState<boolean | null>(null)
  useEffect(() => { let active = true; setBookingOpen(null); void getPublicBookingStatus(teacherId).then((value) => { if (active) setBookingOpen(value) }).catch((error) => { if (active) { setBookingOpen(false); notify(error instanceof Error ? error.message : '無法確認選課期間') } }); return () => { active = false } }, [teacherId])
  const search = async (event: FormEvent) => { event.preventDefault(); setLoading(true); setMatches([]); setStudent(null); try { const rows = await lookupStudents(name, teacherId); setMatches(rows); if (rows.length === 0) notify('找不到符合的正式學生，請確認姓名或聯絡老師') } catch (error) { notify(error instanceof Error ? error.message : '查詢失敗') } finally { setLoading(false) } }
  const chooseStudent = async (item: PublicStudent) => { setStudent(item); setMatches([]); setLoading(true); try { setAvailability(await getParentAvailability(item.id, teacherId)) } catch (error) { notify(error instanceof Error ? error.message : '讀取時段失敗') } finally { setLoading(false) } }
  const refresh = async () => { if (!student) return; setLoading(true); try { setAvailability(await getParentAvailability(student.id, teacherId)); setSelected({}); notify('已更新最新可選時段') } finally { setLoading(false) } }
  const submit = async () => { const selections = Object.values(selected); if (!selections.length) { notify('請先選擇至少一個時段'); return } const invalid = selections.some((selection) => { const slot = availability.find((item) => item.id === selection.slotId); return !slot?.segments.some((segment) => isValidBookingRange(selection.start, selection.end, segment)) }); if (invalid) { notify('上課時間必須完整落在目前可選空檔內，請重新選擇'); return } setLoading(true); try { const response = await bookSelections(student!.id, selections, teacherId); setResult({ success: response.bookings.length, rejected: response.rejected.length }); setSelected({}); await refresh() } catch (error) { notify(error instanceof Error ? error.message : '選課失敗') } finally { setLoading(false) } }
  return <div className="page-width booking-page"><div className="page-heading booking-heading compact-page-heading"><div><div className="eyebrow">PARENT COURSE SELECTION</div><h1>家長選課</h1></div></div>{bookingOpen === null ? <div className="empty-state"><Clock3 size={25} /><h3>確認選課期間中…</h3></div> : !bookingOpen ? <div className="booking-closed-state"><Clock3 size={30} /><h2>不在選課期間</h2><p>目前無法選課，請依老師通知的時間再回來。</p></div> : !student ? <div className="lookup-card"><h2>輸入學生姓名</h2><form onSubmit={search} className="lookup-form"><input value={name} onChange={(e) => setName(e.target.value)} required placeholder="學生姓名" autoComplete="off" /><button className="button primary" disabled={loading}>查詢 <ChevronRight size={17} /></button></form>{matches.length > 0 && <div className="match-list"><div className="match-label">同名學生請用聯絡方式末三碼確認</div>{matches.map((item) => <button className="match-row" key={item.id} onClick={() => chooseStudent(item)}><span className="avatar">{item.name.slice(0, 1)}</span><span><b>{item.name}</b><small>{item.region} · 末三碼 {item.phoneSuffix}</small></span><ChevronRight size={17} /></button>)}</div>}<div className="privacy-note"><ShieldCheck size={16} /><span>只顯示符合的學生與可選時段。</span></div></div> : <div className="booking-workspace"><div className="selected-student"><div><span className="eyebrow">CURRENT STUDENT</span><h2>{student.name} <span>{student.region}</span></h2><p>聯絡方式末三碼 · {student.phoneSuffix}</p></div><button className="button quiet" onClick={() => { setStudent(null); setAvailability([]) }}>切換學生</button></div><div className="availability-toolbar"><div><h2>可選時段</h2></div><button className="refresh-button" onClick={refresh}><RefreshCw size={16} className={loading ? 'spin' : ''} /> 更新</button></div>{result && <div className="result-banner"><Check size={18} /><span>已成功選課 {result.success} 段{result.rejected ? `，${result.rejected} 段已被其他人先選走。` : ''}</span><button onClick={() => setResult(null)}><X size={16} /></button></div>}{availability.length ? <div className="slot-list">{availability.map((slot) => <BookableSlot key={slot.id} slot={slot} selection={selected[slot.id]} onChange={(selection) => setSelected((current) => selection ? { ...current, [slot.id]: selection } : Object.fromEntries(Object.entries(current).filter(([id]) => id !== slot.id)))} />)}</div> : <div className="empty-state"><CalendarDays size={25} /><h3>目前沒有可選時段</h3></div>}<div className="booking-submit"><div><b>{Object.keys(selected).length}</b> 個時段</div><button className="button primary" disabled={loading || !Object.keys(selected).length} onClick={submit}>{loading ? '確認中…' : '送出選課'} <Check size={17} /></button></div></div>}</div>
}

function TeacherAvailabilityPage({ notify, teacher }: { notify: (message: string) => void; teacher: TeacherProfile | null }) {
  const [slots, setSlots] = useState<PublicAvailability[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { void getTeacherAvailability(teacher?.id ?? 'teacher-a').then(setSlots).catch((error) => notify(error instanceof Error ? error.message : '讀取老師課表失敗')).finally(() => setLoading(false)) }, [teacher?.id])
  const daySlots = (weekday: Weekday) => slots.filter((slot) => slot.weekday === weekday)
  return <div className="public-availability-page"><div className="availability-hero"><div className="availability-icon"><CalendarDays size={25} /></div><div><span className="eyebrow">TEACHER AVAILABILITY</span><h1>{teacher?.displayName ?? '老師'} 的空堂時段</h1><p>以下是老師目前開放的固定星期課表，實際可選時間會依資料庫即時更新。</p></div></div>{loading ? <div className="public-empty">正在載入目前空堂…</div> : slots.length === 0 ? <div className="public-empty"><Clock3 size={28} /><h2>目前不開放</h2><p>老師目前沒有可提供的空堂時段。</p></div> : <div className="public-week-grid">{(Object.entries(weekdayLabels) as Array<[string, string]>).map(([value, label]) => { const entries = daySlots(Number(value) as Weekday); return <section className="public-day-card" key={value}><div className="public-day-heading"><b>{label.replace('星期', '週')}</b><span>{entries.length ? `${entries.length} 段` : '不開放'}</span></div>{entries.length ? entries.flatMap((slot) => slot.segments.map((segment) => <div className="public-open-time" key={`${slot.id}-${segment.start}`}><span>{segment.start}–{segment.end}</span>{(slot.effectiveRegion || slot.presetRegion) && <small>{slot.effectiveRegion || slot.presetRegion}適用</small>}</div>)) : <p>不開放</p>}</section>})}</div>}</div>
}

function TeacherPasswordSetup({ mode, onComplete, notify }: { mode: 'invite' | 'recovery'; onComplete: () => void; notify: (message: string) => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 8) { notify('新密碼至少需要 8 個字元'); return }
    if (password !== confirmation) { notify('兩次輸入的密碼不一致'); return }
    setLoading(true)
    try {
      await updateTeacherPassword(password)
      await supabase?.auth.signOut()
      notify('密碼已設定完成，請使用新密碼登入老師後台')
      window.setTimeout(onComplete, 500)
    } catch (error) {
      notify(error instanceof Error ? error.message : '密碼設定失敗，請重新開啟邀請信')
    } finally { setLoading(false) }
  }
  return <div className="login-page compact-login"><div className="login-panel"><div className="login-brand-mark"><img className="brand-image" src={`${import.meta.env.BASE_URL}app-icon.jpg`} alt="課間" /></div><div className="eyebrow">{mode === 'invite' ? 'TEACHER INVITATION' : 'TEACHER PASSWORD'}</div><h2>設定老師後台密碼</h2><p className="auth-help">請設定之後登入老師後台使用的密碼。</p><form onSubmit={submit}><Field label="新密碼"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></Field><Field label="再次輸入密碼"><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} autoComplete="new-password" required /></Field><button className="button primary full" disabled={loading}>{loading ? '儲存中…' : '儲存密碼並前往登入'} <Check size={17} /></button></form></div></div>
}

function BookableSlot({ slot, selection, onChange }: { slot: PublicAvailability; selection?: BookingSelection; onChange: (selection?: BookingSelection) => void }) { const [segmentIndex, setSegmentIndex] = useState(0); const segment = slot.segments[segmentIndex] ?? slot.segments[0]; const start = selection?.start ?? segment.start; const end = selection?.end ?? segment.end; const segmentTimes = timeOptions.filter((time) => withinTime(time, segment.start, segment.end)); const startOptions = segmentTimes.filter((time) => toMinutes(time) < toMinutes(end)); const endOptions = segmentTimes.filter((time) => toMinutes(time) > toMinutes(start)); const updateRange = (nextStart: string, nextEnd: string) => { if (isValidBookingRange(nextStart, nextEnd, segment)) onChange({ slotId: slot.id, start: nextStart, end: nextEnd }) }; return <div className={selection ? 'book-slot selected' : 'book-slot'}><div className="slot-info"><label className="slot-check"><input type="checkbox" checked={Boolean(selection)} onChange={(e) => onChange(e.target.checked ? { slotId: slot.id, start: segment.start, end: segment.end } : undefined)} /><span /></label><div><div className="slot-date">{weekdayLabels[slot.weekday]} {slot.effectiveRegion && <span className="region-lock"><MapPin size={12} />{slot.effectiveRegion}限定</span>}</div><h3>{slot.segments.map((gap) => `${gap.start} — ${gap.end}`).join('　')}</h3><p>{slot.note || '老師開放時段'} · 目前顯示可選空檔</p></div></div>{selection && <div className="slot-editor">{slot.segments.length > 1 && <label className="slot-control"><span>空檔</span><TimePicker value={segment.start} options={slot.segments.map((gap) => gap.start)} onChange={(nextStart) => { const next = slot.segments.findIndex((gap) => gap.start === nextStart); if (next >= 0) { setSegmentIndex(next); onChange({ slotId: slot.id, start: slot.segments[next].start, end: slot.segments[next].end }) } }} /></label>}<label className="slot-control"><span>開始</span><TimePicker value={start} options={startOptions} onChange={(nextStart) => updateRange(nextStart, end)} /></label><span className="slot-connector">至</span><label className="slot-control"><span>結束</span><TimePicker value={end} options={endOptions} onChange={(nextEnd) => updateRange(start, nextEnd)} /></label></div>}</div> }
const toMinutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute }
const fromMinutes = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
const withinTime = (time: string, start: string, end: string) => toMinutes(time) >= toMinutes(start) && toMinutes(time) <= toMinutes(end)
const isValidBookingRange = (start: string, end: string, segment: { start: string; end: string }) => toMinutes(start) >= toMinutes(segment.start) && toMinutes(end) <= toMinutes(segment.end) && toMinutes(start) < toMinutes(end)
const freeSegmentsForSlot = (slot: AvailabilitySlot) => { const occupied = slot.bookings.filter((booking) => booking.status === 'confirmed').sort((a, b) => toMinutes(a.start) - toMinutes(b.start)); const segments: Array<{ start: string; end: string }> = []; let cursor = toMinutes(slot.start); for (const booking of occupied) { if (toMinutes(booking.start) > cursor) segments.push({ start: fromMinutes(cursor), end: booking.start }); cursor = Math.max(cursor, toMinutes(booking.end)) } if (cursor < toMinutes(slot.end)) segments.push({ start: fromMinutes(cursor), end: slot.end }); return segments.filter((segment) => toMinutes(segment.end) - toMinutes(segment.start) > 30) }

function TeacherPage({ notify }: { notify: (message: string) => void }) {
  const [loggedIn, setLoggedIn] = useState(false)
  const [session, setSession] = useState<TeacherSession | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  useEffect(() => { let active = true; void getCurrentTeacherSession().then((current) => { if (!active) return; if (current) { setSession(current); setLoggedIn(true) } }).catch((error) => notify(error instanceof Error ? error.message : '登入狀態確認失敗')).finally(() => { if (active) setCheckingSession(false) }); return () => { active = false } }, [])
  const signIn = async (event: FormEvent) => { event.preventDefault(); setLoading(true); try { const nextSession = await teacherSignIn(email, password); setSession(nextSession); setLoggedIn(true); notify(`${nextSession.displayName} 登入成功`) } catch (error) { notify(error instanceof Error ? error.message : '登入失敗') } finally { setLoading(false) } }
  if (checkingSession) return <div className="compact-login"><div className="login-panel"><div className="eyebrow">TEACHER ACCESS</div><h2>確認登入狀態…</h2></div></div>
  if (!loggedIn) return <div className="login-page compact-login"><div className="login-panel"><div className="login-brand-mark"><img className="brand-image" src={`${import.meta.env.BASE_URL}app-icon.jpg`} alt="課間" /></div><div className="eyebrow">TEACHER ACCESS</div><h2>登入老師後台</h2><form onSubmit={signIn}><Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field><Field label="密碼"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field><button className="button primary full" disabled={loading}>{loading ? '登入中…' : '登入後台'} <LogIn size={17} /></button></form></div></div>
  return <TeacherDashboard session={session!} onProfileChange={setSession} notify={notify} onLogout={async () => { await teacherSignOut(); setSession(null); setLoggedIn(false) }} />
}

function TeacherDashboard({ session, onProfileChange, notify, onLogout }: { session: TeacherSession; onProfileChange: (session: TeacherSession) => void; notify: (message: string) => void; onLogout: () => void }) {
  const [tab, setTab] = useState<'overview' | 'students' | 'schedule' | 'settings'>('overview')
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const reload = async () => { setLoading(true); try { const [r, s, sl, st] = await Promise.all([listRegistrations(session.id), listStudents(session.id), listSlots(session.id), getSettings(session.id)]); setRegistrations(r); setStudents(s); setSlots(sl); setSettings(st) } catch (error) { notify(error instanceof Error ? error.message : '資料載入失敗') } finally { setLoading(false) } }
  useEffect(() => { void reload() }, [])
  const pending = registrations.filter((item) => item.status === 'pending')
  const bookings = slots.flatMap((slot) => slot.bookings)
  const sideItems: Array<{ id: typeof tab; label: string; Icon: typeof DoorOpen }> = [{ id: 'overview', label: '總覽', Icon: DoorOpen }, { id: 'students', label: '學生檔案', Icon: Users }, { id: 'schedule', label: '固定課表', Icon: CalendarDays }, { id: 'settings', label: '搶課設定', Icon: Clock3 }]
  const bookingWindowOpen = Boolean(settings && Date.now() >= Date.parse(settings.bookingOpen) && Date.now() <= Date.parse(settings.bookingClose))
  return <div className="teacher-shell"><aside className="teacher-sidebar"><div className="teacher-logo"><span className="brand-mark"><img className="brand-image" src={`${import.meta.env.BASE_URL}app-icon.jpg`} alt="" /></span><b>課間</b></div><div className="teacher-profile"><span className="avatar large">{session.displayName.slice(0, 1)}</span><div><b>{session.displayName}</b><small>專屬教學後台</small></div></div><div className="side-nav">{sideItems.map(({ id, label, Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={17} />{label}{id === 'students' && pending.length > 0 && <b className="nav-count">{pending.length}</b>}</button>)}</div><button className="logout" onClick={onLogout}>登出 <LogIn size={15} /></button></aside><section className="teacher-content"><div className="teacher-top"><div><span className="eyebrow">TEACHER CONSOLE · {session.displayName}</span><h1>{tab === 'overview' ? `早安，${session.displayName}。` : tab === 'students' ? '學生檔案' : tab === 'schedule' ? '每週固定課表' : '搶課設定'}</h1></div><div className="top-actions"><span className="status-pill"><span className="live-dot" /> 系統運作中</span><button className="icon-button" onClick={reload} aria-label="重新整理"><RefreshCw size={17} className={loading ? 'spin' : ''} /></button></div></div>{tab === 'overview' && <Overview registrations={registrations} students={students} slots={slots} bookings={bookings} onReview={() => setTab('students')} />}{tab === 'students' && <StudentsTab registrations={registrations} students={students} tagOptions={settings?.tagOptions ?? []} teacherId={session.id} reload={reload} notify={notify} />}{tab === 'schedule' && <ScheduleTabV2 slots={slots} students={students} regionOptions={settings?.tagOptions ?? []} teacherId={session.id} bookingWindowOpen={bookingWindowOpen} reload={reload} notify={notify} />}{tab === 'settings' && settings && <SettingsTab settings={settings} session={session} onProfileChange={onProfileChange} onSettingsChange={setSettings} reload={reload} notify={notify} />}</section><TeacherBottomNav tab={tab} setTab={setTab} pendingCount={pending.length} /></div>
}

function Overview({ registrations, students, slots, bookings, onReview }: { registrations: Registration[]; students: Student[]; slots: AvailabilitySlot[]; bookings: Booking[]; onReview: () => void }) { const openSlots = slots.filter((slot) => slot.open).length; return <div className="overview"><div className="metric-grid"><Metric label="待審核新生" value={registrations.filter((item) => item.status === 'pending').length} suffix="筆" accent="orange" /><Metric label="正式學生" value={students.filter((item) => item.active).length} suffix="位" accent="teal" /><Metric label="已預約課堂" value={bookings.length} suffix="堂" accent="blue" /><Metric label="目前開放空檔" value={openSlots} suffix="段" accent="purple" /></div><div className="dashboard-grid"><div className="panel attention-panel"><div className="panel-heading"><div><span className="eyebrow">NEEDS ATTENTION</span><h2>新生登記</h2></div><button className="text-button" onClick={onReview}>查看全部 <ChevronRight size={15} /></button></div>{registrations.filter((item) => item.status === 'pending').slice(0, 3).map((item) => <div className="attention-row" key={item.id}><span className="avatar">{item.name.slice(0,1)}</span><div><b>{item.name}</b><small>{item.grade} · {item.school}</small></div><span className="pending-tag">待審核</span></div>)}{!registrations.some((item) => item.status === 'pending') && <div className="empty-inline">目前沒有待審核資料</div>}</div></div></div> }
function Metric({ label, value, suffix, accent }: { label: string; value: number; suffix: string; accent: string }) { return <div className={`metric-card ${accent}`}><span>{label}</span><strong>{value}<small>{suffix}</small></strong><div className="metric-line" /></div> }
function FlowStep({ num, title, text, done, active }: { num: string; title: string; text: string; done?: boolean; active?: boolean }) { return <div className={done ? 'flow-step done' : active ? 'flow-step active' : 'flow-step'}><span>{done ? <Check size={15} /> : num}</span><div><b>{title}</b><small>{text}</small></div></div> }

function StudentsTab({ registrations, students, tagOptions, teacherId, reload, notify }: { registrations: Registration[]; students: Student[]; tagOptions: string[]; teacherId: string; reload: () => Promise<void>; notify: (message: string) => void }) {
  const [filter, setFilter] = useState<'pending' | 'students'>('pending')
  const [editing, setEditing] = useState<Student | null>(null)
  const [viewing, setViewing] = useState<Student | null>(null)
  const [reviewing, setReviewing] = useState<Registration | null>(null)
  const pending = registrations.filter((item) => item.status === 'pending')
  const review = async (id: string) => { try { await approveRegistration(id, teacherId); await reload(); notify('已通過審核並建立正式學生檔案') } catch (error) { notify(error instanceof Error ? error.message : '審核失敗') } }
  return <div className="tab-content"><div className="tab-switch"><button className={filter === 'pending' ? 'active' : ''} onClick={() => setFilter('pending')}>待審核 <b>{pending.length}</b></button><button className={filter === 'students' ? 'active' : ''} onClick={() => setFilter('students')}>正式學生 <b>{students.length}</b></button></div>{filter === 'pending' ? <div className="panel table-panel"><div className="table-heading"><div><h2>待審核的新生</h2><p>清單先顯示姓名與手機，點選查看詳情可查看家長填寫的完整資訊。</p></div></div><div className="data-table pending-table"><div className="table-row table-header pending-row"><span>學生姓名</span><span>手機號碼</span><span>操作</span></div>{pending.map((item) => <div className="table-row pending-row" key={item.id}><span><b>{item.name}</b></span><span>{item.phone}</span><span className="table-actions"><button className="small-button" onClick={() => setReviewing(item)}><Pencil size={14} /> 查看詳情</button></span></div>)}{!pending.length && <div className="empty-inline">目前沒有待審核資料</div>}</div></div> : <div className="student-cards">{students.map((student) => <div className="student-card student-card-clickable" key={student.id} onClick={() => setViewing(student)}><div className="student-card-head"><span className="avatar">{student.name.slice(0, 1)}</span><div><h3>{student.name}</h3><p>{student.school} · {student.grade}</p></div><button type="button" className="small-button" onClick={(event) => { event.stopPropagation(); setViewing(student) }}>查看個資</button></div><div className="student-details"><span><b>地區</b><em className={student.region ? 'region-badge' : 'unassigned'}>{student.region ?? '尚未標記'}</em></span></div></div>)}</div>}{viewing && <StudentViewModal student={viewing} tagOptions={tagOptions} teacherId={teacherId} close={() => setViewing(null)} editProfile={() => { setViewing(null); setEditing(viewing) }} reload={reload} notify={notify} />}{editing && <StudentEditor student={editing} tagOptions={tagOptions} teacherId={teacherId} close={() => setEditing(null)} reload={reload} notify={notify} />}{reviewing && <RegistrationReviewModal registration={reviewing} teacherId={teacherId} close={() => setReviewing(null)} reload={reload} notify={notify} />}</div>
}

function StudentViewModal({ student, tagOptions, teacherId, close, editProfile, reload, notify }: { student: Student; tagOptions: string[]; teacherId: string; close: () => void; editProfile: () => void; reload: () => Promise<void>; notify: (message: string) => void }) {
  const [region, setRegion] = useState<Region | null>(student.region)
  const [saving, setSaving] = useState(false)
  const regionOptions = Array.from(new Set([...tagOptions, ...(student.region ? [student.region] : [])]))
  const saveRegion = async () => {
    setSaving(true)
    try {
      await updateStudent(student.id, { region }, teacherId)
      await reload()
      close()
      notify('學生地區已更新')
    } catch (error) {
      notify(error instanceof Error ? error.message : '地區更新失敗')
    } finally {
      setSaving(false)
    }
  }
  return <div className="modal-backdrop"><div className="modal student-view-modal"><button type="button" className="modal-close" onClick={close}><X /></button><div className="student-view-top"><div><div className="eyebrow">STUDENT PROFILE</div><h2>{student.name}</h2></div><button type="button" className="small-button" onClick={editProfile}><Pencil size={14} /> 編輯個資</button></div><div className="review-grid"><div><b>年級</b><span>{student.grade || '—'}</span></div><div><b>學校</b><span>{student.school || '—'}</span></div><div><b>家長聯絡方式</b><span>{student.phone || '—'}</span></div><div><b>欲加強項目</b><span>{student.focus || '—'}</span></div><div className="review-note"><b>詳盡地址</b><span>{student.location || '—'}</span></div><div><b>講義安排</b><span>{student.material || '—'}</span></div></div><div className="student-region-editor"><div><b>上課地區</b><small>檢視頁面只能修改地區標示。</small></div><div className="region-choice-grid"><button type="button" className={!region ? 'region-choice selected' : 'region-choice'} onClick={() => setRegion(null)}>尚未標記</button>{regionOptions.map((item) => <button type="button" key={item} className={region === item ? 'region-choice selected' : 'region-choice'} onClick={() => setRegion(item)}>{item}</button>)}</div></div><div className="modal-actions"><button type="button" className="button quiet" onClick={close}>關閉</button><button type="button" className="button primary" disabled={saving} onClick={() => void saveRegion()}>{saving ? '儲存中…' : '儲存地區'}</button></div></div></div>
}

function StudentEditor({ student, tagOptions, teacherId, close, reload, notify }: { student: Student; tagOptions: string[]; teacherId: string; close: () => void; reload: () => Promise<void>; notify: (message: string) => void }) {
  const [name, setName] = useState(student.name)
  const [grade, setGrade] = useState(student.grade)
  const [school, setSchool] = useState(student.school)
  const [region, setRegion] = useState<Region | null>(student.region)
  const [focus, setFocus] = useState(student.focus)
  const [location, setLocation] = useState(student.location)
  const [phone, setPhone] = useState(student.phone)
  const [material, setMaterial] = useState<MaterialPlan>(student.material)
  const regionOptions = Array.from(new Set([...tagOptions, ...(student.region ? [student.region] : [])]))
  const save = async () => { if (![name, grade, school, focus, location, phone].every((value) => value.trim())) { notify('請完整填寫學生個資'); return } try { await updateStudent(student.id, { name: name.trim(), grade: grade.trim(), school: school.trim(), region, focus: focus.trim(), location: location.trim(), phone: phone.trim(), material }, teacherId); await reload(); close(); notify('學生個資已更新') } catch (error) { notify(error instanceof Error ? error.message : '儲存失敗') } }
  const remove = async () => { if (!window.confirm(`確定要刪除 ${student.name} 的學生檔案與預約嗎？`)) return; try { await deleteStudent(student.id, teacherId); await reload(); close(); notify('學生與相關預約已刪除') } catch (error) { notify(error instanceof Error ? error.message : '刪除失敗') } }
  return <div className="modal-backdrop"><div className="modal student-editor-modal"><button type="button" className="modal-close" onClick={close}><X /></button><div className="eyebrow">EDIT STUDENT PROFILE</div><h2>編輯個資</h2><div className="form-grid two"><Field label="學生姓名"><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field><Field label="年級"><input value={grade} maxLength={40} onChange={(e) => setGrade(e.target.value)} /></Field><Field label="學校"><input value={school} maxLength={120} onChange={(e) => setSchool(e.target.value)} /></Field><Field label="家長聯絡方式"><input value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} /></Field></div><Field label="欲加強項目"><input value={focus} maxLength={240} onChange={(e) => setFocus(e.target.value)} /></Field><Field label="詳盡地址"><input value={location} maxLength={240} onChange={(e) => setLocation(e.target.value)} /></Field><div className="form-grid two"><Field label="講義安排"><select value={material} onChange={(e) => setMaterial(e.target.value as MaterialPlan)}><option>自編</option><option>已有</option><option>購買市售</option></select></Field><Field label="上課地區"><div className="region-choice-grid"><button type="button" className={!region ? 'region-choice selected' : 'region-choice'} onClick={() => setRegion(null)}>尚未標記</button>{regionOptions.map((item) => <button type="button" key={item} className={region === item ? 'region-choice selected' : 'region-choice'} onClick={() => setRegion(item)}>{item}</button>)}</div></Field></div><small className="field-hint">地區選項可在「搶課設定」新增、刪除或重新命名。</small><div className="modal-actions"><button type="button" className="text-button danger delete-action" onClick={() => void remove()}><Trash2 size={15} /> 刪除學生</button><button type="button" className="button quiet" onClick={close}>取消</button><button type="button" className="button primary" onClick={() => void save()}>儲存個資</button></div></div></div>
}

function RegistrationReviewModal({ registration, teacherId, close, reload, notify }: { registration: Registration; teacherId: string; close: () => void; reload: () => Promise<void>; notify: (message: string) => void }) {
  const approve = async () => { try { await approveRegistration(registration.id, teacherId); await reload(); close(); notify('已通過審核並建立正式學生檔案') } catch (error) { notify(error instanceof Error ? error.message : '審核失敗') } }
  const remove = async () => { if (!window.confirm(`確定要刪除 ${registration.name} 的新生登記嗎？`)) return; try { await deleteRegistration(registration.id, teacherId); await reload(); close(); notify('新生登記已刪除') } catch (error) { notify(error instanceof Error ? error.message : '刪除失敗') } }
  return <div className="modal-backdrop"><div className="modal review-modal"><button className="modal-close" onClick={close}><X /></button><div className="eyebrow">FULL REGISTRATION DETAILS</div><h2>{registration.name} 的新生資料</h2><p>送出時間：{formatTimestamp(registration.createdAt)}</p><div className="review-grid"><div><b>年級</b><span>{registration.grade}</span></div><div><b>學校</b><span>{registration.school}</span></div><div><b>欲加強項目</b><span>{registration.focus}</span></div><div><b>詳盡地址</b><span>{registration.location}</span></div><div><b>家長聯絡方式</b><span>{registration.phone}</span></div><div><b>講義安排</b><span>{registration.material}</span></div><div className="review-note"><b>給老師的備註</b><span>{registration.note || '家長未填寫備註'}</span></div></div><div className="modal-actions"><button className="text-button danger delete-action" onClick={() => void remove()}><Trash2 size={15} /> 刪除登記</button><button className="button quiet" onClick={close}>稍後處理</button><button className="button primary" onClick={() => void approve()}><Check size={16} /> 通過並建立檔案</button></div></div></div>
}

function ScheduleTab({ slots, teacherId, reload, notify }: { slots: AvailabilitySlot[]; teacherId: string; reload: () => Promise<void>; notify: (message: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [weekday, setWeekday] = useState<Weekday>(1)
  const [start, setStart] = useState('13:00')
  const [end, setEnd] = useState('17:00')
  const [region, setRegion] = useState<Region | null>(null)
  const [note, setNote] = useState('')
  const save = async () => { try { await addSlot({ weekday, start, end, presetRegion: region, open: true, note }, teacherId); setAdding(false); await reload(); notify('已新增每週固定時段') } catch (error) { notify(error instanceof Error ? error.message : '新增失敗') } }
  const cancel = async (bookingId: string) => { try { await cancelBooking(bookingId, teacherId); await reload(); notify('預約已取消，固定時段空檔已釋出') } catch (error) { notify(error instanceof Error ? error.message : '取消失敗') } }
  const removeSlot = async (slot: AvailabilitySlot) => { if (!window.confirm(`確定要刪除 ${weekdayLabels[slot.weekday]} ${slot.start}–${slot.end} 嗎？`)) return; try { await deleteSlot(slot.id, teacherId); await reload(); notify('固定時段與相關預約已刪除') } catch (error) { notify(error instanceof Error ? error.message : '刪除失敗') } }
  return <div className="tab-content"><div className="schedule-actions"><div><h2>本學期固定課表</h2><p>學期初搶課一次，之後每筆預約固定在該星期與時間。</p></div><button className="button primary" onClick={() => setAdding(true)}><Plus size={17} /> 新增固定時段</button></div><WeeklyTimetable slots={slots} /><div className="schedule-list">{slots.map((slot) => <div className={slot.open ? 'schedule-card' : 'schedule-card closed'} key={slot.id}><div className="schedule-main"><div className="date-block"><b>{weekdayLabels[slot.weekday].replace('星期', '')}</b><span>本學期固定</span></div><div><div className="schedule-title"><h3>{slot.start} — {slot.end}</h3>{!slot.open && <span className="closed-tag">已關閉</span>}{(slot.presetRegion || slot.dynamicRegion) && <span className="region-badge"><MapPin size={12} />{slot.presetRegion ?? slot.dynamicRegion}</span>}<button className="icon-button delete-icon" onClick={() => removeSlot(slot)} aria-label="刪除固定時段"><Trash2 size={14} /></button></div><p>{weekdayLabels[slot.weekday]} · {slot.note || '未加備註'} · {slot.bookings.length ? `${slot.bookings.length} 筆預約` : '尚無預約'}</p></div></div>{slot.bookings.length > 0 && <div className="booking-list">{slot.bookings.map((booking) => <div className="booking-row" key={booking.id}><span className="avatar small">{booking.studentName.slice(0,1)}</span><b>{booking.studentName}</b><span>{weekdayLabels[slot.weekday]} {booking.start} — {booking.end}</span><span className="region-badge">{booking.region}</span><button className="text-button danger" onClick={() => cancel(booking.id)}>取消預約</button></div>)}</div>}</div>)}</div>{adding && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setAdding(false)}><X /></button><div className="eyebrow">TERM AVAILABILITY</div><h2>新增本學期固定時段</h2><div className="form-grid two"><Field label="星期"><select value={weekday} onChange={(e) => setWeekday(Number(e.target.value) as Weekday)}>{(Object.entries(weekdayLabels) as Array<[string, string]>).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field><Field label="預先限區"><select value={region ?? ''} onChange={(e) => setRegion((e.target.value || null) as Region | null)}><option value="">不指定</option><option>天母</option><option>北投</option><option>士林</option></select></Field></div><div className="form-grid two"><Field label="開始"><select value={start} onChange={(e) => setStart(e.target.value)}>{timeOptions.map((time) => <option key={time}>{time}</option>)}</select></Field><Field label="結束"><select value={end} onChange={(e) => setEnd(e.target.value)}>{timeOptions.map((time) => <option key={time}>{time}</option>)}</select></Field></div><Field label="公開備註"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：段考後固定課" /></Field><div className="modal-actions"><button className="button quiet" onClick={() => setAdding(false)}>取消</button><button className="button primary" onClick={save}>建立固定時段</button></div></div></div>}</div>
}

function WeeklyTimetable({ slots }: { slots: AvailabilitySlot[] }) {
  const firstHour = 8
  const hours = Array.from({ length: 14 }, (_, index) => firstHour + index)
  const minutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute }
  // Keep the event edges aligned to the hour grid: 13:00–14:30 ends exactly at the 14:30 line.
  const eventStyle = (start: string, end: string) => ({ '--event-offset': (minutes(start) - firstHour * 60) / 60, '--event-duration': (minutes(end) - minutes(start)) / 60 } as CSSProperties)
  const durationClass = (start: string, end: string) => { const duration = (minutes(end) - minutes(start)) / 60; return duration <= 1 ? 'duration-one' : duration <= 2 ? 'duration-two' : duration <= 3 ? 'duration-three' : 'duration-long' }
  const dayEntries = (weekday: Weekday) => slots.filter((slot) => slot.weekday === weekday).flatMap((slot) => slot.bookings.length ? slot.bookings.map((booking) => ({ id: booking.id, start: booking.start, end: booking.end, name: booking.studentName, booked: true })) : [{ id: slot.id, start: slot.start, end: slot.end, name: '可搶課', booked: false }])
  return <div className="timetable-panel"><div className="timetable-heading"><div><span className="eyebrow">TERM TIMETABLE</span><h3>學生固定星期課表</h3><p>每格 1 小時；顏色依家長搶課時長區分。</p></div><div className="timetable-legend"><span><i className="legend-dot duration-one" />1 小時</span><span><i className="legend-dot duration-two" />2 小時</span><span><i className="legend-dot duration-three" />3 小時以上</span></div></div><div className="timetable-grid"><div className="time-axis"><div className="time-axis-spacer" />{hours.map((hour) => <div className="time-label" key={hour}>{String(hour).padStart(2, '0')}:00</div>)}</div>{(Object.entries(weekdayLabels) as Array<[string, string]>).map(([value, label]) => { const weekday = Number(value) as Weekday; const daySlots = slots.filter((slot) => slot.weekday === weekday); return <div className="day-column" key={value}><div className="day-heading">{label.replace('星期', '')}</div>{hours.map((hour) => <div className="hour-cell" key={hour} />)}{daySlots.flatMap((slot) => slot.bookings.length ? slot.bookings.map((booking) => <div className={`timetable-event ${durationClass(booking.start, booking.end)}`} style={eventStyle(booking.start, booking.end)} key={booking.id} title={`${booking.studentName} ${booking.start}–${booking.end}`}><b>{booking.studentName}</b><small>{booking.start}–{booking.end}</small></div>) : <div className="timetable-open" style={eventStyle(slot.start, slot.end)} key={slot.id}><b>可搶課</b><small>{slot.start}–{slot.end}</small></div>)}</div>})}</div><div className="timetable-mobile">{(Object.entries(weekdayLabels) as Array<[string, string]>).map(([value, label]) => { const entries = dayEntries(Number(value) as Weekday); return <section className="mobile-day-card" key={value}><h4>{label}</h4>{entries.length ? entries.map((entry) => <div className={`mobile-event ${entry.booked ? durationClass(entry.start, entry.end) : 'timetable-open'}`} key={entry.id}><span>{entry.start}–{entry.end}</span><b>{entry.name}</b>{entry.booked && <small>{(minutes(entry.end) - minutes(entry.start)) / 60} 小時</small>}</div>) : <p>尚無固定時段</p>}</section>})}</div></div>
}

function TeacherBottomNav({ tab, setTab, pendingCount }: { tab: 'overview' | 'students' | 'schedule' | 'settings'; setTab: (tab: 'overview' | 'students' | 'schedule' | 'settings') => void; pendingCount: number }) {
  const items: Array<{ id: 'overview' | 'students' | 'schedule' | 'settings'; label: string; Icon: typeof DoorOpen }> = [{ id: 'overview', label: '總覽', Icon: DoorOpen }, { id: 'students', label: '學生', Icon: Users }, { id: 'schedule', label: '課表', Icon: CalendarDays }, { id: 'settings', label: '設定', Icon: Clock3 }]
  return <nav className="teacher-bottom-nav" aria-label="老師後台分頁">{items.map(({ id, label, Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><span className="bottom-nav-icon"><Icon size={18} />{id === 'students' && pendingCount > 0 && <b>{pendingCount}</b>}</span><small>{label}</small></button>)}</nav>
}

type TimetableAction = { type: 'slot'; slot: AvailabilitySlot } | { type: 'booking'; booking: Booking; slot: AvailabilitySlot }

type ScheduleMode = 'availability' | 'calendar'

type DirectBookingTarget = { slot: AvailabilitySlot; start: string; end: string }

function ScheduleTabV2({ slots, students, regionOptions, teacherId, bookingWindowOpen, reload, notify }: { slots: AvailabilitySlot[]; students: Student[]; regionOptions: string[]; teacherId: string; bookingWindowOpen: boolean; reload: () => Promise<void>; notify: (message: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [weekday, setWeekday] = useState<Weekday>(1)
  const [start, setStart] = useState('13:00')
  const [end, setEnd] = useState('14:00')
  const [region, setRegion] = useState<Region | null>(null)
  const [note, setNote] = useState('')
  const [action, setAction] = useState<TimetableAction | null>(null)
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('availability')
  const [directTarget, setDirectTarget] = useState<DirectBookingTarget | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const beginAdd = (nextWeekday: Weekday, nextStart: string) => { if (bookingWindowOpen) { notify('目前仍在家長搶課期間，請由家長頁面預約；搶課結束後可由老師直接新增學生'); return } const slot = slots.find((item) => item.weekday === nextWeekday && toMinutes(nextStart) >= toMinutes(item.start) && toMinutes(nextStart) < toMinutes(item.end)); if (!slot) { notify('請先在「設定」建立包含這個時間的空堂'); return } const gap = freeSegmentsForSlot(slot).find((item) => toMinutes(nextStart) >= toMinutes(item.start) && toMinutes(nextStart) < toMinutes(item.end)); if (!gap) { notify('剩餘 30 分鐘或更少的空檔不開放新增學生'); return } const index = timeOptions.indexOf(nextStart); const proposedEnd = timeOptions[index + 2] ?? gap.end; setDirectTarget({ slot, start: nextStart, end: toMinutes(proposedEnd) <= toMinutes(gap.end) ? proposedEnd : gap.end }) }
  const save = async () => { if (toMinutes(start) >= toMinutes(end)) { notify('結束時間必須晚於開始時間'); return } try { await addSlot({ weekday, start, end, presetRegion: region, open: true, note }, teacherId); setAdding(false); await reload(); notify('已新增固定時段') } catch (error) { notify(error instanceof Error ? error.message : '新增失敗') } }
  const cancel = async (booking: Booking) => { if (!window.confirm(`確定要取消 ${booking.studentName} 的預約嗎？\n${booking.start}–${booking.end}`)) return; try { await cancelBooking(booking.id, teacherId); setAction(null); await reload(); notify('預約已取消，空檔已重新開放') } catch (error) { notify(error instanceof Error ? error.message : '取消失敗') } }
  const clearSchedule = async () => {
    if (!slots.length) { notify('目前沒有可刪除的課表'); return }
    if (!window.confirm('確定要刪除現有課表嗎？課表內的預約也會一併刪除。')) return
    setDeletingAll(true)
    try { for (const slot of slots) await deleteSlot(slot.id, teacherId); await reload(); notify('現有課表已刪除') } catch (error) { notify(error instanceof Error ? error.message : '刪除課表失敗') } finally { setDeletingAll(false) }
  }
  return <div className="tab-content"><div className="schedule-actions schedule-actions-compact"><div><h2>本學期固定課表</h2><p>先設定每週空堂，再切換到課表編輯預約。</p></div><button type="button" className="button danger-outline" onClick={() => void clearSchedule()} disabled={deletingAll || !slots.length}>刪除現有課表</button></div><div className="schedule-mode-switch" role="tablist" aria-label="設定與課表"><button className={scheduleMode === 'availability' ? 'active' : ''} onClick={() => setScheduleMode('availability')}>設定</button><button className={scheduleMode === 'calendar' ? 'active' : ''} onClick={() => setScheduleMode('calendar')}>課表</button></div>{scheduleMode === 'availability' ? <AvailabilityRows slots={slots} regionOptions={regionOptions} teacherId={teacherId} reload={reload} notify={notify} /> : <><div className="schedule-edit-hint"><Clock3 size={15} /> 搶課結束後長按空白格新增正式學生；點按彩色區塊查看學生或編輯時段。</div><WeeklyTimetableV2 slots={slots} onLongPress={beginAdd} onSlotClick={(slot) => setAction({ type: 'slot', slot })} onBookingClick={(booking, slot) => setAction({ type: 'booking', booking, slot })} />{!slots.length && <div className="public-empty teacher-empty"><Clock3 size={26} /><h3>目前沒有時段</h3><p>請切換到設定新增上午或下午時段。</p></div>}</>}{adding && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setAdding(false)}><X /></button><div className="eyebrow">NEW SLOT</div><h2>新增固定時段</h2><div className="form-grid two"><Field label="星期"><select value={weekday} onChange={(e) => setWeekday(Number(e.target.value) as Weekday)}>{(Object.entries(weekdayLabels) as Array<[string, string]>).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field><Field label="預先限區"><select value={region ?? ''} onChange={(e) => setRegion((e.target.value || null) as Region | null)}><option value="">不指定</option>{regionOptions.map((item) => <option key={item}>{item}</option>)}</select></Field></div><div className="form-grid two"><Field label="開始"><TimePicker value={start} onChange={setStart} /></Field><Field label="結束"><TimePicker value={end} options={timeOptions.filter((time) => toMinutes(time) > toMinutes(start))} onChange={setEnd} /></Field></div><Field label="公開備註"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" /></Field><div className="modal-actions"><button className="button quiet" onClick={() => setAdding(false)}>取消</button><button className="button primary" onClick={save}>建立時段</button></div></div></div>}{directTarget && <ExistingStudentBookingModal target={directTarget} students={students} teacherId={teacherId} close={() => setDirectTarget(null)} reload={reload} notify={notify} />}{action?.type === 'slot' && <SlotEditorModal slot={action.slot} regionOptions={regionOptions} teacherId={teacherId} close={() => setAction(null)} reload={reload} notify={notify} />}{action?.type === 'booking' && <BookingActionModal booking={action.booking} slot={action.slot} teacherId={teacherId} close={() => setAction(null)} cancel={cancel} reload={reload} notify={notify} />}</div>
}

function DirectStudentBookingModal({ target, regionOptions, teacherId, close, reload, notify }: { target: DirectBookingTarget; regionOptions: string[]; teacherId: string; close: () => void; reload: () => Promise<void>; notify: (message: string) => void }) {
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('')
  const [school, setSchool] = useState('')
  const [focus, setFocus] = useState('')
  const [location, setLocation] = useState('')
  const [phone, setPhone] = useState('')
  const [region, setRegion] = useState(regionOptions[0] ?? '')
  const [material, setMaterial] = useState<MaterialPlan>('自編')
  const [start, setStart] = useState(target.start)
  const [end, setEnd] = useState(target.end)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    const values = [name, grade, school, focus, location, phone, region].map((value) => value.trim())
    if (values.some((value) => !value) || toMinutes(start) >= toMinutes(end) || toMinutes(start) < toMinutes(target.slot.start) || toMinutes(end) > toMinutes(target.slot.end)) { notify('請完整填寫學生資料，並確認時間在固定空堂內'); return }
    setSaving(true)
    try { await teacherCreateBooking({ weekday: target.slot.weekday, slotId: target.slot.id, start, end, name: values[0], grade: values[1], school: values[2], focus: values[3], location: values[4], phone: values[5], region: values[6], material }, teacherId); await reload(); close(); notify('已新增學生並建立固定預約') } catch (error) { notify(error instanceof Error ? error.message : '新增學生失敗') } finally { setSaving(false) }
  }
  const endOptions = timeOptions.filter((time) => toMinutes(time) > toMinutes(start) && toMinutes(time) <= toMinutes(target.slot.end))
  return <div className="modal-backdrop"><div className="modal direct-booking-modal"><button className="modal-close" onClick={close}><X /></button><div className="eyebrow">DIRECT STUDENT</div><h2>新增學生</h2><p>{weekdayLabels[target.slot.weekday]} {target.slot.start}–{target.slot.end} · 搶課結束後由老師直接建立</p><div className="form-grid two"><Field label="學生姓名"><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></Field><Field label="年級"><input value={grade} maxLength={40} onChange={(event) => setGrade(event.target.value)} /></Field><Field label="學校"><input value={school} maxLength={120} onChange={(event) => setSchool(event.target.value)} /></Field><Field label="聯絡電話"><input value={phone} maxLength={40} inputMode="tel" onChange={(event) => setPhone(event.target.value)} /></Field></div><Field label="欲加強項目"><input value={focus} maxLength={240} onChange={(event) => setFocus(event.target.value)} /></Field><Field label="詳盡地址"><input value={location} maxLength={240} onChange={(event) => setLocation(event.target.value)} /></Field><div className="form-grid two"><Field label="上課地區"><select value={region} onChange={(event) => setRegion(event.target.value)}><option value="">請選擇地區</option>{regionOptions.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="講義安排"><select value={material} onChange={(event) => setMaterial(event.target.value as MaterialPlan)}><option>自編</option><option>已有</option><option>購買市售</option></select></Field></div><div className="form-grid two"><Field label="開始"><select value={start} onChange={(event) => setStart(event.target.value)}>{timeOptions.filter((time) => toMinutes(time) >= toMinutes(target.slot.start) && toMinutes(time) < toMinutes(target.slot.end)).map((time) => <option key={time}>{time}</option>)}</select></Field><Field label="結束"><select value={end} onChange={(event) => setEnd(event.target.value)}>{endOptions.map((time) => <option key={time}>{time}</option>)}</select></Field></div><div className="modal-actions"><button className="button quiet" onClick={close}>取消</button><button className="button primary" disabled={saving} onClick={() => void save}>{saving ? '建立中…' : '新增學生並預約'}</button></div></div></div>
}

function ExistingStudentBookingModal({ target, students, teacherId, close, reload, notify }: { target: DirectBookingTarget; students: Student[]; teacherId: string; close: () => void; reload: () => Promise<void>; notify: (message: string) => void }) {
  const eligibleStudents = students.filter((student) => student.active && student.region)
  const [studentId, setStudentId] = useState(eligibleStudents[0]?.id ?? '')
  const [start, setStart] = useState(target.start)
  const [end, setEnd] = useState(target.end)
  const [saving, setSaving] = useState(false)
  const gap = freeSegmentsForSlot(target.slot).find((item) => toMinutes(start) >= toMinutes(item.start) && toMinutes(start) < toMinutes(item.end)) ?? freeSegmentsForSlot(target.slot)[0]
  const startOptions = gap ? timeOptions.filter((time) => toMinutes(time) >= toMinutes(gap.start) && toMinutes(time) < toMinutes(gap.end)) : []
  const endOptions = gap ? timeOptions.filter((time) => toMinutes(time) > toMinutes(start) && toMinutes(time) <= toMinutes(gap.end)) : []
  const save = async () => { if (!studentId || !gap || toMinutes(start) >= toMinutes(end) || toMinutes(start) < toMinutes(gap.start) || toMinutes(end) > toMinutes(gap.end)) { notify('請選擇正式學生與可用空檔時間'); return } setSaving(true); try { await teacherBookExistingStudent(studentId, target.slot.id, start, end, teacherId); await reload(); close(); notify('已為正式學生建立固定預約') } catch (error) { notify(error instanceof Error ? error.message : '新增預約失敗') } finally { setSaving(false) } }
  return <div className="modal-backdrop"><div className="modal existing-booking-modal"><button type="button" className="modal-close" onClick={close}><X /></button><div className="eyebrow">ADD EXISTING STUDENT</div><h2>新增固定課</h2>{eligibleStudents.length ? <><Field label="正式學生"><select value={studentId} onChange={(event) => setStudentId(event.target.value)}>{eligibleStudents.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></Field><div className="form-grid two"><Field label="開始"><TimePicker value={start} options={startOptions} onChange={setStart} /></Field><Field label="結束"><TimePicker value={end} options={endOptions} onChange={setEnd} /></Field></div><small className="field-hint">只設定這位正式學生的上課時間。</small><div className="modal-actions"><button type="button" className="button quiet" onClick={close}>取消</button><button type="button" className="button primary" disabled={saving} onClick={() => void save()}>{saving ? '儲存中…' : '儲存預約'}</button></div></> : <><div className="empty-state"><Users size={25} /><h3>目前沒有可用的正式學生</h3><p>請先完成新生審核並設定學生地區。</p></div><div className="modal-actions"><button type="button" className="button quiet" onClick={close}>關閉</button></div></>}</div></div>
}

type AvailabilityDraft = { id?: string; weekday: Weekday; period: 'morning' | 'afternoon'; start: string; end: string; region: Region | null; note: string; enabled: boolean }

function AvailabilityRowsLegacy({ slots, regionOptions, teacherId, reload, notify }: { slots: AvailabilitySlot[]; regionOptions: string[]; teacherId: string; reload: () => Promise<void>; notify: (message: string) => void }) {
  const [rows, setRows] = useState<AvailabilityDraft[]>([])
  const [saving, setSaving] = useState(false)
  useEffect(() => { setRows(slots.map((slot) => ({ id: slot.id, weekday: slot.weekday, period: toMinutes(slot.start) < 720 ? 'morning' : 'afternoon', start: slot.start, end: slot.end, region: slot.presetRegion, note: slot.note, enabled: true }))) }, [slots])
  const updateRow = (index: number, patch: Partial<AvailabilityDraft>) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  const periodOf = (startTime: string) => toMinutes(startTime) < 12 * 60 ? 'morning' : 'afternoon'
  const addRow = (weekday: Weekday, afternoon: boolean) => { const period = afternoon ? 'afternoon' : 'morning'; if (rows.some((row) => row.enabled && row.weekday === weekday && periodOf(row.start) === period)) { notify(`星期${weekdayLabels[weekday].replace('星期', '')}已設定${afternoon ? '下午' : '上午'}時段`); return } setRows((current) => [...current, { weekday, period, start: afternoon ? '13:00' : '09:00', end: afternoon ? '17:00' : '12:00', region: null, note: '', enabled: true }]) }
  const saveRows = async () => {
    const active = rows.filter((row) => row.enabled)
    if (active.some((row) => toMinutes(row.start) >= toMinutes(row.end))) { notify('每個空堂的結束時間必須晚於開始時間'); return }
    const duplicatePeriod = Object.values(active.reduce<Record<string, string[]>>((groups, row) => { const key = `${row.weekday}-${periodOf(row.start)}`; (groups[key] ??= []).push(key); return groups }, {})).some((group) => group.length > 1)
    if (duplicatePeriod) { notify('每個星期只能設定一個上午與一個下午時段'); return }
    setSaving(true)
    try {
      for (const row of active) {
        if (row.id) await updateSlot(row.id, { weekday: row.weekday, start: row.start, end: row.end, presetRegion: row.region, open: true, note: row.note }, teacherId)
        else await addSlot({ weekday: row.weekday, start: row.start, end: row.end, presetRegion: row.region, open: true, note: row.note }, teacherId)
      }
      for (const row of rows.filter((item) => !item.enabled && item.id)) { const original = slots.find((slot) => slot.id === row.id); if (original?.bookings.length) { notify(`${weekdayLabels[original.weekday]}仍有預約，未刪除原時段`); continue } await deleteSlot(row.id!, teacherId) }
      await reload(); notify('空堂設定已同步')
    } catch (error) { notify(error instanceof Error ? error.message : '空堂設定儲存失敗') } finally { setSaving(false) }
  }
  return <div className="availability-rows"><div className="availability-rows-head"><div><b>每週可授課時間</b><small>每個星期最多一個上午與一個下午；同步後才會建立或更新課表時段。</small></div><button className="button primary" onClick={() => void saveRows()} disabled={saving}>{saving ? '同步中…' : '同步空堂'}</button></div>{(Object.entries(weekdayLabels) as Array<[string, string]>).map(([value, label]) => { const weekday = Number(value) as Weekday; const dayRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.weekday === weekday); const hasMorning = dayRows.some(({ row }) => row.enabled && periodOf(row.start) === 'morning'); const hasAfternoon = dayRows.some(({ row }) => row.enabled && periodOf(row.start) === 'afternoon'); return <div className="availability-day" key={value}><div className="availability-day-title"><b>{label}</b><div><button type="button" className="availability-add" disabled={hasMorning} onClick={() => addRow(weekday, false)}>＋上午</button><button type="button" className="availability-add" disabled={hasAfternoon} onClick={() => addRow(weekday, true)}>＋下午</button></div></div>{dayRows.length === 0 && <p className="availability-none">尚未設定空堂</p>}{dayRows.map(({ row, index }) => <div className={`availability-row ${row.enabled ? '' : 'disabled'}`} key={row.id ?? `new-${index}`}><label className="availability-check"><input type="checkbox" checked={row.enabled} onChange={(event) => updateRow(index, { enabled: event.target.checked })} /><span /></label><select value={row.start} disabled={!row.enabled} onChange={(event) => updateRow(index, { start: event.target.value })}>{timeOptions.slice(0, -1).map((time) => <option key={time}>{time}</option>)}</select><span>～</span><select value={row.end} disabled={!row.enabled} onChange={(event) => updateRow(index, { end: event.target.value })}>{timeOptions.filter((time) => toMinutes(time) > toMinutes(row.start)).map((time) => <option key={time}>{time}</option>)}</select><select className="availability-region" value={row.region ?? ''} disabled={!row.enabled} onChange={(event) => updateRow(index, { region: event.target.value || null })}><option value="">不指定地區</option>{regionOptions.map((item) => <option key={item}>{item}</option>)}</select></div>)}</div>})}</div>
}

function AvailabilityRows({ slots, regionOptions, teacherId, reload, notify }: { slots: AvailabilitySlot[]; regionOptions: string[]; teacherId: string; reload: () => Promise<void>; notify: (message: string) => void }) {
  const [rows, setRows] = useState<AvailabilityDraft[]>([])
  const [saving, setSaving] = useState(false)
  useEffect(() => { setRows(slots.map((slot) => ({ id: slot.id, weekday: slot.weekday, period: toMinutes(slot.start) < 720 ? 'morning' : 'afternoon', start: slot.start, end: slot.end, region: slot.presetRegion, note: slot.note, enabled: true }))) }, [slots])
  const updateRow = (index: number, patch: Partial<AvailabilityDraft>) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  const addRow = (weekday: Weekday, afternoon: boolean) => setRows((current) => [...current, { weekday, period: afternoon ? 'afternoon' : 'morning', start: afternoon ? '13:00' : '09:00', end: afternoon ? '17:00' : '12:00', region: null, note: '', enabled: true }])
  const saveRows = async () => {
    const active = rows.filter((row) => row.enabled)
    if (active.some((row) => toMinutes(row.start) >= toMinutes(row.end))) { notify('每個空堂的結束時間必須晚於開始時間'); return }
    const periods = active.map((row) => `${row.weekday}-${row.period}`)
    if (new Set(periods).size !== periods.length) { notify('每個星期只能設定一個上午與一個下午時段'); return }
    setSaving(true)
    try {
      for (const row of active) row.id ? await updateSlot(row.id, { weekday: row.weekday, start: row.start, end: row.end, presetRegion: row.region, open: true, note: row.note }, teacherId) : await addSlot({ weekday: row.weekday, start: row.start, end: row.end, presetRegion: row.region, open: true, note: row.note }, teacherId)
      for (const row of rows.filter((item) => !item.enabled && item.id)) { const original = slots.find((slot) => slot.id === row.id); if (!original?.bookings.length) await deleteSlot(row.id!, teacherId) }
      await reload(); notify('空堂設定已同步')
    } catch (error) { notify(error instanceof Error ? error.message : '空堂設定儲存失敗') } finally { setSaving(false) }
  }
  return <div className="availability-rows"><div className="availability-rows-head"><div><b>每週可授課時間</b><small>每個星期最多一個上午與一個下午；同步後才會建立或更新課表時段。</small></div><button className="button primary" onClick={() => void saveRows()} disabled={saving}>{saving ? '同步中…' : '同步空堂'}</button></div>{(Object.entries(weekdayLabels) as Array<[string, string]>).map(([value, label]) => { const weekday = Number(value) as Weekday; const dayRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.weekday === weekday); const hasMorning = dayRows.some(({ row }) => row.enabled && row.period === 'morning'); const hasAfternoon = dayRows.some(({ row }) => row.enabled && row.period === 'afternoon'); return <div className="availability-day" key={value}><div className="availability-day-title"><b>{label}</b><div><button type="button" className="availability-add" disabled={hasMorning} onClick={() => addRow(weekday, false)}>＋上午</button><button type="button" className="availability-add" disabled={hasAfternoon} onClick={() => addRow(weekday, true)}>＋下午</button></div></div>{dayRows.length === 0 && <p className="availability-none">尚未設定空堂</p>}{dayRows.map(({ row, index }) => { const periodEnd = row.period === 'morning' ? 720 : 24 * 60; const periodOptions = timeOptions.filter((time) => toMinutes(time) >= (row.period === 'morning' ? 0 : 720) && toMinutes(time) <= periodEnd - 15); const endOptions = timeOptions.filter((time) => toMinutes(time) > toMinutes(row.start) && toMinutes(time) <= periodEnd); return <div className={`availability-row ${row.period} ${row.enabled ? '' : 'disabled'}`} key={row.id ?? `new-${index}`}><label className="availability-check"><input type="checkbox" checked={row.enabled} onChange={(event) => updateRow(index, { enabled: event.target.checked })} /><span /></label><TimePicker value={row.start} options={periodOptions} disabled={!row.enabled} onChange={(value) => updateRow(index, { start: value, end: toMinutes(value) >= toMinutes(row.end) ? (timeOptions.find((item) => toMinutes(item) > toMinutes(value) && toMinutes(item) <= periodEnd) ?? row.end) : row.end })} /><span>～</span><TimePicker value={row.end} options={endOptions} disabled={!row.enabled} onChange={(value) => updateRow(index, { end: value })} /><select className="availability-region" value={row.region ?? ''} disabled={!row.enabled} onChange={(event) => updateRow(index, { region: event.target.value || null })}><option value="">不指定地區</option>{regionOptions.map((item) => <option key={item}>{item}</option>)}</select></div>})}</div>})}</div>
}

function SlotEditorModal({ slot, regionOptions, teacherId, close, reload, notify }: { slot: AvailabilitySlot; regionOptions: string[]; teacherId: string; close: () => void; reload: () => Promise<void>; notify: (message: string) => void }) {
  const [weekday, setWeekday] = useState<Weekday>(slot.weekday)
  const [start, setStart] = useState(slot.start)
  const [end, setEnd] = useState(slot.end)
  const [region, setRegion] = useState<Region | null>(slot.presetRegion)
  const [note, setNote] = useState(slot.note)
  const save = async () => { if (toMinutes(start) >= toMinutes(end)) { notify('結束時間必須晚於開始時間'); return } try { await updateSlot(slot.id, { weekday, start, end, presetRegion: region, open: true, note }, teacherId); await reload(); close(); notify('固定時段已更新') } catch (error) { notify(error instanceof Error ? error.message : '更新失敗') } }
  const remove = async () => { if (!window.confirm(`確定要刪除${weekdayLabels[slot.weekday]} ${slot.start}–${slot.end}嗎？相關預約也會刪除。`)) return; try { await deleteSlot(slot.id, teacherId); await reload(); close(); notify('固定時段已刪除') } catch (error) { notify(error instanceof Error ? error.message : '刪除失敗') } }
  return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={close}><X /></button><div className="eyebrow">EDIT SLOT</div><h2>編輯固定時段</h2><div className="form-grid two"><Field label="星期"><select value={weekday} onChange={(e) => setWeekday(Number(e.target.value) as Weekday)}>{(Object.entries(weekdayLabels) as Array<[string, string]>).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field><Field label="上課地區"><select value={region ?? ''} onChange={(e) => setRegion((e.target.value || null) as Region | null)}><option value="">不指定</option>{regionOptions.map((item) => <option key={item}>{item}</option>)}</select></Field></div><div className="form-grid two"><Field label="開始"><TimePicker value={start} onChange={setStart} /></Field><Field label="結束"><TimePicker value={end} options={timeOptions.filter((time) => toMinutes(time) > toMinutes(start))} onChange={setEnd} /></Field></div><Field label="公開備註"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" /></Field><div className="modal-actions"><button className="text-button danger delete-action" onClick={remove}><Trash2 size={15} /> 刪除時段</button><button className="button quiet" onClick={close}>取消</button><button className="button primary" onClick={save}>儲存修改</button></div></div></div>
}

function BookingActionModalLegacy({ booking, slot, teacherId, close, cancel, reload, notify }: { booking: Booking; slot: AvailabilitySlot; teacherId: string; close: () => void; cancel: (booking: Booking) => Promise<void>; reload: () => Promise<void>; notify: (message: string) => void }) {
  const segments = (() => { const occupied = slot.bookings.filter((item) => item.id !== booking.id).sort((a, b) => toMinutes(a.start) - toMinutes(b.start)); const result: Array<{ start: string; end: string }> = []; let cursor = toMinutes(slot.start); for (const item of occupied) { if (toMinutes(item.start) > cursor) result.push({ start: `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`, end: item.start }); cursor = Math.max(cursor, toMinutes(item.end)) } if (cursor < toMinutes(slot.end)) result.push({ start: `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`, end: slot.end }); const otherSegments = result.length ? result : [{ start: slot.start, end: slot.end }]; return [{ start: booking.start, end: booking.end }, ...otherSegments.filter((item) => item.start !== booking.start || item.end !== booking.end)] })()
  const [start, setStart] = useState(booking.start)
  const [end, setEnd] = useState(booking.end)
  const [saving, setSaving] = useState(false)
  const segmentTimes = Array.from(new Set(segments.flatMap((item) => timeOptions.filter((time) => withinTime(time, item.start, item.end))))).sort()
  const valid = segments.some((item) => isValidBookingRange(start, end, item))
  const save = async () => { if (!valid) { notify('時間必須落在沒有其他預約的空檔內'); return } setSaving(true); try { await updateBooking(booking.id, start, end, teacherId); await reload(); close(); notify('學生上課時間已修改') } catch (error) { notify(error instanceof Error ? error.message : '修改預約失敗') } finally { setSaving(false) } }
  return <div className="modal-backdrop"><div className="modal booking-action-modal"><button type="button" className="modal-close" onClick={close}><X /></button><div className="eyebrow">BOOKING DETAILS</div><h2>{booking.studentName}</h2><div className="student-review-grid"><span><b>年級</b>{booking.studentGrade || '—'}</span><span><b>學校</b>{booking.studentSchool || '—'}</span><span><b>電話</b>{booking.studentPhone || '—'}</span><span><b>地區</b>{booking.region}</span><span className="student-review-wide"><b>上課地址</b>{booking.studentLocation || '—'}</span><span className="student-review-wide"><b>加強項目</b>{booking.studentFocus || '—'}</span></div><div className="booking-time-editor"><b>修改學生上課時間</b><div className="form-grid two"><Field label="開始"><select value={start} onChange={(e) => setStart(e.target.value)}>{segmentTimes.filter((time) => toMinutes(time) < toMinutes(end)).map((time) => <option key={time}>{time}</option>)}</select></Field><Field label="結束"><select value={end} onChange={(e) => setEnd(e.target.value)}>{segmentTimes.filter((time) => toMinutes(time) > toMinutes(start)).map((time) => <option key={time}>{time}</option>)}</select></Field></div>{!valid && <small className="field-error">開始與結束時間必須落在同一段空檔內</small>}</div><div className="modal-actions"><button type="button" className="text-button danger delete-action" onClick={() => void cancel(booking)}><Trash2 size={15} /> 刪除預約</button><button type="button" className="button quiet" onClick={close}>關閉</button><button type="button" className="button primary" disabled={saving || !valid} onClick={() => void save}>{saving ? '儲存中…' : '儲存時間修改'}</button></div></div></div>
}

function BookingActionModal({ booking, slot, teacherId, close, cancel, reload, notify }: { booking: Booking; slot: AvailabilitySlot; teacherId: string; close: () => void; cancel: (booking: Booking) => Promise<void>; reload: () => Promise<void>; notify: (message: string) => void }) {
  const segments = (() => { const occupied = slot.bookings.filter((item) => item.id !== booking.id).sort((a, b) => toMinutes(a.start) - toMinutes(b.start)); const result: Array<{ start: string; end: string }> = []; let cursor = toMinutes(slot.start); for (const item of occupied) { if (toMinutes(item.start) > cursor) result.push({ start: fromMinutes(cursor), end: item.start }); cursor = Math.max(cursor, toMinutes(item.end)) } if (cursor < toMinutes(slot.end)) result.push({ start: fromMinutes(cursor), end: slot.end }); return [{ start: booking.start, end: booking.end }, ...(result.length ? result : [{ start: slot.start, end: slot.end }]).filter((item) => item.start !== booking.start || item.end !== booking.end)] })()
  const [start, setStart] = useState(booking.start)
  const [end, setEnd] = useState(booking.end)
  const [saving, setSaving] = useState(false)
  const available = Array.from(new Set(segments.flatMap((item) => timeOptions.filter((time) => withinTime(time, item.start, item.end))))).sort()
  const valid = segments.some((item) => isValidBookingRange(start, end, item))
  const save = async () => { if (!valid) { notify('時間必須落在沒有其他預約的空檔內'); return } setSaving(true); try { await updateBooking(booking.id, start, end, teacherId); await reload(); close(); notify('學生上課時間已修改') } catch (error) { notify(error instanceof Error ? error.message : '修改預約失敗') } finally { setSaving(false) } }
  return <div className="modal-backdrop"><div className="modal booking-action-modal"><button type="button" className="modal-close" onClick={close}><X /></button><div className="eyebrow">BOOKING DETAILS</div><h2>{booking.studentName}</h2><div className="student-review-grid"><span><b>年級</b>{booking.studentGrade || '—'}</span><span><b>學校</b>{booking.studentSchool || '—'}</span><span><b>電話</b>{booking.studentPhone || '—'}</span><span><b>地區</b>{booking.region}</span><span className="student-review-wide"><b>上課地址</b>{booking.studentLocation || '—'}</span><span className="student-review-wide"><b>加強項目</b>{booking.studentFocus || '—'}</span></div><div className="booking-time-editor"><b>修改學生上課時間</b><div className="form-grid two"><Field label="開始"><TimePicker value={start} options={available.filter((time) => toMinutes(time) < toMinutes(end))} onChange={setStart} /></Field><Field label="結束"><TimePicker value={end} options={available.filter((time) => toMinutes(time) > toMinutes(start))} onChange={setEnd} /></Field></div>{!valid && <small className="field-error">開始與結束時間必須落在同一段空檔內</small>}</div><div className="modal-actions"><button type="button" className="text-button danger delete-action" onClick={() => void cancel(booking)}><Trash2 size={15} /> 刪除預約</button><button type="button" className="button quiet" onClick={close}>關閉</button><button type="button" className="button primary" disabled={saving || !valid} onClick={() => void save}>{saving ? '儲存中…' : '儲存時間修改'}</button></div></div></div>
}

function WeeklyTimetableV2({ slots, onLongPress, onSlotClick, onBookingClick }: { slots: AvailabilitySlot[]; onLongPress: (weekday: Weekday, start: string) => void; onSlotClick: (slot: AvailabilitySlot) => void; onBookingClick: (booking: Booking, slot: AvailabilitySlot) => void }) {
  const firstHour = 8
  const hours = Array.from({ length: 14 }, (_, index) => firstHour + index)
  const pressTimer = useRef<number | null>(null)
  const slotLongPressFired = useRef(false)
  const minutes = (value: string) => toMinutes(value)
  const eventStyle = (start: string, end: string) => ({ '--event-offset': (minutes(start) - firstHour * 60) / 60, '--event-duration': (minutes(end) - minutes(start)) / 60 } as CSSProperties)
  const durationClass = (start: string, end: string) => { const duration = (minutes(end) - minutes(start)) / 60; return duration <= 1 ? 'duration-one' : duration <= 2 ? 'duration-two' : duration <= 3 ? 'duration-three' : 'duration-long' }
  const clearPress = () => { if (pressTimer.current !== null) { window.clearTimeout(pressTimer.current); pressTimer.current = null } }
  const startPress = (weekday: Weekday, hour: number) => { clearPress(); pressTimer.current = window.setTimeout(() => { onLongPress(weekday, `${String(hour).padStart(2, '0')}:00`); pressTimer.current = null }, 800) }
  const bookingEvent = (booking: Booking, slot: AvailabilitySlot) => <div className={`timetable-event ${durationClass(booking.start, booking.end)} timetable-booking`} style={eventStyle(booking.start, booking.end)} key={booking.id} role="button" tabIndex={0} title="點按編輯預約" onClick={() => onBookingClick(booking, slot)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onBookingClick(booking, slot) }}><b>{booking.studentName}</b><small>{booking.start}–{booking.end} · {booking.region}</small></div>
  const startSlotPress = (slot: AvailabilitySlot) => { clearPress(); pressTimer.current = window.setTimeout(() => { slotLongPressFired.current = true; onLongPress(slot.weekday, slot.start); pressTimer.current = null }, 800) }
  const slotClickProps = (slot: AvailabilitySlot) => ({ role: 'button' as const, tabIndex: 0, onPointerDown: () => startSlotPress(slot), onPointerUp: clearPress, onPointerLeave: clearPress, onPointerCancel: clearPress, onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => event.preventDefault(), onClick: () => { if (slotLongPressFired.current) { slotLongPressFired.current = false; return } onSlotClick(slot) }, onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Enter' || event.key === ' ') onSlotClick(slot) } })
  return <div className="timetable-panel"><div className="timetable-heading"><div><span className="eyebrow">TERM TIMETABLE</span><h3>學生固定星期課表</h3><p>搶課結束後長按空堂新增學生；點按區塊編輯時段。</p></div><div className="timetable-legend"><span><i className="legend-dot duration-one" />1 小時</span><span><i className="legend-dot duration-two" />2 小時</span><span><i className="legend-dot duration-three" />3 小時以上</span></div></div><div className="timetable-grid"><div className="time-axis"><div className="time-axis-spacer" />{hours.map((hour) => <div className="time-label" key={hour}>{String(hour).padStart(2, '0')}:00</div>)}</div>{(Object.entries(weekdayLabels) as Array<[string, string]>).map(([value, label]) => { const weekday = Number(value) as Weekday; const daySlots = slots.filter((slot) => slot.weekday === weekday); return <div className="day-column" key={value}><div className="day-heading">{label.replace('星期', '')}</div>{hours.map((hour) => <div className="hour-cell" key={hour} onPointerDown={() => startPress(weekday, hour)} onPointerUp={clearPress} onPointerLeave={clearPress} onPointerCancel={clearPress} onContextMenu={(event) => event.preventDefault()} aria-label={`${label} ${hour}:00 空白格`} />)}{daySlots.flatMap((slot) => [...slot.bookings.map((booking) => bookingEvent(booking, slot)), ...freeSegmentsForSlot(slot).map((segment) => <div className="timetable-open timetable-clickable" style={eventStyle(segment.start, segment.end)} key={`${slot.id}-${segment.start}-${segment.end}`} {...slotClickProps(slot)}><b>可預約空堂</b><small>{segment.start}–{segment.end}{slot.presetRegion ? ` · ${slot.presetRegion}` : ''}</small></div>)])}</div>})}</div></div>
}

const settingsSections = [
  { id: 'name', label: '老師名稱' },
  { id: 'regions', label: '地點標籤' },
  { id: 'booking', label: '選課' },
] as const
type SettingsSection = typeof settingsSections[number]['id']

function SettingsTab({ settings, session, onProfileChange, onSettingsChange, reload, notify }: {
  settings: Settings
  session: TeacherSession
  onProfileChange: (session: TeacherSession) => void
  onSettingsChange: (settings: Settings) => void
  reload: () => Promise<void>
  notify: (message: string) => void
}) {
  const [section, setSection] = useState<SettingsSection>('name')
  const [savingSection, setSavingSection] = useState<SettingsSection | null>(null)
  const [open, setOpen] = useState(() => toLocalDateTime(settings.bookingOpen))
  const [close, setClose] = useState(() => toLocalDateTime(settings.bookingClose))
  const [tagOptions, setTagOptions] = useState(settings.tagOptions)
  const [newTag, setNewTag] = useState('')
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [renamedLabels, setRenamedLabels] = useState<Array<[string, string]>>([])
  const [displayName, setDisplayName] = useState(session.displayName)
  const [copiedLink, setCopiedLink] = useState<'book' | 'register' | 'availability' | null>(null)
  const confirmationKey = `bookingclass:share-settings-confirmed:${session.id}`
  const [linksConfirmed, setLinksConfirmed] = useState(() => {
    try { return sessionStorage.getItem(confirmationKey) === '1' } catch { return false }
  })

  const startUnchanged = open === toLocalDateTime(settings.bookingOpen)
  const endUnchanged = close === toLocalDateTime(settings.bookingClose)
  const bookingStart = new Date(startUnchanged ? settings.bookingOpen : open)
  const bookingEnd = new Date(endUnchanged ? settings.bookingClose : close)
  const getWindowError = () => {
    if (!startUnchanged && open.slice(0, 10) < localDate(new Date())) return '選課開始日期不得早於今天'
    if (!(bookingStart < bookingEnd)) return '選課結束時間必須晚於開始時間'
    return null
  }
  const windowError = getWindowError()
  const showLinks = linksConfirmed && savingSection !== 'booking' && !windowError && startUnchanged && endUnchanged

  const addTag = () => {
    const value = newTag.trim()
    if (!value || tagOptions.includes(value)) return
    setTagOptions((current) => [...current, value])
    setNewTag('')
  }

  const confirmTagEdit = () => {
    const value = editingValue.trim()
    if (!editingTag || !value || (value !== editingTag && tagOptions.includes(value))) return
    if (value !== editingTag) {
      setTagOptions((current) => current.map((tag) => tag === editingTag ? value : tag))
      setRenamedLabels((current) => [...current, [editingTag, value]])
    }
    setEditingTag(null)
  }

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    if (savingSection || !displayName.trim()) return
    setSavingSection('name')
    try {
      const updated = await updateTeacherProfile(session.id, displayName)
      onProfileChange(updated)
      setDisplayName(updated.displayName)
      notify('教師名稱已更新')
    } catch (error) {
      notify(error instanceof Error ? error.message : '教師名稱更新失敗')
    } finally {
      setSavingSection(null)
    }
  }

  const saveRegions = async () => {
    if (savingSection || editingTag) return
    setSavingSection('regions')
    try {
      for (const [oldLabel, newLabel] of renamedLabels) {
        await renameLocationLabel(oldLabel, newLabel, session.id)
        setRenamedLabels((current) => current.slice(1))
      }
      onSettingsChange(await saveSettings({ tagOptions }, session.id))
      if (renamedLabels.length) await reload()
      notify('地點標籤已儲存')
    } catch (error) {
      notify(error instanceof Error ? error.message : '地點標籤儲存失敗')
    } finally {
      setSavingSection(null)
    }
  }

  const saveBookingWindow = async () => {
    if (savingSection) return
    const error = getWindowError()
    if (error) { notify(error); return }
    setSavingSection('booking')
    setLinksConfirmed(false)
    setCopiedLink(null)
    try { sessionStorage.removeItem(confirmationKey) } catch { /* Keep the in-memory state when storage is unavailable. */ }
    try {
      const saved = await saveSettings({
        bookingOpen: bookingStart.toISOString(),
        bookingClose: bookingEnd.toISOString(),
      }, session.id)
      onSettingsChange(saved)
      setLinksConfirmed(true)
      try { sessionStorage.setItem(confirmationKey, '1') } catch { /* Keep the in-memory state when storage is unavailable. */ }
      notify('選課期間已儲存')
    } catch (error) {
      notify(error instanceof Error ? error.message : '選課期間儲存失敗')
    } finally {
      setSavingSection(null)
    }
  }

  const linkFor = (mode: 'book' | 'register' | 'availability') => publicLink(session.slug, mode)
  const copyLink = async (mode: 'book' | 'register' | 'availability') => {
    try {
      await navigator.clipboard.writeText(linkFor(mode))
      setCopiedLink(mode)
      notify('連結已複製')
    } catch {
      notify('無法複製連結，請手動選取網址')
    }
  }

  const navigateTabs = (event: React.KeyboardEvent, index: number) => {
    const count = settingsSections.length
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % count
    else if (event.key === 'ArrowLeft') next = (index - 1 + count) % count
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = count - 1
    else return
    event.preventDefault()
    const tab = settingsSections[next].id
    setSection(tab)
    document.getElementById(`settings-tab-${tab}`)?.focus()
  }

  return <div className="tab-content settings-layout">
    <div className="settings-tabs" role="tablist" aria-label="教師設定">
      {settingsSections.map(({ id, label }, index) => <button
        key={id}
        id={`settings-tab-${id}`}
        type="button"
        role="tab"
        aria-selected={section === id}
        aria-controls={`settings-panel-${id}`}
        tabIndex={section === id ? 0 : -1}
        onClick={() => setSection(id)}
        onKeyDown={(event) => navigateTabs(event, index)}
      >{label}</button>)}
    </div>
    <section className="panel settings-panel" id="settings-panel-name" role="tabpanel" aria-labelledby="settings-tab-name" hidden={section !== 'name'}>
      <h2>老師名稱</h2>
      <p>這個名稱會顯示在家長頁面。</p>
      <form className="profile-name-row" onSubmit={saveProfile}>
        <Field label="老師名稱">
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：林老師" required disabled={savingSection === 'name'} />
        </Field>
        <button type="submit" className="button primary" disabled={Boolean(savingSection) || !displayName.trim()}>{savingSection === 'name' ? '儲存中…' : '儲存名稱'}</button>
      </form>
    </section>
    <section className="panel settings-panel" id="settings-panel-regions" role="tabpanel" aria-labelledby="settings-tab-regions" hidden={section !== 'regions'}>
      <h2>地點標籤</h2>
      <p>地點標籤可用於學生檔案和課表限區。</p>
      <fieldset className="settings-fields" disabled={savingSection === 'regions'}>
        <div className="tag-list">{tagOptions.map((tag) => editingTag === tag
          ? <span className="managed-tag editing" key={tag}>
            <input aria-label="新標籤名稱" value={editingValue} onChange={(event) => setEditingValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') confirmTagEdit() }} />
            <button type="button" onClick={confirmTagEdit} aria-label="確認改名"><Check size={13} /></button>
            <button type="button" onClick={() => setEditingTag(null)} aria-label="取消編輯"><X size={13} /></button>
          </span>
          : <span className="managed-tag" key={tag}>
            {tag}
            <button type="button" onClick={() => { setEditingTag(tag); setEditingValue(tag) }} aria-label={`編輯${tag}`}><Pencil size={13} /></button>
            <button type="button" onClick={() => setTagOptions((current) => current.filter((item) => item !== tag))} aria-label={`刪除${tag}`}><X size={13} /></button>
          </span>)}</div>
        <div className="add-tag-row">
          <input aria-label="新增地點標籤" value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addTag() }} placeholder="例如：內湖、松山、線上" />
          <button className="button quiet" type="button" onClick={addTag}><Plus size={15} /> 新增地區</button>
        </div>
        <button className="button primary settings-save-regions" type="button" onClick={() => void saveRegions()} disabled={Boolean(savingSection) || Boolean(editingTag)}>
          {savingSection === 'regions' ? '儲存中…' : '儲存地點標籤'} <Check size={17} />
        </button>
      </fieldset>
    </section>
    <section className="panel settings-panel" id="settings-panel-booking" role="tabpanel" aria-labelledby="settings-tab-booking" hidden={section !== 'booking'}>
      <h2>設定本學期選課開放期間</h2>
      <p>家長在這段期間選課，選到的課會成為每週固定時段。</p>
      <fieldset className="settings-fields" disabled={savingSection === 'booking'}>
        <div className="form-grid two">
          <DateTimePicker label="開始時間" value={open} minimum="today" onChange={setOpen} />
          <DateTimePicker label="結束時間" value={close} minimum={{ after: open }} onChange={setClose} />
        </div>
        {windowError && <div className="booking-window-error" role="alert">{windowError}</div>}
        <button className="button primary" type="button" onClick={() => void saveBookingWindow()} disabled={Boolean(windowError) || Boolean(savingSection)}>
          {savingSection === 'booking' ? '儲存中…' : '儲存選課期間'} <Check size={17} />
        </button>
      </fieldset>
      <div className="link-panel">
        <div className="settings-subheading">
          <b>老師專屬家長連結</b>
          <small aria-live="polite">{showLinks ? '只會顯示這位老師的頁面。' : '儲存選課期間後，即可複製連結。'}</small>
        </div>
        {showLinks && ([
          ['book', '家長選課'],
          ['availability', '老師空堂'],
          ['register', '新生登記'],
        ] as const).map(([mode, label]) => <div className="link-row" key={mode}>
          <div><b>{label}</b><code title={linkFor(mode)}>{linkFor(mode)}</code></div>
          <button type="button" className="copy-link-button" aria-label={`${copiedLink === mode ? '已複製' : '複製'}${label}連結`} onClick={() => void copyLink(mode)}>
            {copiedLink === mode ? <Check size={15} /> : <Copy size={15} />} {copiedLink === mode ? '已複製' : '複製連結'}
          </button>
        </div>)}
      </div>
    </section>
    <div className="panel security-panel"><ShieldCheck size={21} /><div><h3>權限與個資</h3><p>老師後台使用 Supabase Auth 登入；家長端只透過公開 RPC 取得已驗證學生的可選時段。</p></div></div>
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
