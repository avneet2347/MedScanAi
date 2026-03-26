# AI2Health

Authenticated medical report processing workspace built with Next.js, Supabase, OCR, and OpenAI.

## What is implemented

- Supabase Auth signup and login endpoints
- Session-aware client workspace
- Secure JPG, PNG, and PDF upload to Supabase Storage
- OCR pipeline using Tesseract for images with OpenAI OCR fallback, plus OpenAI document OCR for PDFs
- Structured OpenAI analysis that extracts medicines, conditions, test values, plain-language explanations, and follow-up prompts
- Rule-based health insights and abnormal-value risk highlighting
- Report-grounded chatbot API with persistent chat history
- Supabase Postgres persistence for profiles, report metadata, OCR text, AI analysis, insights, and chat messages
- REST endpoints for auth, upload, OCR, explanation, insights, chat, and report history

## Required setup

1. Copy `.env.example` to `.env.local` and fill in your values.
2. Run the SQL in [supabase/schema.sql](/c:/Users/avnee/ai2health/supabase/schema.sql) in the Supabase SQL editor.
3. Ensure your Supabase project has email/password auth enabled.
4. In Supabase Auth settings, keep `Confirm email` enabled so password logins stay blocked until the user verifies their address.
5. Add your app URL and the confirmation redirect URL to Supabase Auth redirect URLs. For local development this should include `http://localhost:3000` and `http://localhost:3000/workspace?mode=login&confirmed=1`.
6. Install dependencies if needed with `npm install`.
7. Start the app with `npm run dev`.

## Environment variables

- `OPENAI_API_KEY`
- `OPENAI_ANALYSIS_MODEL`
- `OPENAI_CHAT_MODEL`
- `OPENAI_OCR_MODEL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `MAX_UPLOAD_BYTES`

## API endpoints

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/reports/upload`
- `POST /api/reports/[id]/ocr`
- `POST /api/reports/[id]/explanation`
- `GET /api/reports/[id]/insights`
- `GET /api/reports/[id]`
- `GET /api/reports/history`
- `POST /api/chat`

## Verification performed locally

- `npx tsc --pretty false --noEmit`
- `npm run lint`

Production build verification can be run with `npm run build`.
