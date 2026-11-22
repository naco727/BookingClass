import type { AvailabilitySlot, Booking, Registration, Settings, Student, TeacherProfile } from './types'

const today = new Date()
export const demoTeachers: TeacherProfile[] = [
  { id: 'teacher-a', slug: 'lin', displayName: '林老師' },
  { id: 'teacher-b', slug: 'chen', displayName: '陳老師' },
]

export const demoRegistrations: Registration[] = [
  {
    id: 'reg-001', teacherId: 'teacher-a', createdAt: new Date(Date.now() - 86400000).toISOString(), status: 'pending',
    name: '林品妍', grade: '國一', school: '石牌國中', focus: '數學基礎與應用題', location: '天母住家', phone: '0912-345-678', material: '自編', note: '希望平日下午。'
  },
]

export const demoStudents: Student[] = [
  {
    id: 'stu-001', teacherId: 'teacher-a', name: '陳昀安', grade: '國二', school: '蘭雅國中', focus: '數學、理化', location: '天母住家', phone: '0911-222-333', material: '自編', region: '天母', tags: [], active: true, createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
  },
  {
    id: 'stu-002', teacherId: 'teacher-a', name: '陳昀安', grade: '國一', school: '北投國中', focus: '英文閱讀', location: '北投住家', phone: '0922-444-555', material: '已有', region: '北投', tags: [], active: true, createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: 'stu-003', teacherId: 'teacher-a', name: '王子謙', grade: '國三', school: '天母國中', focus: '會考總複習', location: '天母住家', phone: '0933-666-777', material: '購買市售', region: '天母', tags: [], active: true, createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
  },
]

export const demoBookings: Booking[] = [
  { id: 'book-001', teacherId: 'teacher-a', slotId: 'slot-001', studentId: 'stu-001', studentName: '陳昀安', region: '天母', start: '14:00', end: '16:00', createdAt: new Date(Date.now() - 3600000).toISOString(), status: 'confirmed' },
]

export const demoSlots: AvailabilitySlot[] = [
  { id: 'slot-001', teacherId: 'teacher-a', weekday: 1, start: '12:00', end: '17:00', presetRegion: null, dynamicRegion: '天母', open: true, note: '週一下午長時段', bookings: [] },
  { id: 'slot-002', teacherId: 'teacher-a', weekday: 1, start: '18:00', end: '21:00', presetRegion: '北投', dynamicRegion: null, open: true, note: '週一晚間指定北投', bookings: [] },
  { id: 'slot-003', teacherId: 'teacher-a', weekday: 6, start: '09:00', end: '12:00', presetRegion: null, dynamicRegion: null, open: true, note: '週六早上', bookings: [] },
  { id: 'slot-004', teacherId: 'teacher-a', weekday: 6, start: '14:00', end: '17:00', presetRegion: '天母', dynamicRegion: null, open: true, note: '週六午後指定天母', bookings: [] },
  { id: 'slot-005', teacherId: 'teacher-a', weekday: 0, start: '19:00', end: '21:00', presetRegion: null, dynamicRegion: null, open: true, note: '週日晚間', bookings: [] },
]

export const demoSettings: Settings = {
  teacherId: 'teacher-a',
  bookingOpen: new Date(today.getTime() - 86400000).toISOString(),
  bookingClose: new Date(today.getTime() + 86400000 * 30).toISOString(),
  tagOptions: ['天母', '北投', '士林'],
}
