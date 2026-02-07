import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, ...payload } = await req.json()
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: adminUser }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !adminUser) throw new Error('Unauthorized')

    // Verify admin/developer role
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', adminUser.id)
      .single()

    if (!profile || (profile.role !== 'admin' && profile.role !== 'developer')) {
      throw new Error('Unauthorized permissions')
    }

    if (action === 'send-invite') {
      const { password, inviteEmail, inviteRole } = payload

      // 1. Verify admin password (Security check)
      const { error: signInError } = await createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      ).auth.signInWithPassword({
        email: adminUser.email!,
        password: password,
      })

      if (signInError) throw new Error('Invalid password verification')

      // 2. Send Supabase Invitation directly
      const { error: inviteError } = await supabaseClient.auth.admin.inviteUserByEmail(inviteEmail, {
        data: {
          role: inviteRole,
          invited_by: adminUser.id
        }
      })

      if (inviteError) throw inviteError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Invalid action')

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
