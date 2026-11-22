// Teacher-managed location labels. The initial demo includes 天母、北投、士林,
// but production teachers may add any label such as 內湖、松山 or 線上。
export type Region = string
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type RegistrationStatus = 'pending' | 'approved' | 'rejected'
export type MaterialPlan = '自編' | '已有' | '購買市售'

export type Registration = {
  id: string
  teacherId: string
  createdAt: string
  status: RegistrationStatus
  name: string
  grade: string
  school: string
  focus: string
  location: string
  phone: string
  material: MaterialPlan
  note?: string
}

export type Student = {
  id: string
  teacherId: string
  registrationId?: string
  name: string
  grade: string
  school: string
  focus: string
  location: string
  phone: string
  material: MaterialPlan
  region: Region | null
  tags: string[]
  active: boolean
  createdAt: string
}

export type Booking = {
  id: string
  teacherId: string
  slotId: string
  studentId: string
  studentName: string
  region: Region
  start: string
  end: string
  createdAt: string
  status: 'confirmed' | 'cancelled'
  studentGrade?: string
  studentSchool?: string
  studentFocus?: string
  studentLocation?: string
  studentPhone?: string
}

export type AvailabilitySlot = {
  id: string
  teacherId: string
  weekday: Weekday
  start: string
  end: string
  presetRegion: Region | null
  dynamicRegion: Region | null
  open: boolean
  note: string
  bookings: Booking[]
}

export type BookingSelection = {
  slotId: string
  start: string
  end: string
}

export type PublicStudent = {
  id: string
  name: string
  phoneSuffix: string
  region: Region
}

export type PublicAvailability = Omit<AvailabilitySlot, 'bookings'> & {
  segments: Array<{ start: string; end: string }>
  effectiveRegion: Region | null
}

export type Settings = {
  teacherId: string
  bookingOpen: string
  bookingClose: string
  tagOptions: string[]
}

export type TeacherProfile = {
  id: string
  slug: string
  displayName: string
}

export type TeacherSession = TeacherProfile
