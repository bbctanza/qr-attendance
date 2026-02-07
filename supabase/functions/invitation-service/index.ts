import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * HIGH-SECURITY INVITATION SERVICE
 * 1. Checks if the inviter is authorized (Admin/Developer)
 * 2. Requires the inviter's own password to confirm identity (Security feature)
 * 3. Prevents inviting users with the 'developer' role
 * 4. Dispatches a direct Supabase Invitation Email
 */
Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Authentication header missing')

    // Env Vars
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    // Admin Client (Uses Service Role)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    
    // Validate Inviter Session
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: inviter }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !inviter) throw new Error('Invalid or expired session. Please log in again.')

    // Parse Body
    const { action, inviteEmail, inviteRole, password } = await req.json()
    
    if (action !== 'send-invite') throw new Error('Invalid operation')
    if (!inviteEmail || !inviteRole || !password) throw new Error('Please provide email, role, and your password.')

    // 1. Security check: User cannot invite a Developer
    if (inviteRole === 'developer') {
      throw new Error('For security reasons, developer accounts cannot be created via invitations.')
    }

    // 2. Authorization check: Check inviter profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', inviter.id)
      .single()

    if (!profile || (profile.role !== 'admin' && profile.role !== 'developer')) {
      throw new Error('Permission Denied: You do not have authority to invite users.')
    }

    // 3. Security verification: Check inviter's password
    const authClient = createClient(supabaseUrl, anonKey)
    const { error: passCheckError } = await authClient.auth.signInWithPassword({
      email: inviter.email!,
      password: password,
    })

    if (passCheckError) {
      throw new Error('Identity verification failed: Incorrect password.')
    }

    // 4. Send the Supabase Invitation
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(inviteEmail, {
      data: {
        role: inviteRole,
        invited_by: inviter.id
      }
    })

    if (inviteError) {
      // Handle cases like "User already exists" gracefully for the UI
      if (inviteError.message.includes('already registered')) {
        throw new Error('This email address is already registered in the system.')
      }
      throw inviteError
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Invitation Service Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})




