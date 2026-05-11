import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!supabaseUrl || !serviceRole) {
  console.warn("Supabase env vars are not configured yet.");
}

export const db = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false }
});
