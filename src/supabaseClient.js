import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Supabase env variables are missing!");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
console.log("Supabase URL (Vercel):", import.meta.env.VITE_SUPABASE_URL);
console.log("Supabase Key defined?", !!import.meta.env.VITE_SUPABASE_ANON_KEY);
