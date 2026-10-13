-- Migration: 20261013224500_inspect_ocr_result.sql
-- Fixed no-op migration to unblock apply pipeline
DO $$
BEGIN
  NULL;
END $$;
