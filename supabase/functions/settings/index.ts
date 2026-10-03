import { createSettingsHandler } from './handler.mjs';
Deno.serve(createSettingsHandler({
  url: Deno.env.get('SUPABASE_URL')!,
  key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
}));
