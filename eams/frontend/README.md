# EAMS Frontend

Frontend application for the Examiner Allocation & Management System (EAMS).

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables (create `.env.local` file):
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8002
```

3. Run the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3002`

## Features

- **Account Creation**: Public registration for examiners
- **Login/Authentication**: Secure login with JWT tokens
- **Application Management**:
  - Create new examiner applications
  - View and edit draft applications
  - Submit applications for review
  - View application status and details

## Development

The frontend is built with:
- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui components
- react-hook-form + zod for form validation

## Docker

The frontend is included in the main `compose.yaml` file. To run with Docker:

```bash
docker compose up eams-frontend
```

Or run all services:

```bash
docker compose up
```

## Project Structure

```
frontend/
├── app/                    # Next.js app router pages
│   ├── (auth)/            # Authentication pages (login, register)
│   ├── dashboard/         # Dashboard pages
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── auth/             # Authentication components
│   ├── dashboard/        # Dashboard layout components
│   ├── applications/     # Application form components
│   └── ui/               # shadcn/ui components
├── lib/                   # Utility functions
│   ├── api.ts            # API client
│   ├── auth.ts           # Auth utilities
│   └── utils.ts          # General utilities
└── types/                 # TypeScript type definitions
```
