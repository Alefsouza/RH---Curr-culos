// Supabase Edge Function para vincular os 3 arquivos enviados pelo RH aos candidatos:
// Catiana Pereira Santos, Rian Gouveia Martins Serrano e Carlos Daniel.
// Baixa os arquivos públicos do storage message-attachments e copia para o bucket curriculos (ou referencia direto),
// atualizando o campo curriculo_url de cada candidato no banco de dados.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const filesToSync = [
      {
        identificador: 'rian',
        nomeLike: '%rian%serrano%',
        sourceUrl:
          'https://dagtlwojkqyivnjgveda.supabase.co/storage/v1/object/public/message-attachments/fffaeb96-cba1-48b3-9976-6b4f86be1dcc/novo-10798.pdf',
        destFilename: 'novo-10798.pdf',
        contentType: 'application/pdf',
      },
      {
        identificador: 'carlos',
        nomeLike: '%carlos daniel%',
        sourceUrl:
          'https://dagtlwojkqyivnjgveda.supabase.co/storage/v1/object/public/message-attachments/fffaeb96-cba1-48b3-9976-6b4f86be1dcc/6af1c1035708b-0b8df.pdf',
        destFilename: '6af1c1035708b-0b8df.pdf',
        contentType: 'application/pdf',
      },
      {
        identificador: 'catiana',
        nomeLike: '%catiana%',
        sourceUrl:
          'https://dagtlwojkqyivnjgveda.supabase.co/storage/v1/object/public/message-attachments/fffaeb96-cba1-48b3-9976-6b4f86be1dcc/image-70cb0.png',
        destFilename: 'image-70cb0.png',
        contentType: 'image/png',
      },
    ]

    const resultados: any[] = []

    for (const item of filesToSync) {
      // 1. Localizar candidato
      const { data: cand, error: candErr } = await supabase
        .from('candidatos')
        .select('id, nome, curriculo_url')
        .ilike('nome', item.nomeLike)
        .is('deleted_at', null)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (candErr || !cand) {
        resultados.push({
          identificador: item.identificador,
          status: 'candidato_nao_encontrado',
          error: candErr?.message,
        })
        continue
      }

      // 2. Baixar arquivo da URL pública
      let finalUrl = item.sourceUrl
      try {
        const resp = await fetch(item.sourceUrl)
        if (resp.ok) {
          const blob = await resp.blob()
          const storagePath = `rh_enviados/${cand.id}/${item.destFilename}`

          const { error: upErr } = await supabase.storage
            .from('curriculos')
            .upload(storagePath, blob, {
              contentType: item.contentType,
              upsert: true,
            })

          if (!upErr) {
            const { data: pubData } = supabase.storage.from('curriculos').getPublicUrl(storagePath)
            if (pubData?.publicUrl) {
              finalUrl = pubData.publicUrl
            }
          } else {
            console.warn(
              `[link-rh-cvs] Falha upload bucket curriculos: ${upErr.message}, mantendo sourceUrl`,
            )
          }
        }
      } catch (dlErr: any) {
        console.warn(`[link-rh-cvs] Erro ao baixar ${item.sourceUrl}: ${dlErr?.message}`)
      }

      // 3. Atualizar curriculo_url no cadastro do candidato
      const { error: upCandErr } = await supabase
        .from('candidatos')
        .update({ curriculo_url: finalUrl })
        .eq('id', cand.id)

      resultados.push({
        candidato_id: cand.id,
        nome: cand.nome,
        curriculo_url: finalUrl,
        sucesso: !upCandErr,
        error: upCandErr?.message,
      })
    }

    return new Response(JSON.stringify({ ok: true, resultados }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
