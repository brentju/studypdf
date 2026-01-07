# StudyPDF - Project Documentation

## Overview

StudyPDF is a web application that helps students learn from PDF textbooks by automatically extracting exercises, generating AI solutions, and providing feedback on their answers.

**Target Users**: High school and college students with PDF textbooks
**Design Philosophy**: Minimalist, technological, futuristic (Bilt-inspired dark theme)

## Tech Stack

### Frontend
- **Framework**: Next.js 14+ with App Router
- **UI Library**: shadcn/ui with custom dark theme
- **Styling**: Tailwind CSS v4
- **State Management**: React Query (TanStack Query) for server state
- **Math Rendering**: KaTeX for LaTeX display
- **Code Editor**: Monaco Editor for coding exercises

### Backend
- **API**: Next.js API Routes
- **Database**: Supabase (PostgreSQL with pgvector)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage for PDFs
- **Background Jobs**: Inngest

### AI/ML
- **LLM**: Claude API (Anthropic) for:
  - Exercise extraction
  - Solution generation
  - Answer evaluation
- **Embeddings**: OpenAI text-embedding-3-small for RAG
- **PDF Processing**: Python service with Marker/PyMuPDF

## Project Structure

```
studypdf/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Auth routes (login, signup)
│   │   ├── (dashboard)/       # Protected dashboard routes
│   │   ├── api/               # API routes
│   │   └── layout.tsx         # Root layout
│   ├── components/
│   │   ├── ui/                # shadcn components
│   │   ├── exercise/          # Exercise type renderers
│   │   └── shared/            # Shared components
│   ├── lib/
│   │   ├── supabase/          # Supabase client & queries
│   │   ├── claude/            # Claude API wrapper & prompts
│   │   ├── inngest/           # Background job functions
│   │   └── rag/               # RAG utilities (chunking, embeddings)
│   ├── hooks/                 # Custom React hooks
│   └── types/                 # TypeScript type definitions
├── python/                    # PDF processing service
│   ├── main.py               # FastAPI server
│   ├── extractor.py          # PDF extraction logic
│   └── requirements.txt
└── supabase/
    └── migrations/           # Database migrations
```

## Core Features

### 1. PDF Upload & Processing
- Chunked upload for large files (>50MB)
- Background processing pipeline via Inngest
- Chapter/section extraction using Marker
- Progress tracking with real-time updates

### 2. Exercise Extraction
- LLM-based extraction from textbook content
- Supported exercise types:
  - `multiple_choice` - Radio buttons with options
  - `single_select` - Choose one from list
  - `short_answer` - Single-line text input
  - `long_answer` - Multi-line textarea
  - `mathematical` - LaTeX support with KaTeX
  - `coding` - Monaco code editor

### 3. Solution Generation
- RAG-enhanced solutions with textbook context
- Step-by-step explanations
- Multiple solution approaches when applicable

### 4. Answer Evaluation
- Auto-generated rubrics per exercise
- Criteria-based scoring
- Specific feedback with improvement suggestions

### 5. RAG System
- Chunk size: 400-512 tokens with 15% overlap
- Semantic search via pgvector
- Links exercises to relevant textbook sections

## Database Schema

### Core Tables
- `textbooks` - Uploaded PDF metadata
- `chapters` - Extracted chapter structure
- `sections` - Chapter subsections
- `exercises` - Extracted exercises with type info
- `solutions` - AI-generated solutions
- `content_chunks` - Chunked content with embeddings
- `student_submissions` - User answers
- `evaluations` - LLM evaluation results
- `evaluation_rubrics` - Auto-generated rubrics

### Key Relationships
- `textbooks.user_id` → Supabase Auth user
- `exercises.chapter_id` → Parent chapter
- `student_submissions.exercise_id` → Exercise being answered
- `student_submissions.user_id` → Student who submitted

## API Patterns

### REST Conventions
- `GET /api/textbooks` - List user's textbooks
- `POST /api/textbooks` - Upload new textbook
- `GET /api/textbooks/[id]` - Get textbook details
- `GET /api/exercises/[id]` - Get exercise with solution
- `POST /api/exercises/[id]/submit` - Submit answer
- `GET /api/exercises/[id]/evaluate` - Get evaluation

### Background Jobs (Inngest)
- `textbook/uploaded` → Start processing pipeline
- `textbook/extracted` → Parse structure
- `textbook/structured` → Generate embeddings
- `textbook/embedded` → Extract exercises
- `exercises/extracted` → Generate solutions

## Design System

### Color Palette (Bilt-inspired)
```css
--background: #010a13        /* Near-black */
--background-secondary: #030f1c
--foreground: #fbfbfb        /* Off-white */
--primary: #97c6ea           /* Soft blue */
--accent-blue: #97c6ea
--accent-yellow: #edd496
--accent-pink: #ffdadc
--accent-peach: #fbdfc9
```

### Typography
- **Headings**: Inter/Geist Sans
- **Body**: Inter/Geist Sans
- **Code/Math**: JetBrains Mono/Geist Mono

### Spacing
- Use 8px grid system
- Consistent gaps: 8px, 12px, 16px, 24px, 32px

## Development Guidelines

### Code Style
- Use TypeScript strict mode
- Prefer functional components with hooks
- Use Zod for runtime validation
- Use server components by default, client only when needed

### File Naming
- Components: PascalCase (`ExerciseCard.tsx`)
- Utilities: camelCase (`formatDate.ts`)
- Types: PascalCase (`Exercise.ts`)
- API routes: kebab-case (`/api/submit-answer`)

### State Management
- Server state: React Query
- Form state: React Hook Form + Zod
- UI state: useState/useReducer
- Global state: Zustand (if needed)

### Error Handling
- Use error boundaries for UI errors
- Return proper HTTP status codes from API
- Log errors with context for debugging
- Show user-friendly error messages

### Testing
- Unit tests for utilities with Vitest
- Component tests with Testing Library
- E2E tests with Playwright for critical flows

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Claude API
ANTHROPIC_API_KEY=

# Inngest (only needed for production - not required for local dev)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Python Service
PYTHON_SERVICE_URL=http://localhost:8000

# OpenAI (embeddings)
OPENAI_API_KEY=
```

## Development Tips & Gotchas

### Inngest Local Development
- **No API keys needed locally** - The Inngest dev server handles everything without `INNGEST_EVENT_KEY` or `INNGEST_SIGNING_KEY`
- Run with: `npx inngest-cli@latest dev`
- Dashboard available at: `http://localhost:8288`
- The dev server auto-discovers your app at `/api/inngest`
- Check the **Runs** tab to debug function execution and see errors

### Background Job Status Updates
Server components only render once - they won't reflect background job progress. Use client components with polling for real-time status:

```tsx
// Pattern: Poll while processing, refresh on completion
useEffect(() => {
  if (status === "completed") return;

  const interval = setInterval(async () => {
    const { data } = await supabase.from("textbooks").select("processing_status")...
    if (data.processing_status !== status) {
      setStatus(data.processing_status);
      if (data.processing_status === "completed") {
        clearInterval(interval);
        router.refresh(); // Refresh server component data
      }
    }
  }, 2000);

  return () => clearInterval(interval);
}, [status]);
```

### Supabase TypeScript Quirks
The generated types can be overly strict. Use type assertions for queries:

```tsx
// For selects with .single()
const { data } = await supabase
  .from("textbooks")
  .select("*")
  .eq("id", id)
  .single() as { data: Textbook | null; error: Error | null };

// For inserts (workaround for strict types)
await supabase.from("chapters").insert(chapterData as never);
```

### Python PDF Service
- Marker library may fail with `KeyError: 'encoder'` on some PDFs - the service falls back to PyMuPDF automatically
- Run locally: `cd python && uvicorn main:app --reload`
- Test extraction: `curl -X POST http://localhost:8000/extract -H "Content-Type: application/json" -d '{"pdf_url": "..."}'`

### Running the Full Stack Locally
1. Terminal 1: `npm run dev` (Next.js on port 3000)
2. Terminal 2: `npx inngest-cli@latest dev` (Inngest on port 8288)
3. Terminal 3: `cd python && uvicorn main:app --reload` (Python on port 8000)
4. Supabase: Use cloud project or `supabase start` for local

## Deployment

### Production Stack
- **Frontend**: Vercel
- **Database**: Supabase (managed)
- **Python Service**: Modal (serverless)
- **Monitoring**: Sentry

### CI/CD
- Lint and type check on PR
- Run tests before merge
- Auto-deploy to preview on PR
- Deploy to production on main merge
