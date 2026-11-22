# 課間 Between Classes｜家教搶課 MVP

這是一套從零建立的 React + TypeScript + Supabase ready 家教搶課網站。預設不需要 Supabase 就能在本機用假資料驗證流程；填入 `.env` 後，服務層會改用 Supabase Auth、PostgreSQL 與 RPC。

## 本機啟動

```powershell
npm install
npm run dev
```

開啟 Vite 顯示的網址。預設 Demo 老師帳號：

- Email：`teacher@demo.tw`
- 密碼：`teacher123`

可用 `teacherb@demo.tw` 測試 B 老師；B 老師初始沒有 A 老師的學生、登記或課表資料。

本機 Demo 的假資料會存在瀏覽器 `localStorage`，因此使用老師專屬連結完成的新生登記、審核、學生、預約與課表，重新整理後仍會保留；清除瀏覽器網站資料會重置本機 Demo。填入 Supabase 環境變數並執行 migration 後，則會改由 PostgreSQL 永久保存。

## 建立 Supabase

1. 建立 Supabase project，依序執行 [`supabase/migrations/001_tutor_booking.sql`](C:/家教搶課/supabase/migrations/001_tutor_booking.sql)、[`supabase/migrations/002_security_and_teacher_booking.sql`](C:/家教搶課/supabase/migrations/002_security_and_teacher_booking.sql) 與 [`supabase/migrations/003_add_teacher_ed2555.sql`](C:/家教搶課/supabase/migrations/003_add_teacher_ed2555.sql)。
2. 在 Supabase Auth 建立老師 Email 帳號，關閉公開註冊，並在 `public.teachers` 建立同一個 UUID、slug 與顯示名稱；把該使用者的 `app_metadata` 設成 `{ "role": "teacher" }`。不要把 service role key 放進前端。
3. 複製 `.env.example` 為 `.env.local`，填入 project URL 與 publishable key。前端會優先讀取 `VITE_SUPABASE_PUBLISHABLE_KEY`，也相容舊的 `VITE_SUPABASE_ANON_KEY`。
4. 若要載入假資料，執行 [`supabase/seed.sql`](C:/家教搶課/supabase/seed.sql)。

本次版本將時段從單日日期改為每週固定星期；若你已經在 Supabase 套用過舊版 migration，請在開發環境重設資料庫後依序重新執行 `001_tutor_booking.sql` 與 `002_security_and_teacher_booking.sql`。

## 已實作的流程

- 公開新生登記：送出後狀態為 `pending`，顯示「已記錄學生資訊，請等候老師審核與回覆」。
- 老師後台：Auth 登入、審核新生、建立正式學生、編輯地區與加強項目、管理任意地區標籤、新增每週固定時段、預先限區、設定搶課窗、查看與取消預約。
- 多老師隔離：每位老師都有自己的 teacher_id、學生、登記、固定課表、預約與設定；A 老師的連結不會讀到 B 老師資料。
- 專屬連結：老師在「搶課設定」可複製家長搶課、新生登記與老師空堂查看連結；專屬頁面只顯示對應的家長功能，不顯示首頁導覽、老師後台或其他老師入口。
- 新生提醒：新生登記完成頁提供「老師好，我已完成新生登記。再麻煩確認謝謝。\n學生姓名：…」複製按鈕，可直接貼到 LINE。
- 家長搶課：姓名比對；同名以聯絡方式末三碼區分；只取得該學生的可選空檔與最小必要欄位。
- 時段判斷：所有時段都是每週固定的星期日～星期六；先扣除已預約區間；原始時段的第一筆成功預約會形成動態地區鎖；預先限區優先。
- 地區管理：學生只使用上課地區標籤；老師可在「搶課設定」新增、編輯或刪除天母、北投、士林以外的任意地區名稱。
- 審核與課表：待審核資料可開啟浮窗查看家長填寫的完整內容；老師可刪除學生或固定時段；固定課表以星期日～星期六、每小時一格呈現，預約顏色依 1 小時、2 小時、3 小時以上區分；空白格長按約 0.8 秒新增時段，點選彩色預約區塊可取消預約並確認。
- 競態控制：`book_slots_atomic` 對原始時段 `FOR UPDATE`，在同一交易內檢查可用時間、地區與搶課窗，再寫入預約。衝突項目回傳 `rejected`，前端提示「請從最新可選時段重新選擇」。
- RLS：家長不能直接讀 `students`、`bookings`、`availability_slots`；只能呼叫已限制輸出的公開 RPC。老師操作需要 `app_metadata.role = teacher`。

## 驗證建議

1. 公開頁 → 新生登記：送出「林品妍」等資料。
2. 老師後台 → 待審核 →「通過並建檔」→ 編輯學生 → 標記天母或北投。
3. 家長搶課 → 輸入正式學生姓名；同名「陳昀安」會出現兩筆，只有末三碼與地區可選，不會暴露電話全文；時段會顯示星期幾與固定時間。
4. 以天母學生查詢 `slot-001`，會看到 12:00–14:00 與 16:00–17:00；以北投學生查詢時，因原始時段已被天母先預約，該時段會被完全省略。
5. 重新查詢同一學生，選一段送出後，老師完整課表會顯示預約。若兩個瀏覽器同時送同一原始時段，資料庫鎖只會讓第一筆成功，另一筆收到 rejected。

## 建置檢查

```powershell
npm run build
```
