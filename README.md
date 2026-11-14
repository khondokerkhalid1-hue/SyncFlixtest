# SyncFlix

Watch Together. Feel Together.

A watch-party web app. Friends open a room, add a direct video link, and everyone plays the video on their own device while the host's play, pause and seek are synchronized. Rooms have chat, reactions, a member list and a queue.

## Stack

- Next.js (App Router), TypeScript, Tailwind CSS
- Supabase: Auth, PostgreSQL with Row Level Security, Realtime
- Vercel for hosting, GitHub for code

## Setup

1. Create a free Supabase project.
2. In Supabase open SQL Editor, paste the whole file `supabase/schema.sql`, and run it. It is safe to run more than once.
3. Copy `.env.example` to `.env.local` and fill in the project URL and the publishable key (Supabase: Project Settings, API Keys). The older anon key also works.
4. `npm install` then `npm run dev`.

Only the publishable (or anon) key is used. Never put a secret or service_role key in this project.

## What is not included

Photo avatars, account deletion, chat moderation, queue reordering, voice chat, friends, direct messages, video uploads. Only direct https video links (.mp4, .webm) are supported. Protected or streaming sites will not work.

## Limits to know

Free plans have quotas: Supabase free projects pause after a week without activity; Vercel Hobby is for personal, non-commercial use. Realtime sync was tested for logic and database rules, but needs a real two-device test after deployment.
