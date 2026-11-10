-- Migration: Inspecionar todas as respostas recentes de net._http_response
DO $$
DECLARE
  v_rec RECORD;
  v_items JSONB := '[]'::jsonb;
BEGIN
  FOR v_rec IN (
    SELECT id, status_code, error_msg, substring(content from 1 for 300) as content_preview, created
    FROM net._http_response
    ORDER BY id DESC
    LIMIT 10
  ) LOOP
    v_items := v_items || jsonb_build_object(
      'id', v_rec.id,
      'status', v_rec.status_code,
      'error', v_rec.error_msg,
      'content', v_rec.content_preview,
      'created', v_rec.created
    );
  END LOOP;

  INSERT INTO public._debug_audit (tag, info, created_at)
  VALUES ('net_responses_inspect', v_items, NOW());
END $$;
