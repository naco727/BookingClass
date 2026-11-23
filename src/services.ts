import { supabase } from './supabase.ts'
import { demoBookings, demoRegistrations, demoSettings, demoSlots, demoStudents, demoTeachers } from './mockData.ts'
import type { AvailabilitySlot, Booking, BookingSelection, MaterialPlan, PublicAvailability, PublicStudent, Registration, Region, Settings, Student, StudentProfileInput, TeacherProfile, TeacherSession } from './types.ts'

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const mockStorageKey = 'between-classes-mock-v3'
const mockSessionKey = `${mockStorageKey}:teacher-session`
const readMock = <T,>(key: string, fallback: T): T => {
  if (typeof localStorage === 'undefined') return clone(fallback)
  try { return JSON.parse(localStorage.getItem(`${mockStorageKey}:${key}`) ?? 'null') ?? clone(fallback) } catch { return clone(fallback) }
}
const legacyStudentTagOptions = new Set(['數學', '英文', '會考', '固定週課', '需帶講義', '重點追蹤'])
const normalizeMockSettings = (settings: Record<string, Settings>) => Object.fromEntries(Object.entries(settings).map(([teacherId, setting]) => {
  const options = Array.from(new Set((setting.tagOptions ?? []).filter((item) => !legacyStudentTagOptions.has(item))))
  return [teacherId, { ...setting, tagOptions: options.length || setting.tagOptions?.length === 0 ? options : ['天母', '北投', '士林'] }]
})) as Record<string, Settings>
const db = {
  teachers: readMock('teachers', demoTeachers),
  registrations: readMock('registrations', demoRegistrations),
  students: readMock('students', demoStudents),
  slots: readMock('slots', demoSlots),
  bookings: readMock('bookings', demoBookings),
  settings: normalizeMockSettings(readMock('settings', { [demoSettings.teacherId]: clone(demoSettings) }) as Record<string, Settings>),
}
const persistMock = () => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(`${mockStorageKey}:teachers`, JSON.stringify(db.teachers))
  localStorage.setItem(`${mockStorageKey}:registrations`, JSON.stringify(db.registrations))
  localStorage.setItem(`${mockStorageKey}:students`, JSON.stringify(db.students))
  localStorage.setItem(`${mockStorageKey}:slots`, JSON.stringify(db.slots))
  localStorage.setItem(`${mockStorageKey}:bookings`, JSON.stringify(db.bookings))
  localStorage.setItem(`${mockStorageKey}:settings`, JSON.stringify(db.settings))
}

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
const fromMinutes = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const within = (value: string, start: string, end: string) => toMinutes(value) >= toMinutes(start) && toMinutes(value) <= toMinutes(end)

function attachBookings(slot: AvailabilitySlot): AvailabilitySlot {
  const bookings = db.bookings.filter((b) => b.slotId === slot.id && b.status === 'confirmed').map((booking) => { const student = db.students.find((item) => item.id === booking.studentId); return { ...booking, studentGrade: student?.grade, studentSchool: student?.school, studentFocus: student?.focus, studentLocation: student?.location, studentPhone: student?.phone } })
  return { ...slot, dynamicRegion: slot.presetRegion ? null : bookings[0]?.region ?? slot.dynamicRegion ?? null, bookings }
}

function availableSegments(slot: AvailabilitySlot, studentRegion?: Region): PublicAvailability | null {
  const hydrated = attachBookings(slot)
  const firstRegion = hydrated.bookings[0]?.region ?? null
  const effectiveRegion = hydrated.presetRegion ?? firstRegion
  if (!hydrated.open || (effectiveRegion && studentRegion && effectiveRegion !== studentRegion)) return null
  const occupied = hydrated.bookings.map((booking) => ({ start: toMinutes(booking.start), end: toMinutes(booking.end) })).sort((a, b) => a.start - b.start)
  const segments: Array<{ start: string; end: string }> = []
  let cursor = toMinutes(hydrated.start)
  const end = toMinutes(hydrated.end)
  for (const range of occupied) {
    if (range.start > cursor) segments.push({ start: fromMinutes(cursor), end: fromMinutes(range.start) })
    cursor = Math.max(cursor, range.end)
  }
  if (cursor < end) segments.push({ start: fromMinutes(cursor), end: fromMinutes(end) })
  const bookableSegments = segments.filter((segment) => toMinutes(segment.end) - toMinutes(segment.start) > 30)
  const { bookings: _privateBookings, ...safeSlot } = hydrated
  return { ...safeSlot, segments: bookableSegments, effectiveRegion }
}

const publicStudent = (student: Student): PublicStudent => ({ id: student.id, name: student.name, phoneSuffix: student.phone.replace(/\D/g, '').slice(-3), region: student.region! })
const normalizeRegistration = (row: any): Registration => ({ ...row, teacherId: row.teacherId ?? row.teacher_id, createdAt: row.createdAt ?? row.created_at })
const normalizeStudent = (row: any): Student => ({ ...row, teacherId: row.teacherId ?? row.teacher_id, createdAt: row.createdAt ?? row.created_at, registrationId: row.registrationId ?? row.registration_id, tags: row.tags ?? [] })
const normalizeBooking = (row: any): Booking => ({ ...row, teacherId: row.teacherId ?? row.teacher_id, slotId: row.slotId ?? row.slot_id, studentId: row.studentId ?? row.student_id, start: row.start ?? row.start_time?.slice(0, 5), end: row.end ?? row.end_time?.slice(0, 5), studentName: row.studentName ?? row.students?.name ?? '', studentGrade: row.studentGrade ?? row.students?.grade, studentSchool: row.studentSchool ?? row.students?.school, studentFocus: row.studentFocus ?? row.students?.focus, studentLocation: row.studentLocation ?? row.students?.location, studentPhone: row.studentPhone ?? row.students?.phone })
const normalizeSlot = (row: any): AvailabilitySlot => ({ ...row, teacherId: row.teacherId ?? row.teacher_id, weekday: row.weekday ?? row.day_of_week, start: row.start ?? row.start_time?.slice(0, 5), end: row.end ?? row.end_time?.slice(0, 5), presetRegion: row.presetRegion ?? row.preset_region ?? null, dynamicRegion: row.dynamicRegion ?? row.bookings?.find((item: any) => item.status === 'confirmed')?.region ?? null, bookings: (row.bookings ?? []).filter((item: any) => item.status === 'confirmed').map(normalizeBooking) })
const normalizeSettings = (row: any): Settings => ({ teacherId: row.teacherId ?? row.teacher_id, bookingOpen: row.bookingOpen ?? row.booking_open, bookingClose: row.bookingClose ?? row.booking_close, tagOptions: row.tagOptions ?? row.tag_options ?? [] })

export async function getPublicTeacher(slug: string): Promise<TeacherProfile | null> {
  if (supabase) {
    const { data, error } = await supabase.rpc('public_teacher_by_slug', { p_slug: slug })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    return row ? { id: row.id, slug: row.slug, displayName: row.displayName ?? row.display_name } : null
  }
  return clone(db.teachers.find((teacher) => teacher.slug === slug) ?? null)
}

type RegistrationReceipt = Pick<Registration, 'id' | 'createdAt'>

export async function submitRegistration(input: Omit<Registration, 'id' | 'teacherId' | 'createdAt' | 'status'>, teacherId: string): Promise<RegistrationReceipt> {
  if (supabase) {
    const { data, error } = await supabase.rpc('public_submit_registration', {
      p_teacher_id: teacherId,
      p_name: input.name,
      p_grade: input.grade,
      p_school: input.school,
      p_focus: input.focus,
      p_location: input.location,
      p_phone: input.phone,
      p_material: input.material,
      p_note: input.note ?? null,
    }).single<{ registration_id: string; submitted_at: string }>()
    if (error?.message === 'registration_unavailable') throw new Error('此老師目前未開放新生登記，請確認連結或聯絡老師。')
    if (error && ['23514', '23502', '22P02'].includes(error.code)) throw new Error('請確認必填欄位都已填寫，並縮短過長的內容。')
    if (error) throw new Error('送出失敗，請稍後再試。')
    return { id: data.registration_id, createdAt: data.submitted_at }
  }
  const row: Registration = { ...input, teacherId, id: `reg-${Date.now()}`, createdAt: new Date().toISOString(), status: 'pending' }
  db.registrations.unshift(row)
  persistMock()
  return { id: row.id, createdAt: row.createdAt }
}

export async function listRegistrations(teacherId: string): Promise<Registration[]> {
  if (supabase) {
    const { data, error } = await supabase.from('student_registrations').select('*').eq('teacher_id', teacherId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(normalizeRegistration)
  }
  return clone(db.registrations.filter((item) => item.teacherId === teacherId))
}

export async function deleteRegistration(id: string, teacherId: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.rpc('delete_registration', { p_registration_id: id, p_teacher_id: teacherId })
    if (error) throw error
    return
  }
  const registration = db.registrations.find((item) => item.id === id && item.teacherId === teacherId)
  if (!registration) throw new Error('找不到這筆新生登記')
  db.registrations = db.registrations.filter((item) => item.id !== id || item.teacherId !== teacherId)
  persistMock()
}

export async function approveRegistration(id: string, teacherId: string): Promise<Student> {
  if (supabase) {
    const { data, error } = await supabase.rpc('approve_registration', { p_registration_id: id, p_teacher_id: teacherId })
    if (error) throw error
    return normalizeStudent(data)
  }
  const registration = db.registrations.find((item) => item.id === id && item.teacherId === teacherId)
  if (!registration) throw new Error('找不到這筆登記')
  registration.status = 'approved'
  const student: Student = { id: `stu-${Date.now()}`, teacherId, registrationId: registration.id, name: registration.name, grade: registration.grade, school: registration.school, focus: registration.focus, location: registration.location, phone: registration.phone, material: registration.material, region: null, tags: [], active: true, createdAt: new Date().toISOString() }
  db.students.unshift(student)
  persistMock()
  return clone(student)
}

export async function listStudents(teacherId: string): Promise<Student[]> {
  if (supabase) {
    const { data, error } = await supabase.from('students').select('*').eq('teacher_id', teacherId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(normalizeStudent)
  }
  return clone(db.students.filter((item) => item.teacherId === teacherId))
}

export async function teacherAddStudent(profile: StudentProfileInput, teacherId: string): Promise<string> {
  if (supabase) {
    const { data, error } = await supabase.rpc('teacher_add_student', {
      p_teacher_id: teacherId,
      p_name: profile.name,
      p_grade: profile.grade,
      p_school: profile.school,
      p_focus: profile.focus,
      p_location: profile.location,
      p_phone: profile.phone,
      p_material: profile.material,
      p_region: profile.region,
    })
    if (error?.code === '42501') throw new Error('僅限啟用的老師帳號新增學生，請確認登入狀態。')
    if (error?.message === 'invalid_student_region') throw new Error('這個地點標籤已無法使用，請更新後重新選擇。')
    if (error) throw new Error('新增學生失敗，請確認個資欄位或稍後再試。')
    return data
  }
  const student: Student = {
    ...profile,
    id: crypto.randomUUID(),
    teacherId,
    tags: [],
    active: true,
    createdAt: new Date().toISOString(),
  }
  db.students.unshift(student)
  persistMock()
  return student.id
}

export async function updateStudent(id: string, patch: Partial<Student>, teacherId: string): Promise<Student> {
  if (supabase) {
    const { teacherId: _teacherId, registrationId: _registrationId, createdAt: _createdAt, tags: _tags, active: _active, ...studentPatch } = patch
    const dbPatch = {
      ...(studentPatch.name !== undefined ? { name: studentPatch.name } : {}),
      ...(studentPatch.grade !== undefined ? { grade: studentPatch.grade } : {}),
      ...(studentPatch.school !== undefined ? { school: studentPatch.school } : {}),
      ...(studentPatch.focus !== undefined ? { focus: studentPatch.focus } : {}),
      ...(studentPatch.location !== undefined ? { location: studentPatch.location } : {}),
      ...(studentPatch.phone !== undefined ? { phone: studentPatch.phone } : {}),
      ...(studentPatch.material !== undefined ? { material: studentPatch.material } : {}),
      ...(studentPatch.region !== undefined ? { region: studentPatch.region } : {}),
    }
    const { data, error } = await supabase.from('students').update(dbPatch).eq('id', id).eq('teacher_id', teacherId).select('*').single()
    if (error) throw error
    return normalizeStudent(data)
  }
  const student = db.students.find((item) => item.id === id && item.teacherId === teacherId)
  if (!student) throw new Error('找不到學生')
  Object.assign(student, patch)
  persistMock()
  return clone(student)
}

export async function lookupStudents(name: string, teacherId: string): Promise<PublicStudent[]> {
  if (supabase) {
    const { data, error } = await supabase.rpc('public_lookup_students', { p_name: name, p_teacher_id: teacherId })
    if (error) throw error
    return (data ?? []) as PublicStudent[]
  }
  return db.students.filter((student) => student.teacherId === teacherId && student.active && student.region && student.name.trim() === name.trim()).map(publicStudent)
}

export async function getParentAvailability(studentId: string, teacherId: string): Promise<PublicAvailability[]> {
  if (supabase) {
    const { data, error } = await supabase.rpc('public_student_availability', { p_student_id: studentId, p_teacher_id: teacherId })
    if (error) throw error
    return (data ?? []) as PublicAvailability[]
  }
  const student = db.students.find((item) => item.id === studentId && item.teacherId === teacherId)
  const studentRegion = student?.region
  if (!student?.active || !studentRegion) return []
  const now = Date.now()
  const settings = db.settings[teacherId]
  if (!settings || now < Date.parse(settings.bookingOpen) || now > Date.parse(settings.bookingClose)) return []
  return db.slots.filter((slot) => slot.teacherId === teacherId).map((slot) => availableSegments(slot, studentRegion)).filter((slot): slot is PublicAvailability => Boolean(slot && slot.segments.length))
}

export async function getTeacherAvailability(teacherId: string): Promise<PublicAvailability[]> {
  if (supabase) {
    const { data, error } = await supabase.rpc('public_teacher_availability', { p_teacher_id: teacherId })
    if (error) throw error
    return (data ?? []) as PublicAvailability[]
  }
  return db.slots.filter((slot) => slot.teacherId === teacherId).map((slot) => availableSegments(slot)).filter((slot): slot is PublicAvailability => Boolean(slot && slot.segments.length))
}

export async function getPublicBookingStatus(teacherId: string): Promise<boolean> {
  if (supabase) {
    const { data, error } = await supabase.rpc('public_booking_window_open', { p_teacher_id: teacherId })
    if (error) throw error
    return Boolean(data)
  }
  const settings = db.settings[teacherId]
  return Boolean(settings && Date.now() >= Date.parse(settings.bookingOpen) && Date.now() <= Date.parse(settings.bookingClose))
}

export async function bookSelections(studentId: string, selections: BookingSelection[], teacherId: string): Promise<{ bookings: Booking[]; rejected: BookingSelection[] }> {
  if (supabase) {
    const { data, error } = await supabase.rpc('book_slots_atomic', { p_student_id: studentId, p_teacher_id: teacherId, p_selections: selections })
    if (error) throw error
    return data as { bookings: Booking[]; rejected: BookingSelection[] }
  }
  const student = db.students.find((item) => item.id === studentId && item.teacherId === teacherId)
  if (!student?.region) throw new Error('學生尚未完成地區建檔')
  const created: Booking[] = []
  const rejected: BookingSelection[] = []
  for (const selection of selections) {
    const slot = db.slots.find((item) => item.id === selection.slotId && item.teacherId === teacherId)
    if (!slot) { rejected.push(selection); continue }
    const publicView = availableSegments(slot, student.region)
    const valid = publicView?.segments.some((segment) => within(selection.start, segment.start, segment.end) && within(selection.end, segment.start, segment.end) && toMinutes(selection.start) < toMinutes(selection.end))
    if (!valid) { rejected.push(selection); continue }
    const booking: Booking = { id: `book-${Date.now()}-${Math.random().toString(16).slice(2)}`, teacherId, slotId: slot.id, studentId, studentName: student.name, region: student.region, start: selection.start, end: selection.end, createdAt: new Date().toISOString(), status: 'confirmed' }
    db.bookings.push(booking)
    created.push(clone(booking))
  }
  persistMock()
  return { bookings: created, rejected }
}

export async function listSlots(teacherId: string): Promise<AvailabilitySlot[]> {
  if (supabase) {
    const { data, error } = await supabase.from('availability_slots').select('*, bookings(*, students(name, grade, school, focus, location, phone))').eq('teacher_id', teacherId).order('weekday').order('start_time')
    if (error) throw error
    return (data ?? []).map(normalizeSlot)
  }
  return clone(db.slots.filter((item) => item.teacherId === teacherId).map(attachBookings))
}

export async function addSlot(input: Omit<AvailabilitySlot, 'id' | 'teacherId' | 'dynamicRegion' | 'bookings'>, teacherId: string): Promise<AvailabilitySlot> {
  if (supabase) {
    const { data, error } = await supabase.from('availability_slots').insert({ teacher_id: teacherId, weekday: input.weekday, start_time: input.start, end_time: input.end, preset_region: input.presetRegion, open: input.open, note: input.note }).select('*').single()
    if (error) throw error
    return normalizeSlot(data)
  }
  const row: AvailabilitySlot = { ...input, teacherId, id: `slot-${Date.now()}`, dynamicRegion: null, bookings: [] }
  db.slots.push(row)
  persistMock()
  return clone(row)
}

export async function updateSlot(id: string, patch: Pick<AvailabilitySlot, 'weekday' | 'start' | 'end' | 'presetRegion' | 'open' | 'note'>, teacherId: string): Promise<AvailabilitySlot> {
  if (supabase) {
    const { data, error } = await supabase.from('availability_slots').update({ weekday: patch.weekday, start_time: patch.start, end_time: patch.end, preset_region: patch.presetRegion, open: patch.open, note: patch.note }).eq('id', id).eq('teacher_id', teacherId).select('*').single()
    if (error) throw error
    return normalizeSlot(data)
  }
  const slot = db.slots.find((item) => item.id === id && item.teacherId === teacherId)
  if (!slot) throw new Error('找不到固定時段')
  Object.assign(slot, patch)
  persistMock()
  return clone(attachBookings(slot))
}

export async function cancelBooking(bookingId: string, teacherId: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId, p_teacher_id: teacherId })
    if (error) throw error
    return
  }
  const booking = db.bookings.find((item) => item.id === bookingId && item.teacherId === teacherId)
  if (booking) { booking.status = 'cancelled'; persistMock() }
}

export async function updateBooking(bookingId: string, start: string, end: string, teacherId: string): Promise<Booking> {
  if (supabase) {
    const { data, error } = await supabase.rpc('update_booking_time_atomic', { p_booking_id: bookingId, p_teacher_id: teacherId, p_start: start, p_end: end })
    if (error) throw error
    return normalizeBooking(data)
  }
  const booking = db.bookings.find((item) => item.id === bookingId && item.teacherId === teacherId && item.status === 'confirmed')
  const slot = booking ? db.slots.find((item) => item.id === booking.slotId && item.teacherId === teacherId) : null
  if (!booking || !slot) throw new Error('找不到預約')
  const conflict = db.bookings.some((item) => item.id !== bookingId && item.slotId === slot.id && item.status === 'confirmed' && toMinutes(start) < toMinutes(item.end) && toMinutes(end) > toMinutes(item.start))
  if (toMinutes(start) >= toMinutes(end) || toMinutes(start) < toMinutes(slot.start) || toMinutes(end) > toMinutes(slot.end) || conflict) throw new Error('新的時間與其他預約衝突')
  booking.start = start; booking.end = end; persistMock()
  return clone(attachBookings(slot).bookings.find((item) => item.id === bookingId) ?? booking)
}

export type TeacherBookingInput = {
  weekday: number
  start: string
  end: string
  slotId: string
  name: string
  grade: string
  school: string
  focus: string
  location: string
  phone: string
  material: MaterialPlan
  region: Region
}

export async function teacherCreateBooking(input: TeacherBookingInput, teacherId: string): Promise<Booking> {
  if (supabase) {
    const { data, error } = await supabase.rpc('teacher_create_booking', { p_teacher_id: teacherId, p_slot_id: input.slotId, p_start: input.start, p_end: input.end, p_name: input.name, p_grade: input.grade, p_school: input.school, p_focus: input.focus, p_location: input.location, p_phone: input.phone, p_material: input.material, p_region: input.region })
    if (error) throw error
    return normalizeBooking(data)
  }
  const slot = db.slots.find((item) => item.id === input.slotId && item.teacherId === teacherId)
  if (!slot || slot.weekday !== input.weekday) throw new Error('找不到固定時段')
  if (toMinutes(input.start) >= toMinutes(input.end) || toMinutes(input.start) < toMinutes(slot.start) || toMinutes(input.end) > toMinutes(slot.end)) throw new Error('新增學生時間不在固定時段內')
  const conflict = db.bookings.some((item) => item.teacherId === teacherId && item.slotId === input.slotId && item.status === 'confirmed' && toMinutes(input.start) < toMinutes(item.end) && toMinutes(input.end) > toMinutes(item.start))
  if (conflict) throw new Error('這段時間已經有預約')
  const student: Student = { id: `stu-${Date.now()}`, teacherId, name: input.name.trim(), grade: input.grade.trim(), school: input.school.trim(), focus: input.focus.trim(), location: input.location.trim(), phone: input.phone.trim(), material: input.material, region: input.region.trim(), tags: [], active: true, createdAt: new Date().toISOString() }
  const booking: Booking = { id: `book-${Date.now()}-${Math.random().toString(16).slice(2)}`, teacherId, slotId: input.slotId, studentId: student.id, studentName: student.name, region: input.region.trim(), start: input.start, end: input.end, createdAt: new Date().toISOString(), status: 'confirmed', studentGrade: student.grade, studentSchool: student.school, studentFocus: student.focus, studentLocation: student.location, studentPhone: student.phone }
  db.students.unshift(student); db.bookings.push(booking); persistMock(); return clone(booking)
}

export async function teacherBookExistingStudent(studentId: string, slotId: string, start: string, end: string, teacherId: string): Promise<Booking> {
  if (supabase) {
    const { data, error } = await supabase.rpc('teacher_book_existing_student', { p_teacher_id: teacherId, p_student_id: studentId, p_slot_id: slotId, p_start: start, p_end: end })
    if (error) throw error
    return normalizeBooking(data)
  }
  const student = db.students.find((item) => item.id === studentId && item.teacherId === teacherId && item.active)
  const slot = db.slots.find((item) => item.id === slotId && item.teacherId === teacherId)
  const settings = db.settings[teacherId]
  if (settings && Date.now() <= Date.parse(settings.bookingClose)) throw new Error('booking_still_open')
  if (!student || !student.region || !slot) throw new Error('只能選擇這位老師的正式學生')
  const publicView = availableSegments(slot, student.region)
  if (!publicView?.segments.some((segment) => within(start, segment.start, segment.end) && within(end, segment.start, segment.end) && toMinutes(start) < toMinutes(end))) throw new Error('這段時間目前不可預約，請重新選擇最新空檔')
  const booking: Booking = { id: `book-${Date.now()}-${Math.random().toString(16).slice(2)}`, teacherId, slotId, studentId, studentName: student.name, region: student.region, start, end, createdAt: new Date().toISOString(), status: 'confirmed', studentGrade: student.grade, studentSchool: student.school, studentFocus: student.focus, studentLocation: student.location, studentPhone: student.phone }
  db.bookings.push(booking); persistMock(); return clone(booking)
}

const mockSettingsFor = (teacherId: string): Settings => db.settings[teacherId] ?? {
  teacherId,
  bookingOpen: new Date().toISOString(),
  bookingClose: new Date(Date.now() + 86400000 * 30).toISOString(),
  tagOptions: [],
}

export async function getSettings(teacherId: string): Promise<Settings> {
  if (supabase) {
    const { data, error } = await supabase.from('booking_settings').select('*').eq('teacher_id', teacherId).single()
    if (error) throw error
    return normalizeSettings(data)
  }
  return clone(mockSettingsFor(teacherId))
}

export async function saveSettings(changes: Partial<Omit<Settings, 'teacherId'>>, teacherId: string): Promise<Settings> {
  if (supabase) {
    const { bookingOpen, bookingClose, tagOptions } = changes
    const fields = {
      ...(bookingOpen !== undefined && { booking_open: bookingOpen }),
      ...(bookingClose !== undefined && { booking_close: bookingClose }),
      ...(tagOptions !== undefined && { tag_options: tagOptions }),
    }
    const { data, error } = await supabase.from('booking_settings').update(fields).eq('teacher_id', teacherId).select('*').single()
    if (error) throw error
    return normalizeSettings(data)
  }
  db.settings[teacherId] = clone({ ...mockSettingsFor(teacherId), ...changes, teacherId })
  persistMock()
  return clone(db.settings[teacherId])
}

export async function renameLocationLabel(oldLabel: string, newLabel: string, teacherId: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.rpc('rename_location_label', { p_teacher_id: teacherId, p_old_label: oldLabel, p_new_label: newLabel })
    if (error) throw error
    return
  }
  db.students.forEach((student) => { if (student.teacherId === teacherId && student.region === oldLabel) student.region = newLabel })
  db.slots.forEach((slot) => { if (slot.teacherId === teacherId && slot.presetRegion === oldLabel) slot.presetRegion = newLabel })
  db.bookings.forEach((booking) => { if (booking.teacherId === teacherId && booking.region === oldLabel) booking.region = newLabel })
  const settings = mockSettingsFor(teacherId)
  db.settings[teacherId] = { ...settings, tagOptions: settings.tagOptions.map((tag) => tag === oldLabel ? newLabel : tag) }
  persistMock()
}

export async function deleteStudent(id: string, teacherId: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.rpc('delete_student', { p_student_id: id, p_teacher_id: teacherId })
    if (error) throw error
    return
  }
  db.students = db.students.filter((student) => !(student.id === id && student.teacherId === teacherId))
  db.bookings = db.bookings.filter((booking) => !(booking.studentId === id && booking.teacherId === teacherId))
  persistMock()
}

export async function deleteSlot(id: string, teacherId: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.rpc('delete_slot', { p_slot_id: id, p_teacher_id: teacherId })
    if (error) throw error
    return
  }
  db.slots = db.slots.filter((slot) => !(slot.id === id && slot.teacherId === teacherId))
  db.bookings = db.bookings.filter((booking) => !(booking.slotId === id && booking.teacherId === teacherId))
  persistMock()
}

export async function updateTeacherProfile(teacherId: string, displayName: string): Promise<TeacherSession> {
  if (supabase) {
    const { data, error } = await supabase.from('teachers').update({ display_name: displayName }).eq('id', teacherId).select('id, slug, display_name').single()
    if (error) throw error
    return { id: data.id, slug: data.slug, displayName: data.display_name }
  }
  const teacher = db.teachers.find((item) => item.id === teacherId)
  if (!teacher) throw new Error('找不到老師')
  teacher.displayName = displayName.trim() || teacher.displayName
  persistMock()
  return clone(teacher)
}

export async function teacherSignIn(email: string, password: string): Promise<TeacherSession> {
  if (supabase) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const { data } = await supabase.auth.getUser()
    if (data.user?.app_metadata?.role !== 'teacher') {
      await supabase.auth.signOut()
      throw new Error('此帳號沒有老師權限')
    }
    const { data: profile, error: profileError } = await supabase.from('teachers').select('id, slug, display_name').eq('id', data.user?.id).single()
    if (profileError) throw profileError
    return { id: profile.id, slug: profile.slug, displayName: profile.display_name }
  }
  if (password !== 'teacher123' || !['teacher@demo.tw', 'teacherb@demo.tw'].includes(email)) throw new Error('Demo 帳號或密碼不正確')
  const session = clone(db.teachers.find((teacher) => teacher.id === (email === 'teacherb@demo.tw' ? 'teacher-b' : 'teacher-a')) ?? demoTeachers[0])
  if (typeof localStorage !== 'undefined') localStorage.setItem(mockSessionKey, JSON.stringify(session))
  return session
}

export async function getCurrentTeacherSession(): Promise<TeacherSession | null> {
  if (supabase) {
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user || user.app_metadata?.role !== 'teacher') return null
    const { data, error } = await supabase.from('teachers').select('id, slug, display_name').eq('id', user.id).single()
    if (error) throw error
    return { id: data.id, slug: data.slug, displayName: data.display_name }
  }
  if (typeof localStorage === 'undefined') return null
  try { const session = JSON.parse(localStorage.getItem(mockSessionKey) ?? 'null') as TeacherSession | null; return session?.id && db.teachers.some((teacher) => teacher.id === session.id) ? session : null } catch { return null }
}

export async function teacherSignOut(): Promise<void> { if (supabase) await supabase.auth.signOut(); if (typeof localStorage !== 'undefined') localStorage.removeItem(mockSessionKey) }

export async function updateTeacherPassword(password: string): Promise<void> {
  if (!supabase) throw new Error('目前是本機假資料模式，請使用老師 Demo 帳號登入')
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}
