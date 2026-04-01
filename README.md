# MedScanAI

MedScanAI is a medical report intelligence workspace built with Next.js, Supabase, OCR, and OpenAI. It helps users upload JPG, PNG, and PDF medical documents, extract report text, generate structured AI insights, and continue with grounded follow-up chat inside a secure authenticated workspace.

This repository is currently maintained under the `ai2health` package name, but the product experience and documentation are centered around the MedScanAI brand.

## Features

- Secure email/password authentication with Supabase Auth and email confirmation
- Private user workspace for uploads, report history, and saved conversations
- OCR pipeline for images and PDFs using Tesseract-based OCR and OpenAI-powered document understanding
- Structured medical analysis that extracts medicines, test values, possible conditions, precautions, and follow-up questions
- AI-generated health insights, abnormal finding detection, and report summaries
- Report-grounded assistant chat with persistent history, humanized replies, voice tools, and prompt suggestions
- Health trends, report comparison, and medicine reminder workflows inside the same workspace
- Supabase-backed persistence for profiles, reports, OCR output, insights, reminders, and chat messages

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript
- Styling: CSS Modules and app-level global styles
- Backend: Next.js App Router route handlers
- Auth, Database, Storage: Supabase Auth, Postgres, and Storage
- AI: OpenAI API, optional Gemini integration for selected analysis flows
- OCR and document processing: Tesseract.js, node-tesseract-ocr, pdfjs-dist, pdf2pic
- Visualization: Recharts

## Screenshots

Add product screenshots here before publishing the repository portfolio page.

| Screen | Placeholder asset | Notes |
| --- | --- | --- |
| Landing page | `docs/screenshots/landing-page.png` | Product overview and call to action |
| Auth screen | `docs/screenshots/auth-screen.png` | Signup and login flow |
| Workspace dashboard | `docs/screenshots/workspace-dashboard.png` | Report history and summary cards |
| AI assistant | `docs/screenshots/assistant-chat.png` | Grounded report chat experience |
| Trends / comparison | `docs/screenshots/trends-and-compare.png` | Analytics and comparison tools |

## Project Structure

```text
app/
  api/                  # Auth, chat, reports, reminders, analytics, and comparison endpoints
  login/                # Login route
  signup/               # Signup route
  workspace/            # Authenticated workspace page
  page.tsx              # Marketing / landing page
components/
  workspace/            # Sidebar shell and workspace-specific UI
  ReportWorkbench.tsx   # Main authenticated application container
  AuthPageClient.tsx    # Client-side auth flow
  WorkspaceAuthScreen.tsx
lib/
  openai-service.ts     # OpenAI chat, OCR, and humanization helpers
  ocr-service.ts        # OCR orchestration
  report-pipeline.ts    # Report processing pipeline
  reports.ts            # Supabase report persistence helpers
  reminders.ts          # Reminder persistence and logic
  supabase-server.ts    # Server-side Supabase clients and auth helpers
supabase/
  schema.sql            # Database schema, storage bucket setup, and policies
public/                 # Static assets
```

## Prerequisites

- Node.js 20 or newer
- npm
- A Supabase project
- An OpenAI API key
- Optional: a Gemini API key
- Recommended: a Supabase service role key for bucket auto-creation and duplicate-signup safeguards

## Installation

1. Clone the repository.

   ```bash
   git clone <your-repo-url>
   cd ai2health
   ```

2. Install dependencies.

   ```bash
   npm install
   ```

3. Copy the environment template.

   ```bash
   cp .env.example .env.local
   ```

   On Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

4. Fill in `.env.local` with your project credentials.

5. Configure Supabase using the instructions below.

6. Start the development server.

   ```bash
   npm run dev
   ```

7. Open `http://localhost:3000`.

## Environment Variables

Create a `.env.local` file based on `.env.example`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Authenticates OpenAI requests |
| `OPENAI_ANALYSIS_MODEL` | No | Overrides the default analysis model |
| `OPENAI_CHAT_MODEL` | No | Overrides the default chat / humanize model |
| `OPENAI_OCR_MODEL` | No | Overrides the default OCR model |
| `GEMINI_API_KEY` | No | Enables optional Gemini-backed analysis features |
| `GEMINI_ANALYSIS_MODEL` | No | Overrides the default Gemini model |
| `NEXT_PUBLIC_APP_URL` | Yes | Base URL used for auth redirects and client-side links |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | Enables server-side admin actions such as storage bucket auto-creation and duplicate-signup checks |
| `SUPABASE_STORAGE_BUCKET` | No | Storage bucket name for uploaded reports. Defaults to `medical-reports` |
| `MAX_UPLOAD_BYTES` | No | Upload size limit in bytes. Defaults to `10485760` |

## Supabase Configuration

1. Create a Supabase project.
2. In Supabase Auth:
   Enable Email provider for email/password login.
3. Keep `Confirm email` enabled.
   MedScanAI expects new users to verify their address before sign-in access is granted.
4. Configure your Auth URLs:
   Add your site URL, such as `http://localhost:3000` for local development.
5. Add your redirect URL:
   Include `http://localhost:3000/login?confirmed=1` locally, plus the matching production login confirmation URL for deployed environments.
6. Open the Supabase SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql).
   This creates the required tables, storage bucket configuration, and policies used by the app.
7. Set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` if you want the server to auto-create the storage bucket when needed and to guard repeated signup attempts more reliably.

## Usage

1. Start the app with `npm run dev`.
2. Create an account and confirm the verification email.
3. Sign in to the workspace.
4. Upload a medical report in JPG, PNG, or PDF format.
5. Let the app complete OCR, structured analysis, and insight generation.
6. Review extracted medicines, findings, precautions, trends, and comparison data.
7. Use the AI Assistant to ask grounded follow-up questions about the selected report.

## Available Scripts

- `npm run dev` - Start the local development server
- `npm run lint` - Run ESLint
- `npm run build` - Create a production build
- `npm run start` - Start the production server after building

## Contributor Guidelines

Contributions are welcome. To keep collaboration smooth:

- Fork the repository and create a focused feature branch
- Keep pull requests scoped to one change set when possible
- Do not commit secrets, `.env.local`, service keys, or production credentials
- Run `npm run lint` before opening a pull request
- Run `npx tsc --pretty false --noEmit` when you touch TypeScript-heavy areas
- Update documentation when behavior, setup, or environment requirements change
- Include screenshots or short notes in PR descriptions for UI-facing changes

## Verification

Useful local verification commands:

```bash
npx tsc --pretty false --noEmit
npm run lint
npm run build
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
