import assert from 'node:assert/strict'
import { approveRegistration, bookSelections, getParentAvailability, getPublicTeacher, getSettings, lookupStudents, saveSettings, submitRegistration, teacherAddStudent, teacherBookExistingStudent, updateBooking, updateStudent } from '../src/services.ts'

const teacherA = await getPublicTeacher('lin')
const teacherB = await getPublicTeacher('chen')
assert.equal(teacherA?.id, 'teacher-a', 'A 老師專屬 slug 應可解析')
assert.equal(teacherB?.id, 'teacher-b', 'B 老師專屬 slug 應可解析')

const sameName = await lookupStudents('陳昀安', 'teacher-a')
assert.deepEqual(sameName, { students: [], needsContact: true }, '同名時必須先確認聯絡資料')
const verified = await lookupStudents('陳昀安', 'teacher-a', '333')
assert.deepEqual(verified.students, [{ id: 'stu-001', name: '陳昀安', region: '天母' }], '公開查詢只回傳確認後的最小資料')

const profile = { name: '聯絡方式測試', grade: '小六', school: '測試國小', focus: '數學', location: '測試地址', material: '已有' }
const receipt = await submitRegistration({ ...profile, phone: null, contactMethod: 'official_line', contactName: '官方名稱' }, 'teacher-a')
const approved = await approveRegistration(receipt.id, 'teacher-a')
assert.equal(approved.contactMethod, 'official_line')
assert.equal(approved.contactName, '官方名稱')
await updateStudent(approved.id, { region: '天母' }, 'teacher-a')
const existingId = await teacherAddStudent({ ...profile, phone: null, contactMethod: 'messenger', contactName: '訊息名稱', region: '天母' }, 'teacher-a')
assert.deepEqual(await lookupStudents(profile.name, 'teacher-a', '錯誤名稱'), { students: [], needsContact: true })
assert.deepEqual((await lookupStudents(profile.name, 'teacher-a', '訊息名稱')).students, [{ id: existingId, name: profile.name, region: '天母' }])
await updateStudent(existingId, { phone: '0911222888', contactMethod: 'phone', contactName: null }, 'teacher-a')
assert.equal((await lookupStudents(profile.name, 'teacher-a', '888')).students[0]?.id, existingId)

const tianmu = await getParentAvailability('stu-001', 'teacher-a')
const tianmuSlot = tianmu.find((slot) => slot.id === 'slot-001')
assert.equal(tianmuSlot?.weekday, 1, '固定課表應使用星期一到星期日的 weekday')
assert.deepEqual(tianmuSlot?.segments, [{ start: '12:00', end: '14:00' }, { start: '16:00', end: '17:00' }], '天母學生只能看到扣除既有預約後的空檔')
assert.ok(tianmu.every((slot) => !('bookings' in slot) && !('studentName' in slot) && !('phone' in slot)), '家長可選空檔 API 不得回傳預約或個資')

const trimToThirty = await bookSelections('stu-001', [{ slotId: 'slot-001', start: '16:00', end: '16:30' }], 'teacher-a')
assert.equal(trimToThirty.bookings.length, 1, '可在剩餘空檔建立預約')
const afterThirty = await getParentAvailability('stu-001', 'teacher-a')
assert.deepEqual(afterThirty.find((slot) => slot.id === 'slot-001')?.segments, [{ start: '12:00', end: '14:00' }], '剩餘剛好 30 分鐘的空檔不得回傳給家長')

const updatedBooking = await updateBooking('book-001', '13:00', '14:00', 'teacher-a')
assert.equal(updatedBooking.start, '13:00', '老師修改預約時間應可儲存')

const outOfRange = await bookSelections('stu-001', [{ slotId: 'slot-001', start: '11:00', end: '13:00' }], 'teacher-a')
assert.equal(outOfRange.bookings.length, 0, '不可把原始 12:00–14:00 空檔改填成 11:00–13:00')
assert.equal(outOfRange.rejected.length, 1, '超出可選空檔的時間應被拒絕')

const beitou = await getParentAvailability('stu-002', 'teacher-a')
assert.ok(!beitou.some((slot) => slot.id === 'slot-001'), '北投學生不得看到已被天母鎖定的原始時段')
assert.ok(beitou.some((slot) => slot.id === 'slot-002'), '北投學生仍可看到預先限北投的時段')

const race = await Promise.all([
  bookSelections('stu-001', [{ slotId: 'slot-003', start: '09:00', end: '10:00' }], 'teacher-a'),
  bookSelections('stu-002', [{ slotId: 'slot-003', start: '10:00', end: '11:00' }], 'teacher-a'),
])
assert.equal(race.filter((result) => result.bookings.length === 1).length, 1, '同一原始時段不同地區競態只能有一筆成功')
assert.equal(race.filter((result) => result.rejected.length === 1).length, 1, '競態失敗者應收到 rejected，要求重新取得最新時段')

const settings = await getSettings('teacher-a')
assert.ok(settings.tagOptions.includes('天母') && settings.tagOptions.includes('北投') && settings.tagOptions.includes('士林'), '老師應有可管理的地區選項')
assert.deepEqual(await lookupStudents('陳昀安', 'teacher-b', '333'), { students: [], needsContact: false }, 'B 老師不得看到 A 老師學生')
await saveSettings({ ...settings, bookingClose: new Date(Date.now() - 1000).toISOString() }, 'teacher-a')
const teacherAdded = await teacherBookExistingStudent('stu-003', 'slot-001', '12:00', '13:00', 'teacher-a')
assert.equal(teacherAdded.studentId, 'stu-003', '搶課結束後老師只能替正式學生新增預約')

console.log('Mock verification passed: privacy, regional locking, gap calculation, and race behavior.')
