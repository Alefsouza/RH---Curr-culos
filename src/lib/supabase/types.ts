// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analises: {
        Row: {
          candidato_id: string | null
          criado_em: string
          detalhes: Json | null
          id: string
          resultado: string | null
          user_id: string
          vaga_id: string | null
        }
        Insert: {
          candidato_id?: string | null
          criado_em?: string
          detalhes?: Json | null
          id?: string
          resultado?: string | null
          user_id: string
          vaga_id?: string | null
        }
        Update: {
          candidato_id?: string | null
          criado_em?: string
          detalhes?: Json | null
          id?: string
          resultado?: string | null
          user_id?: string
          vaga_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analises_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analises_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analises_vaga_id_fkey"
            columns: ["vaga_id"]
            isOneToOne: false
            referencedRelation: "vagas"
            referencedColumns: ["id"]
          },
        ]
      }
      candidato_etapa: {
        Row: {
          candidato_id: string | null
          criado_em: string
          data_entrada: string
          etapa_id: string | null
          id: string
          usuario_id: string
        }
        Insert: {
          candidato_id?: string | null
          criado_em?: string
          data_entrada?: string
          etapa_id?: string | null
          id?: string
          usuario_id: string
        }
        Update: {
          candidato_id?: string | null
          criado_em?: string
          data_entrada?: string
          etapa_id?: string | null
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidato_etapa_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidato_etapa_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidato_etapa_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      candidatos: {
        Row: {
          criado_em: string
          curriculo_url: string | null
          dados_extraidos: Json | null
          data_recebimento: string | null
          duplicado_de: string | null
          email: string | null
          etapa_id: string | null
          fonte: string | null
          id: string
          nome: string
          telefone: string | null
          user_id: string
          vaga_id: string | null
        }
        Insert: {
          criado_em?: string
          curriculo_url?: string | null
          dados_extraidos?: Json | null
          data_recebimento?: string | null
          duplicado_de?: string | null
          email?: string | null
          etapa_id?: string | null
          fonte?: string | null
          id?: string
          nome: string
          telefone?: string | null
          user_id: string
          vaga_id?: string | null
        }
        Update: {
          criado_em?: string
          curriculo_url?: string | null
          dados_extraidos?: Json | null
          data_recebimento?: string | null
          duplicado_de?: string | null
          email?: string | null
          etapa_id?: string | null
          fonte?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          user_id?: string
          vaga_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidatos_duplicado_de_fkey"
            columns: ["duplicado_de"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidatos_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidatos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidatos_vaga_id_fkey"
            columns: ["vaga_id"]
            isOneToOne: false
            referencedRelation: "vagas"
            referencedColumns: ["id"]
          },
        ]
      }
      etapas: {
        Row: {
          cor: string | null
          criado_em: string
          id: string
          nome: string
          ordem: number
          user_id: string
        }
        Insert: {
          cor?: string | null
          criado_em?: string
          id?: string
          nome: string
          ordem?: number
          user_id: string
        }
        Update: {
          cor?: string | null
          criado_em?: string
          id?: string
          nome?: string
          ordem?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "etapas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_whatsapp: {
        Row: {
          candidato_id: string | null
          criado_em: string
          enviado_em: string | null
          etapa_id: string | null
          external_id: string | null
          id: string
          numero_whatsapp: string
          status: string | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          candidato_id?: string | null
          criado_em?: string
          enviado_em?: string | null
          etapa_id?: string | null
          external_id?: string | null
          id?: string
          numero_whatsapp: string
          status?: string | null
          template_id?: string | null
          user_id: string
        }
        Update: {
          candidato_id?: string | null
          criado_em?: string
          enviado_em?: string | null
          etapa_id?: string | null
          external_id?: string | null
          id?: string
          numero_whatsapp?: string
          status?: string | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_whatsapp_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates_mensagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      templates_mensagens: {
        Row: {
          criado_em: string
          etapa_id: string | null
          id: string
          texto: string | null
          user_id: string
          variaveis: Json | null
        }
        Insert: {
          criado_em?: string
          etapa_id?: string | null
          id?: string
          texto?: string | null
          user_id: string
          variaveis?: Json | null
        }
        Update: {
          criado_em?: string
          etapa_id?: string | null
          id?: string
          texto?: string | null
          user_id?: string
          variaveis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_mensagens_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_mensagens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          criado_em: string
          email: string
          id: string
          is_admin: boolean
          nome: string | null
        }
        Insert: {
          criado_em?: string
          email: string
          id: string
          is_admin?: boolean
          nome?: string | null
        }
        Update: {
          criado_em?: string
          email?: string
          id?: string
          is_admin?: boolean
          nome?: string | null
        }
        Relationships: []
      }
      vagas: {
        Row: {
          criado_em: string
          criterios_qualificacao: Json | null
          descricao: string | null
          id: string
          titulo: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          criterios_qualificacao?: Json | null
          descricao?: string | null
          id?: string
          titulo: string
          user_id: string
        }
        Update: {
          criado_em?: string
          criterios_qualificacao?: Json | null
          descricao?: string | null
          id?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vagas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const


// ====== DATABASE EXTENDED CONTEXT (auto-generated) ======
// This section contains actual PostgreSQL column types, constraints, RLS policies,
// functions, triggers, indexes and materialized views not present in the type definitions above.
// IMPORTANT: The TypeScript types above map UUID, TEXT, VARCHAR all to "string".
// Use the COLUMN TYPES section below to know the real PostgreSQL type for each column.
// Always use the correct PostgreSQL type when writing SQL migrations.

// --- COLUMN TYPES (actual PostgreSQL types) ---
// Use this to know the real database type when writing migrations.
// "string" in TypeScript types above may be uuid, text, varchar, timestamptz, etc.
// Table: analises
//   id: uuid (not null, default: gen_random_uuid())
//   candidato_id: uuid (nullable)
//   vaga_id: uuid (nullable)
//   resultado: text (nullable)
//   detalhes: jsonb (nullable)
//   criado_em: timestamp with time zone (not null, default: now())
//   user_id: uuid (not null)
// Table: candidato_etapa
//   id: uuid (not null, default: gen_random_uuid())
//   candidato_id: uuid (nullable)
//   etapa_id: uuid (nullable)
//   data_entrada: timestamp with time zone (not null, default: now())
//   usuario_id: uuid (not null)
//   criado_em: timestamp with time zone (not null, default: now())
// Table: candidatos
//   id: uuid (not null, default: gen_random_uuid())
//   nome: text (not null)
//   email: text (nullable)
//   telefone: text (nullable)
//   curriculo_url: text (nullable)
//   fonte: text (nullable)
//   data_recebimento: timestamp with time zone (nullable, default: now())
//   duplicado_de: uuid (nullable)
//   criado_em: timestamp with time zone (not null, default: now())
//   user_id: uuid (not null)
//   vaga_id: uuid (nullable)
//   etapa_id: uuid (nullable)
//   dados_extraidos: jsonb (nullable, default: '{}'::jsonb)
// Table: etapas
//   id: uuid (not null, default: gen_random_uuid())
//   nome: text (not null)
//   ordem: integer (not null, default: 0)
//   cor: text (nullable)
//   criado_em: timestamp with time zone (not null, default: now())
//   user_id: uuid (not null)
// Table: mensagens_whatsapp
//   id: uuid (not null, default: gen_random_uuid())
//   candidato_id: uuid (nullable)
//   etapa_id: uuid (nullable)
//   template_id: uuid (nullable)
//   status: text (nullable)
//   criado_em: timestamp with time zone (not null, default: now())
//   user_id: uuid (not null)
//   numero_whatsapp: text (not null)
//   enviado_em: timestamp with time zone (nullable)
//   external_id: text (nullable)
// Table: templates_mensagens
//   id: uuid (not null, default: gen_random_uuid())
//   etapa_id: uuid (nullable)
//   texto: text (nullable)
//   variaveis: jsonb (nullable)
//   criado_em: timestamp with time zone (not null, default: now())
//   user_id: uuid (not null)
// Table: usuarios
//   id: uuid (not null)
//   email: text (not null)
//   nome: text (nullable)
//   criado_em: timestamp with time zone (not null, default: now())
//   is_admin: boolean (not null, default: false)
// Table: vagas
//   id: uuid (not null, default: gen_random_uuid())
//   titulo: text (not null)
//   descricao: text (nullable)
//   criterios_qualificacao: jsonb (nullable)
//   criado_em: timestamp with time zone (not null, default: now())
//   user_id: uuid (not null)

// --- CONSTRAINTS ---
// Table: analises
//   FOREIGN KEY analises_candidato_id_fkey: FOREIGN KEY (candidato_id) REFERENCES candidatos(id) ON DELETE CASCADE
//   PRIMARY KEY analises_pkey: PRIMARY KEY (id)
//   FOREIGN KEY analises_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
//   FOREIGN KEY analises_vaga_id_fkey: FOREIGN KEY (vaga_id) REFERENCES vagas(id) ON DELETE CASCADE
// Table: candidato_etapa
//   FOREIGN KEY candidato_etapa_candidato_id_fkey: FOREIGN KEY (candidato_id) REFERENCES candidatos(id) ON DELETE CASCADE
//   FOREIGN KEY candidato_etapa_etapa_id_fkey: FOREIGN KEY (etapa_id) REFERENCES etapas(id) ON DELETE CASCADE
//   PRIMARY KEY candidato_etapa_pkey: PRIMARY KEY (id)
//   FOREIGN KEY candidato_etapa_usuario_id_fkey: FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
// Table: candidatos
//   FOREIGN KEY candidatos_duplicado_de_fkey: FOREIGN KEY (duplicado_de) REFERENCES candidatos(id) ON DELETE SET NULL
//   FOREIGN KEY candidatos_etapa_id_fkey: FOREIGN KEY (etapa_id) REFERENCES etapas(id) ON DELETE SET NULL
//   PRIMARY KEY candidatos_pkey: PRIMARY KEY (id)
//   FOREIGN KEY candidatos_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
//   FOREIGN KEY candidatos_vaga_id_fkey: FOREIGN KEY (vaga_id) REFERENCES vagas(id) ON DELETE SET NULL
// Table: etapas
//   PRIMARY KEY etapas_pkey: PRIMARY KEY (id)
//   FOREIGN KEY etapas_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
// Table: mensagens_whatsapp
//   FOREIGN KEY mensagens_whatsapp_candidato_id_fkey: FOREIGN KEY (candidato_id) REFERENCES candidatos(id) ON DELETE CASCADE
//   FOREIGN KEY mensagens_whatsapp_etapa_id_fkey: FOREIGN KEY (etapa_id) REFERENCES etapas(id) ON DELETE CASCADE
//   CHECK mensagens_whatsapp_numero_check: CHECK ((numero_whatsapp ~ '^[0-9]{10,15}
::text))
//   PRIMARY KEY mensagens_whatsapp_pkey: PRIMARY KEY (id)
//   FOREIGN KEY mensagens_whatsapp_template_id_fkey: FOREIGN KEY (template_id) REFERENCES templates_mensagens(id) ON DELETE SET NULL
//   FOREIGN KEY mensagens_whatsapp_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
// Table: templates_mensagens
//   PRIMARY KEY templates_mensagem_pkey: PRIMARY KEY (id)
//   FOREIGN KEY templates_mensagens_etapa_id_fkey: FOREIGN KEY (etapa_id) REFERENCES etapas(id) ON DELETE CASCADE
//   FOREIGN KEY templates_mensagens_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
// Table: usuarios
//   FOREIGN KEY usuarios_id_fkey: FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
//   PRIMARY KEY usuarios_pkey: PRIMARY KEY (id)
// Table: vagas
//   PRIMARY KEY vagas_pkey: PRIMARY KEY (id)
//   FOREIGN KEY vagas_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE

// --- ROW LEVEL SECURITY POLICIES ---
// Table: analises
//   Policy "analises_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//   Policy "analises_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: (auth.uid() = user_id)
//   Policy "analises_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//   Policy "analises_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: candidato_etapa
//   Policy "candidato_etapa_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = usuario_id)
//   Policy "candidato_etapa_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: (auth.uid() = usuario_id)
//   Policy "candidato_etapa_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = usuario_id)
//   Policy "candidato_etapa_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = usuario_id)
//     WITH CHECK: (auth.uid() = usuario_id)
// Table: candidatos
//   Policy "candidatos_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//   Policy "candidatos_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: (auth.uid() = user_id)
//   Policy "candidatos_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//   Policy "candidatos_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: etapas
//   Policy "etapas_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//   Policy "etapas_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: (auth.uid() = user_id)
//   Policy "etapas_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//   Policy "etapas_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: mensagens_whatsapp
//   Policy "mensagens_whatsapp_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//   Policy "mensagens_whatsapp_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: (auth.uid() = user_id)
//   Policy "mensagens_whatsapp_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//   Policy "mensagens_whatsapp_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: templates_mensagens
//   Policy "templates_mensagens_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//   Policy "templates_mensagens_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: (auth.uid() = user_id)
//   Policy "templates_mensagens_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//   Policy "templates_mensagens_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: usuarios
//   Policy "usuarios_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = id)
//   Policy "usuarios_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = id)
//     WITH CHECK: (auth.uid() = id)
// Table: vagas
//   Policy "vagas_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//   Policy "vagas_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: (auth.uid() = user_id)
//   Policy "vagas_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//   Policy "vagas_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)

// --- DATABASE FUNCTIONS ---
// FUNCTION handle_new_user()
//   CREATE OR REPLACE FUNCTION public.handle_new_user()
//    RETURNS trigger
//    LANGUAGE plpgsql
//    SECURITY DEFINER
//   AS $function$
//   BEGIN
//     INSERT INTO public.usuarios (id, email, nome, is_admin)
//     VALUES (
//       NEW.id, 
//       NEW.email, 
//       NEW.raw_user_meta_data->>'name', 
//       COALESCE((NEW.raw_user_meta_data->>'is_admin')::boolean, false)
//     )
//     ON CONFLICT (id) DO NOTHING;
//     
//     -- Insert default stages
//     INSERT INTO public.etapas (id, nome, ordem, cor, user_id) VALUES
//       (gen_random_uuid(), 'Novos', 1, 'bg-blue-100', NEW.id),
//       (gen_random_uuid(), 'Triagem', 2, 'bg-indigo-100', NEW.id),
//       (gen_random_uuid(), 'Entrevista RH', 3, 'bg-purple-100', NEW.id),
//       (gen_random_uuid(), 'Entrevista Técnica', 4, 'bg-orange-100', NEW.id),
//       (gen_random_uuid(), 'Proposta', 5, 'bg-green-100', NEW.id),
//       (gen_random_uuid(), 'Contratado', 6, 'bg-emerald-200', NEW.id);
//   
//     RETURN NEW;
//   END;
//   $function$
//   

