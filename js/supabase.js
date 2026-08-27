// js/supabase.js
// ─────────────────────────────────────────────────────────────
//  Supabase client — শুধু ANON (public) key এখানে রাখুন
//  secret key কখনো এখানে দেবেন না
// ─────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://btwzkhqiyausycbndlvq.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0d3praHFpeWF1c3ljYm5kbHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDAxMTUsImV4cCI6MjEwMDM3NjExNX0.DOwuZ64AH0PG9ZGoOlceD4_V2jpMrvHqVkfsiBbboDs'; // Dashboard → Settings → API → anon public

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Storage bucket names ──────────────────────────────────────
// Notes er PDF file gula ei bucket e thakbe (Supabase Storage)
export const NOTES_BUCKET = 'note share';

// Profile picture gula ei bucket e thakbe (Supabase Storage)
// Note: ei bucket ta Supabase dashboard e alada kore create korte hobe — dekho SETUP.md / chat instructions
export const AVATARS_BUCKET = 'avatars';