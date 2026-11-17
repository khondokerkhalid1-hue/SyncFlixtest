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

## Google Drive video links (optional)

Open "My videos" in the app. Two ways to turn a Google Drive video into a SyncFlix link:

1. Paste a link to a video shared as "Anyone with the link". The server checks it with the Google Drive API (API key).
2. Connect Google Drive (OAuth, `drive.file` permission only) and pick a video with Google Picker.

Each link has a random secret address. `/watch/<token>` is a watch page. `/api/v/<token>/stream` serves the real video bytes with HTTP Range support (this is the address to paste into a room). Deleting a link stops it at once and never touches the file in Drive.

Setup: run `supabase/migrations/part7_drive_links.sql` in Supabase, then fill in the server settings listed in `.env.example`. Secrets (service role key, Google client secret, API key, encryption key) belong only in server settings such as Vercel environment variables, never in `NEXT_PUBLIC_` variables.

Honest limits: Google Drive is not a video CDN. Google can throttle popular files ("too many views"), and every viewer's video passes through the server, so hosting plan bandwidth applies. Only MP4 and WebM files are accepted, and whether a given MP4 plays depends on the browser's codec support.

## What is not included

Photo avatars, account deletion, chat moderation, queue reordering, voice chat, friends, direct messages, video uploads. Only direct https video links (.mp4, .webm) are supported. Protected or streaming sites will not work.

## Limits to know

Free plans have quotas: Supabase free projects pause after a week without activity; Vercel Hobby is for personal, non-commercial use. Realtime sync was tested for logic and database rules, but needs a real two-device test after deployment.
