-- Migration 20260610124027_add_chatbot_whatsapp.sql

-- Seed User with idempotency
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'financeiro@viasudeste.com') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'financeiro@viasudeste.com',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Administrador"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    INSERT INTO public.usuarios (id, email, nome, is_admin)
    VALUES (new_user_id, 'financeiro@viasudeste.com', 'Administrador', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Add new columns to templates_mensagens safely
ALTER TABLE public.templates_mensagens 
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'texto_simples',
  ADD COLUMN IF NOT EXISTS pergunta_texto TEXT,
  ADD COLUMN IF NOT EXISTS botao_sim_texto TEXT,
  ADD COLUMN IF NOT EXISTS botao_sim_acao TEXT,
  ADD COLUMN IF NOT EXISTS botao_nao_texto TEXT,
  ADD COLUMN IF NOT EXISTS botao_nao_acao TEXT,
  ADD COLUMN IF NOT EXISTS etapa_destino_id UUID REFERENCES public.etapas(id) ON DELETE SET NULL;

-- Add new columns to candidatos
ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS ativo_kanban BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS motivo_inativo TEXT;

-- Create respostas_whatsapp
CREATE TABLE IF NOT EXISTS public.respostas_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES public.candidatos(id) ON DELETE CASCADE,
  mensagem_id TEXT,
  resposta TEXT CHECK (resposta IN ('sim', 'nao')),
  criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create conversas_whatsapp
CREATE TABLE IF NOT EXISTS public.conversas_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES public.candidatos(id) ON DELETE CASCADE,
  texto TEXT,
  direcao TEXT CHECK (direcao IN ('enviada', 'recebida')),
  criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- RLS for respostas_whatsapp
ALTER TABLE public.respostas_whatsapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "respostas_whatsapp_select" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_select" ON public.respostas_whatsapp 
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "respostas_whatsapp_insert" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_insert" ON public.respostas_whatsapp 
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "respostas_whatsapp_update" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_update" ON public.respostas_whatsapp 
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "respostas_whatsapp_delete" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_delete" ON public.respostas_whatsapp 
  FOR DELETE TO authenticated USING (true);

-- RLS for conversas_whatsapp
ALTER TABLE public.conversas_whatsapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversas_whatsapp_select" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_select" ON public.conversas_whatsapp 
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "conversas_whatsapp_insert" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_insert" ON public.conversas_whatsapp 
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "conversas_whatsapp_update" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_update" ON public.conversas_whatsapp 
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "conversas_whatsapp_delete" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_delete" ON public.conversas_whatsapp 
  FOR DELETE TO authenticated USING (true);
