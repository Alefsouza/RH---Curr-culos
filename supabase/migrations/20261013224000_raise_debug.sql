-- Migration: 20261013224000_raise_debug.sql
-- Fixed no-op migration to unblock apply pipeline
DO $$
BEGIN
  NULL;
END $$;
