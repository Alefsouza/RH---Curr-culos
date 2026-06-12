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
          ativo_kanban: boolean | null
          criado_em: string
          curriculo_url: string | null
          dados_extraidos: Json | null
          data_recebimento: string | null
          duplicado_de: string | null
          email: string | null
          etapa_id: string | null
          fonte: string | null
          id: string
          motivo_inativo: string | null
          nome: string
          telefone: string | null
          telefone_normalizado: string | null
          ultima_resposta_em: string | null
          ultima_resposta_whatsapp: string | null
          user_id: string
          vaga_id: string | null
        }
        Insert: {
          ativo_kanban?: boolean | null
          criado_em?: string
          curriculo_url?: string | null
          dados_extraidos?: Json | null
          data_recebimento?: string | null
          duplicado_de?: string | null
          email?: string | null
          etapa_id?: string | null
          fonte?: string | null
          id?: string
          motivo_inativo?: string | null
          nome: string
          telefone?: string | null
          telefone_normalizado?: string | null
          ultima_resposta_em?: string | null
          ultima_resposta_whatsapp?: string | null
          user_id: string
          vaga_id?: string | null
        }
        Update: {
          ativo_kanban?: boolean | null
          criado_em?: string
          curriculo_url?: string | null
          dados_extraidos?: Json | null
          data_recebimento?: string | null
          duplicado_de?: string | null
          email?: string | null
          etapa_id?: string | null
          fonte?: string | null
          id?: string
          motivo_inativo?: string | null
          nome?: string
          telefone?: string | null
          telefone_normalizado?: string | null
          ultima_resposta_em?: string | null
          ultima_resposta_whatsapp?: string | null
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
      conversas_whatsapp: {
        Row: {
          candidato_id: string | null
          criado_em: string
          direcao: string | null
          id: string
          texto: string | null
          uazapi_message_id: string | null
        }
        Insert: {
          candidato_id?: string | null
          criado_em?: string
          direcao?: string | null
          id?: string
          texto?: string | null
          uazapi_message_id?: string | null
        }
        Update: {
          candidato_id?: string | null
          criado_em?: string
          direcao?: string | null
          id?: string
          texto?: string | null
          uazapi_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_whatsapp_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
        ]
      }
      email_importacoes: {
        Row: {
          anexo_filename: string | null
          anexo_storage_path: string | null
          assunto: string | null
          candidato_id: string | null
          confianca_identificacao: string | null
          erro_detalhes: string | null
          gmail_message_id: string
          gmail_thread_id: string | null
          id: string
          justificativa_ia: string | null
          processado_em: string | null
          recebido_em: string | null
          remetente: string | null
          status: string | null
          user_id: string
          vaga_id_identificada: string | null
        }
        Insert: {
          anexo_filename?: string | null
          anexo_storage_path?: string | null
          assunto?: string | null
          candidato_id?: string | null
          confianca_identificacao?: string | null
          erro_detalhes?: string | null
          gmail_message_id: string
          gmail_thread_id?: string | null
          id?: string
          justificativa_ia?: string | null
          processado_em?: string | null
          recebido_em?: string | null
          remetente?: string | null
          status?: string | null
          user_id: string
          vaga_id_identificada?: string | null
        }
        Update: {
          anexo_filename?: string | null
          anexo_storage_path?: string | null
          assunto?: string | null
          candidato_id?: string | null
          confianca_identificacao?: string | null
          erro_detalhes?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string | null
          id?: string
          justificativa_ia?: string | null
          processado_em?: string | null
          recebido_em?: string | null
          remetente?: string | null
          status?: string | null
          user_id?: string
          vaga_id_identificada?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_importacoes_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_importacoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_importacoes_vaga_id_identificada_fkey"
            columns: ["vaga_id_identificada"]
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
          conteudo: string | null
          criado_em: string
          direcao: string | null
          enviado_em: string | null
          etapa_id: string | null
          external_id: string | null
          id: string
          numero_whatsapp: string
          status: string | null
          template_id: string | null
          tipo: string | null
          uazapi_message_id: string | null
          user_id: string
        }
        Insert: {
          candidato_id?: string | null
          conteudo?: string | null
          criado_em?: string
          direcao?: string | null
          enviado_em?: string | null
          etapa_id?: string | null
          external_id?: string | null
          id?: string
          numero_whatsapp: string
          status?: string | null
          template_id?: string | null
          tipo?: string | null
          uazapi_message_id?: string | null
          user_id: string
        }
        Update: {
          candidato_id?: string | null
          conteudo?: string | null
          criado_em?: string
          direcao?: string | null
          enviado_em?: string | null
          etapa_id?: string | null
          external_id?: string | null
          id?: string
          numero_whatsapp?: string
          status?: string | null
          template_id?: string | null
          tipo?: string | null
          uazapi_message_id?: string | null
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
      respostas_whatsapp: {
        Row: {
          candidato_id: string | null
          criado_em: string
          id: string
          mensagem_id: string | null
          resposta: string | null
        }
        Insert: {
          candidato_id?: string | null
          criado_em?: string
          id?: string
          mensagem_id?: string | null
          resposta?: string | null
        }
        Update: {
          candidato_id?: string | null
          criado_em?: string
          id?: string
          mensagem_id?: string | null
          resposta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "respostas_whatsapp_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
        ]
      }
      templates_mensagens: {
        Row: {
          botao_nao_acao: string | null
          botao_nao_texto: string | null
          botao_sim_acao: string | null
          botao_sim_texto: string | null
          criado_em: string
          etapa_destino_id: string | null
          etapa_id: string | null
          footer_text: string | null
          id: string
          pergunta_texto: string | null
          texto: string | null
          tipo: string | null
          titulo_texto: string | null
          user_id: string
          variaveis: Json | null
        }
        Insert: {
          botao_nao_acao?: string | null
          botao_nao_texto?: string | null
          botao_sim_acao?: string | null
          botao_sim_texto?: string | null
          criado_em?: string
          etapa_destino_id?: string | null
          etapa_id?: string | null
          footer_text?: string | null
          id?: string
          pergunta_texto?: string | null
          texto?: string | null
          tipo?: string | null
          titulo_texto?: string | null
          user_id: string
          variaveis?: Json | null
        }
        Update: {
          botao_nao_acao?: string | null
          botao_nao_texto?: string | null
          botao_sim_acao?: string | null
          botao_sim_texto?: string | null
          criado_em?: string
          etapa_destino_id?: string | null
          etapa_id?: string | null
          footer_text?: string | null
          id?: string
          pergunta_texto?: string | null
          texto?: string | null
          tipo?: string | null
          titulo_texto?: string | null
          user_id?: string
          variaveis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_mensagens_etapa_destino_id_fkey"
            columns: ["etapa_destino_id"]
            isOneToOne: false
            referencedRelation: "etapas"
            referencedColumns: ["id"]
          },
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
          avatar_url: string | null
          criado_em: string
          email: string
          id: string
          is_admin: boolean
          nome: string | null
        }
        Insert: {
          avatar_url?: string | null
          criado_em?: string
          email: string
          id: string
          is_admin?: boolean
          nome?: string | null
        }
        Update: {
          avatar_url?: string | null
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
      whatsapp_eventos_nao_identificados: {
        Row: {
          conteudo: string | null
          id: string
          payload_completo: Json | null
          recebido_em: string | null
          reprocessado: boolean | null
          telefone_recebido: string | null
        }
        Insert: {
          conteudo?: string | null
          id?: string
          payload_completo?: Json | null
          recebido_em?: string | null
          reprocessado?: boolean | null
          telefone_recebido?: string | null
        }
        Update: {
          conteudo?: string | null
          id?: string
          payload_completo?: Json | null
          recebido_em?: string | null
          reprocessado?: boolean | null
          telefone_recebido?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      buscar_candidato_por_telefone: {
        Args: { telefone_input: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
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
//   ativo_kanban: boolean (nullable, default: true)
//   motivo_inativo: text (nullable)
//   ultima_resposta_whatsapp: text (nullable)
//   ultima_resposta_em: timestamp with time zone (nullable)
//   telefone_normalizado: text (nullable)
// Table: conversas_whatsapp
//   id: uuid (not null, default: gen_random_uuid())
//   candidato_id: uuid (nullable)
//   texto: text (nullable)
//   direcao: text (nullable)
//   criado_em: timestamp with time zone (not null, default: now())
//   uazapi_message_id: text (nullable)
// Table: email_importacoes
//   id: uuid (not null, default: gen_random_uuid())
//   gmail_message_id: text (not null)
//   gmail_thread_id: text (nullable)
//   remetente: text (nullable)
//   assunto: text (nullable)
//   recebido_em: timestamp with time zone (nullable)
//   processado_em: timestamp with time zone (nullable, default: now())
//   status: text (nullable)
//   erro_detalhes: text (nullable)
//   candidato_id: uuid (nullable)
//   vaga_id_identificada: uuid (nullable)
//   confianca_identificacao: text (nullable)
//   justificativa_ia: text (nullable)
//   anexo_filename: text (nullable)
//   anexo_storage_path: text (nullable)
//   user_id: uuid (not null)
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
//   direcao: text (nullable)
//   conteudo: text (nullable)
//   uazapi_message_id: text (nullable)
//   tipo: text (nullable)
// Table: respostas_whatsapp
//   id: uuid (not null, default: gen_random_uuid())
//   candidato_id: uuid (nullable)
//   mensagem_id: text (nullable)
//   resposta: text (nullable)
//   criado_em: timestamp with time zone (not null, default: now())
// Table: templates_mensagens
//   id: uuid (not null, default: gen_random_uuid())
//   etapa_id: uuid (nullable)
//   texto: text (nullable)
//   variaveis: jsonb (nullable)
//   criado_em: timestamp with time zone (not null, default: now())
//   user_id: uuid (not null)
//   tipo: text (nullable, default: 'texto_simples'::text)
//   pergunta_texto: text (nullable)
//   botao_sim_texto: text (nullable)
//   botao_sim_acao: text (nullable)
//   botao_nao_texto: text (nullable)
//   botao_nao_acao: text (nullable)
//   etapa_destino_id: uuid (nullable)
//   footer_text: text (nullable)
//   titulo_texto: text (nullable)
// Table: usuarios
//   id: uuid (not null)
//   email: text (not null)
//   nome: text (nullable)
//   criado_em: timestamp with time zone (not null, default: now())
//   is_admin: boolean (not null, default: false)
//   avatar_url: text (nullable)
// Table: vagas
//   id: uuid (not null, default: gen_random_uuid())
//   titulo: text (not null)
//   descricao: text (nullable)
//   criterios_qualificacao: jsonb (nullable)
//   criado_em: timestamp with time zone (not null, default: now())
//   user_id: uuid (not null)
// Table: whatsapp_eventos_nao_identificados
//   id: uuid (not null, default: gen_random_uuid())
//   telefone_recebido: text (nullable)
//   payload_completo: jsonb (nullable)
//   conteudo: text (nullable)
//   recebido_em: timestamp with time zone (nullable, default: now())
//   reprocessado: boolean (nullable, default: false)

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
// Table: conversas_whatsapp
//   FOREIGN KEY conversas_whatsapp_candidato_id_fkey: FOREIGN KEY (candidato_id) REFERENCES candidatos(id) ON DELETE CASCADE
//   CHECK conversas_whatsapp_direcao_check: CHECK ((direcao = ANY (ARRAY['enviada'::text, 'recebida'::text])))
//   PRIMARY KEY conversas_whatsapp_pkey: PRIMARY KEY (id)
//   UNIQUE conversas_whatsapp_uazapi_message_id_key: UNIQUE (uazapi_message_id)
// Table: email_importacoes
//   FOREIGN KEY email_importacoes_candidato_id_fkey: FOREIGN KEY (candidato_id) REFERENCES candidatos(id) ON DELETE SET NULL
//   UNIQUE email_importacoes_gmail_message_id_key: UNIQUE (gmail_message_id)
//   PRIMARY KEY email_importacoes_pkey: PRIMARY KEY (id)
//   CHECK email_importacoes_status_check: CHECK ((status = ANY (ARRAY['processando'::text, 'sucesso'::text, 'erro'::text, 'sem_anexo_valido'::text, 'sem_vaga_compativel'::text, 'nao_qualificado'::text])))
//   FOREIGN KEY email_importacoes_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
//   FOREIGN KEY email_importacoes_vaga_id_identificada_fkey: FOREIGN KEY (vaga_id_identificada) REFERENCES vagas(id) ON DELETE SET NULL
// Table: etapas
//   PRIMARY KEY etapas_pkey: PRIMARY KEY (id)
//   FOREIGN KEY etapas_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
// Table: mensagens_whatsapp
//   FOREIGN KEY mensagens_whatsapp_candidato_id_fkey: FOREIGN KEY (candidato_id) REFERENCES candidatos(id) ON DELETE CASCADE
//   CHECK mensagens_whatsapp_direcao_check: CHECK ((direcao = ANY (ARRAY['enviada'::text, 'recebida'::text])))
//   FOREIGN KEY mensagens_whatsapp_etapa_id_fkey: FOREIGN KEY (etapa_id) REFERENCES etapas(id) ON DELETE CASCADE
//   CHECK mensagens_whatsapp_numero_check: CHECK ((numero_whatsapp ~ '^[0-9]{10,15}
::text))
//   PRIMARY KEY mensagens_whatsapp_pkey: PRIMARY KEY (id)
//   FOREIGN KEY mensagens_whatsapp_template_id_fkey: FOREIGN KEY (template_id) REFERENCES templates_mensagens(id) ON DELETE SET NULL
//   UNIQUE mensagens_whatsapp_uazapi_message_id_key: UNIQUE (uazapi_message_id)
//   FOREIGN KEY mensagens_whatsapp_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
// Table: respostas_whatsapp
//   FOREIGN KEY respostas_whatsapp_candidato_id_fkey: FOREIGN KEY (candidato_id) REFERENCES candidatos(id) ON DELETE CASCADE
//   PRIMARY KEY respostas_whatsapp_pkey: PRIMARY KEY (id)
//   CHECK respostas_whatsapp_resposta_check: CHECK ((resposta = ANY (ARRAY['sim'::text, 'nao'::text])))
// Table: templates_mensagens
//   PRIMARY KEY templates_mensagem_pkey: PRIMARY KEY (id)
//   FOREIGN KEY templates_mensagens_etapa_destino_id_fkey: FOREIGN KEY (etapa_destino_id) REFERENCES etapas(id) ON DELETE SET NULL
//   FOREIGN KEY templates_mensagens_etapa_id_fkey: FOREIGN KEY (etapa_id) REFERENCES etapas(id) ON DELETE CASCADE
//   FOREIGN KEY templates_mensagens_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
// Table: usuarios
//   FOREIGN KEY usuarios_id_fkey: FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
//   PRIMARY KEY usuarios_pkey: PRIMARY KEY (id)
// Table: vagas
//   PRIMARY KEY vagas_pkey: PRIMARY KEY (id)
//   FOREIGN KEY vagas_user_id_fkey: FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
// Table: whatsapp_eventos_nao_identificados
//   PRIMARY KEY whatsapp_eventos_nao_identificados_pkey: PRIMARY KEY (id)

// --- ROW LEVEL SECURITY POLICIES ---
// Table: analises
//   Policy "analises_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "analises_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: ((auth.uid() = user_id) OR is_admin())
//   Policy "analises_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "analises_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//     WITH CHECK: ((auth.uid() = user_id) OR is_admin())
// Table: candidato_etapa
//   Policy "candidato_etapa_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = usuario_id) OR is_admin())
//   Policy "candidato_etapa_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: ((auth.uid() = usuario_id) OR is_admin())
//   Policy "candidato_etapa_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = usuario_id) OR is_admin())
//   Policy "candidato_etapa_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = usuario_id) OR is_admin())
//     WITH CHECK: ((auth.uid() = usuario_id) OR is_admin())
// Table: candidatos
//   Policy "candidatos_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "candidatos_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: ((auth.uid() = user_id) OR is_admin())
//   Policy "candidatos_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "candidatos_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//     WITH CHECK: ((auth.uid() = user_id) OR is_admin())
// Table: conversas_whatsapp
//   Policy "conversas_whatsapp_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: true
//   Policy "conversas_whatsapp_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: true
//   Policy "conversas_whatsapp_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: true
//   Policy "conversas_whatsapp_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: email_importacoes
//   Policy "email_importacoes_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: true
// Table: etapas
//   Policy "etapas_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "etapas_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: ((auth.uid() = user_id) OR is_admin())
//   Policy "etapas_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "etapas_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//     WITH CHECK: ((auth.uid() = user_id) OR is_admin())
// Table: mensagens_whatsapp
//   Policy "mensagens_whatsapp_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "mensagens_whatsapp_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: ((auth.uid() = user_id) OR is_admin())
//   Policy "mensagens_whatsapp_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "mensagens_whatsapp_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//     WITH CHECK: ((auth.uid() = user_id) OR is_admin())
// Table: respostas_whatsapp
//   Policy "respostas_whatsapp_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: ((candidato_id IN ( SELECT candidatos.id    FROM candidatos   WHERE (candidatos.user_id = auth.uid()))) OR is_admin())
//   Policy "respostas_whatsapp_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: ((candidato_id IN ( SELECT candidatos.id    FROM candidatos   WHERE (candidatos.user_id = auth.uid()))) OR is_admin())
//   Policy "respostas_whatsapp_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: ((candidato_id IN ( SELECT candidatos.id    FROM candidatos   WHERE (candidatos.user_id = auth.uid()))) OR is_admin())
//   Policy "respostas_whatsapp_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: ((candidato_id IN ( SELECT candidatos.id    FROM candidatos   WHERE (candidatos.user_id = auth.uid()))) OR is_admin())
//     WITH CHECK: ((candidato_id IN ( SELECT candidatos.id    FROM candidatos   WHERE (candidatos.user_id = auth.uid()))) OR is_admin())
// Table: templates_mensagens
//   Policy "templates_mensagens_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "templates_mensagens_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: ((auth.uid() = user_id) OR is_admin())
//   Policy "templates_mensagens_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "templates_mensagens_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//     WITH CHECK: ((auth.uid() = user_id) OR is_admin())
// Table: usuarios
//   Policy "usuarios_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = id)
//   Policy "usuarios_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = id)
//     WITH CHECK: (auth.uid() = id)
// Table: vagas
//   Policy "vagas_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "vagas_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: ((auth.uid() = user_id) OR is_admin())
//   Policy "vagas_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "vagas_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//     WITH CHECK: ((auth.uid() = user_id) OR is_admin())
// Table: whatsapp_eventos_nao_identificados
//   Policy "whatsapp_eventos_nao_identificados_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: true

// --- DATABASE FUNCTIONS ---
// FUNCTION buscar_candidato_por_telefone(text)
//   CREATE OR REPLACE FUNCTION public.buscar_candidato_por_telefone(telefone_input text)
//    RETURNS uuid
//    LANGUAGE plpgsql
//    SECURITY DEFINER
//   AS $function$
//   DECLARE
//     v_cleaned text;
//     v_result uuid;
//     v_len int;
//   BEGIN
//     IF telefone_input IS NULL THEN
//       RETURN NULL;
//     END IF;
//   
//     -- 1. Strip non-digits
//     v_cleaned := regexp_replace(telefone_input, '\D', '', 'g');
//   
//     -- 2. Remove '55' country code prefix if length > 11
//     IF v_cleaned LIKE '55%' AND length(v_cleaned) > 11 THEN
//       v_cleaned := substring(v_cleaned from 3);
//     END IF;
//   
//     v_len := length(v_cleaned);
//   
//     IF v_len = 0 THEN
//       RETURN NULL;
//     END IF;
//   
//     -- Layer 1: Exact match against telefone_normalizado
//     SELECT id INTO v_result FROM public.candidatos WHERE telefone_normalizado = v_cleaned LIMIT 1;
//     IF v_result IS NOT NULL THEN
//       RETURN v_result;
//     END IF;
//   
//     -- Layer 2: Last 11 digits
//     IF v_len >= 11 THEN
//       SELECT id INTO v_result FROM public.candidatos 
//       WHERE telefone_normalizado IS NOT NULL 
//         AND right(telefone_normalizado, 11) = right(v_cleaned, 11) 
//       LIMIT 1;
//       IF v_result IS NOT NULL THEN
//         RETURN v_result;
//       END IF;
//     END IF;
//   
//     -- Layer 3: Last 10 digits
//     IF v_len >= 10 THEN
//       SELECT id INTO v_result FROM public.candidatos 
//       WHERE telefone_normalizado IS NOT NULL 
//         AND right(telefone_normalizado, 10) = right(v_cleaned, 10) 
//       LIMIT 1;
//       IF v_result IS NOT NULL THEN
//         RETURN v_result;
//       END IF;
//     END IF;
//   
//     -- Layer 4: Last 9 digits (handles Brazil mobile 9-digit format variances)
//     IF v_len >= 9 THEN
//       SELECT id INTO v_result FROM public.candidatos 
//       WHERE telefone_normalizado IS NOT NULL 
//         AND right(telefone_normalizado, 9) = right(v_cleaned, 9) 
//       LIMIT 1;
//       IF v_result IS NOT NULL THEN
//         RETURN v_result;
//       END IF;
//     END IF;
//   
//     -- Layer 5: Last 8 digits (fallback for landlines or significant mismatches)
//     IF v_len >= 8 THEN
//       SELECT id INTO v_result FROM public.candidatos 
//       WHERE telefone_normalizado IS NOT NULL 
//         AND right(telefone_normalizado, 8) = right(v_cleaned, 8) 
//       LIMIT 1;
//       IF v_result IS NOT NULL THEN
//         RETURN v_result;
//       END IF;
//     END IF;
//   
//     RETURN NULL;
//   END;
//   $function$
//   
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
// FUNCTION is_admin()
//   CREATE OR REPLACE FUNCTION public.is_admin()
//    RETURNS boolean
//    LANGUAGE sql
//    SECURITY DEFINER
//   AS $function$
//     SELECT COALESCE(is_admin, false) FROM public.usuarios WHERE id = auth.uid();
//   $function$
//   
// FUNCTION trigger_normalizar_telefone()
//   CREATE OR REPLACE FUNCTION public.trigger_normalizar_telefone()
//    RETURNS trigger
//    LANGUAGE plpgsql
//    SECURITY DEFINER
//   AS $function$
//   DECLARE
//     v_cleaned text;
//   BEGIN
//     IF NEW.telefone IS NOT NULL THEN
//       v_cleaned := regexp_replace(NEW.telefone, '\D', '', 'g');
//       IF v_cleaned LIKE '55%' AND length(v_cleaned) > 11 THEN
//         v_cleaned := substring(v_cleaned from 3);
//       END IF;
//       NEW.telefone_normalizado := v_cleaned;
//     ELSE
//       NEW.telefone_normalizado := NULL;
//     END IF;
//     RETURN NEW;
//   END;
//   $function$
//   

// --- TRIGGERS ---
// Table: candidatos
//   normalizar_telefone_candidatos: CREATE TRIGGER normalizar_telefone_candidatos BEFORE INSERT OR UPDATE OF telefone ON public.candidatos FOR EACH ROW EXECUTE FUNCTION trigger_normalizar_telefone()

// --- INDEXES ---
// Table: candidatos
//   CREATE INDEX idx_candidatos_telefone_normalizado ON public.candidatos USING btree (telefone_normalizado)
// Table: conversas_whatsapp
//   CREATE UNIQUE INDEX conversas_whatsapp_uazapi_message_id_key ON public.conversas_whatsapp USING btree (uazapi_message_id)
// Table: email_importacoes
//   CREATE UNIQUE INDEX email_importacoes_gmail_message_id_key ON public.email_importacoes USING btree (gmail_message_id)
// Table: mensagens_whatsapp
//   CREATE INDEX idx_mensagens_whatsapp_candidato_id ON public.mensagens_whatsapp USING btree (candidato_id)
//   CREATE INDEX idx_mensagens_whatsapp_numero_whatsapp ON public.mensagens_whatsapp USING btree (numero_whatsapp)
//   CREATE UNIQUE INDEX mensagens_whatsapp_uazapi_message_id_key ON public.mensagens_whatsapp USING btree (uazapi_message_id)
// Table: respostas_whatsapp
//   CREATE INDEX idx_respostas_whatsapp_candidato_id ON public.respostas_whatsapp USING btree (candidato_id)

