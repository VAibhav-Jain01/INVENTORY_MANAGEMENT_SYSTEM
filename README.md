# Secure Stock Manager

## Description

Secure Stock Manager is a lightweight and secure inventory/stock management frontend built with Vite, React, TypeScript, and Tailwind CSS. It is ready for integration with Supabase for authentication and data storage.

## Features

* User authentication using Supabase
* Product listing and basic stock operations
* Responsive dashboard layout and modern UI

## Tech Stack

* Vite
* React + TypeScript
* Tailwind CSS
* Supabase (client located in `src/integrations/supabase`)

## Prerequisites

* Node.js 16+ (or Bun)
* Git

## Setup

1. Clone the repository:

```bash
git clone <YOUR_GIT_URL>
cd secure-stock-manager
```

2. Install dependencies (choose one):

```bash
npm install
# or
bun install
# or
pnpm install
```

3. Create a `.env` file and add your Supabase credentials.
   Use the `VITE_` prefix for Vite client environment variables:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Start the development server:

```bash
npm run dev
# or
bun run dev
```

## Build & Preview

```bash
npm run build
npm run preview
```

## Project Structure (High Level)

* `src/` — Main source files, including `src/main.tsx` and `src/App.tsx`
* `src/components` — UI components and layouts
* `supabase/` — Configuration and migrations (`supabase/config.toml`)

## Notes

* Environment variables for Vite must start with `VITE_`.
* This project includes a `bun.lockb` file, so it can also be run using Bun.

---

If you want, I can also help you run the development server (`npm run dev`) and debug any errors.
