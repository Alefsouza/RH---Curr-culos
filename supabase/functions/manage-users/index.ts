import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error("Acesso não autorizado.");

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) throw new Error("Sessão inválida.");

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('usuarios')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      throw new Error("Acesso negado. Apenas administradores podem realizar esta ação.");
    }

    const bodyText = await req.text();
    const body = JSON.parse(bodyText);
    const { action, payload } = body;

    if (action === 'list') {
      const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;
      
      const { data: profiles } = await supabaseAdmin.from('usuarios').select('id, nome, is_admin');
      
      const users = usersData.users.map(u => {
        const p = profiles?.find(pr => pr.id === u.id);
        return {
          id: u.id,
          email: u.email,
          nome: p?.nome || u.user_metadata?.name || 'Sem nome',
          is_admin: p?.is_admin || false,
          last_sign_in_at: u.last_sign_in_at,
          created_at: u.created_at
        };
      });
      
      // Order by created_at DESC
      users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return new Response(JSON.stringify({ users }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    if (action === 'create') {
      const { email, password, nome, is_admin } = payload;
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email, 
        password, 
        email_confirm: true, 
        user_metadata: { name: nome, is_admin: is_admin || false }
      });
      if (createError) throw createError;
      
      await supabaseAdmin.from('usuarios').update({ 
        is_admin: is_admin || false, 
        nome 
      }).eq('id', newUser.user.id);

      return new Response(JSON.stringify({ user: newUser.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    if (action === 'update') {
      const { id, email, nome, is_admin } = payload;
      const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        email, 
        user_metadata: { name: nome, is_admin: is_admin || false }
      });
      if (updateError) throw updateError;

      await supabaseAdmin.from('usuarios').update({ 
        nome, 
        email, 
        is_admin: is_admin || false 
      }).eq('id', id);

      return new Response(JSON.stringify({ user: updatedUser.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    if (action === 'delete') {
      const { id } = payload;
      if (id === user.id) throw new Error("Você não pode excluir sua própria conta.");
      
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (deleteError) throw deleteError;
      
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    if (action === 'reset-password') {
      const { id, password } = payload;
      const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
      if (resetError) throw resetError;
      
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error("Ação inválida.");

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
