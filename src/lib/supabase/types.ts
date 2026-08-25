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
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          justificativa_ia: string | null
          outlook_message_id: string | null
          outlook_thread_id: string | null
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
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          justificativa_ia?: string | null
          outlook_message_id?: string | null
          outlook_thread_id?: string | null
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
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          justificativa_ia?: string | null
          outlook_message_id?: string | null
          outlook_thread_id?: string | null
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
      sync_runs: {
        Row: {
          cvs_imported: number | null
          cvs_skipped_duplicate: number | null
          cvs_skipped_internal: number | null
          cvs_skipped_no_match: number | null
          emails_scanned: number | null
          errors: Json | null
          finished_at: string | null
          id: string
          last_synced_at: string | null
          started_at: string
          status: string
        }
        Insert: {
          cvs_imported?: number | null
          cvs_skipped_duplicate?: number | null
          cvs_skipped_internal?: number | null
          cvs_skipped_no_match?: number | null
          emails_scanned?: number | null
          errors?: Json | null
          finished_at?: string | null
          id?: string
          last_synced_at?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          cvs_imported?: number | null
          cvs_skipped_duplicate?: number | null
          cvs_skipped_internal?: number | null
          cvs_skipped_no_match?: number | null
          emails_scanned?: number | null
          errors?: Json | null
          finished_at?: string | null
          id?: string
          last_synced_at?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
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

