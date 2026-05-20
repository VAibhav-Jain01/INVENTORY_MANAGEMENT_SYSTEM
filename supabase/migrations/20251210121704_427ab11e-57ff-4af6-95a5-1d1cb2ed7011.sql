-- Fix function search path warnings
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.decrement_stock(UUID, INTEGER) SET search_path = public;