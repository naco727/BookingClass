import { createClient } from 'npm:@supabase/supabase-js@2.119.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

const projectUrl = Deno.env.get('SUPABASE_URL')
const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const redirectTo = Deno.env.get('TEACHER_INVITE_REDIRECT_URL') || 'https://naco727.github.io/BookingClass/'
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return reply({ message: '請使用老師邀請表單。' }, 405)

  const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1]
  if (!token) return reply({ message: '請先登入管理員帳號。' }, 401)
  if (!projectUrl || !publicKey || !serviceKey) return reply({ message: '邀請服務尚未完成設定。' }, 503)

  const caller = createClient(projectUrl, publicKey, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: authError } = await caller.auth.getUser(token)
  if (authError || !user) return reply({ message: '登入已失效，請重新登入。' }, 401)

  const { data: isAdmin, error: permissionError } = await caller.rpc('is_teacher_admin')
  if (permissionError) return reply({ message: '無法確認管理員權限，請稍後再試。' }, 503)
  if (isAdmin !== true) return reply({ message: '此帳號沒有老師邀請權限。' }, 403)

  const input = await request.json().catch(() => null)
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply({ message: '請輸入有效的 Email。' }, 400)
  }

  const admin = createClient(projectUrl, serviceKey, clientOptions)
  const { data, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
  if (inviteError && inviteError.code !== 'email_exists') {
    if (inviteError.status === 429) return reply({ message: '已達寄信頻率限制，請稍後再試。' }, 429)
    if (inviteError.code === 'email_address_not_authorized') {
      return reply({ message: '寄信服務不允許寄給這個地址，請檢查 Supabase 的 SMTP 設定。' }, 409)
    }
    if (inviteError.code === 'email_address_invalid' || inviteError.code === 'validation_failed') {
      return reply({ message: '請確認 Email 是否正確。' }, 400)
    }
    console.error('Teacher invitation failed', inviteError.code, inviteError.status)
    return reply({ message: '寄送邀請失敗，請稍後再試。' }, 502)
  }

  const { data: outcome, error: provisionError } = await admin.rpc('provision_invited_teacher', {
    p_admin_id: user.id,
    p_email: email,
    p_user_id: data.user?.id ?? null,
  })

  if (provisionError) {
    console.error('Teacher provisioning failed', provisionError.code)
    return reply({ message: '老師權限尚未設定完成，請用同一個 Email 重試。' }, 503)
  }
  if (outcome === 'inactive') return reply({ message: '這個老師帳號目前已停用。' }, 409)
  if (outcome === 'account_exists') return reply({ message: '此 Email 已有帳號，無法用新老師邀請授權。' }, 409)
  if (outcome !== 'authorized' && outcome !== 'already_authorized') {
    return reply({ message: '無法確認老師權限，請用同一個 Email 重試。' }, 503)
  }

  return reply({ email, outcome: inviteError ? outcome : 'sent' })
})
