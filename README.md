This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Database & auth setup

This project uses [Drizzle ORM](https://orm.drizzle.team/) against Postgres, and [Better Auth](https://www.better-auth.com/) for authentication (email & password).

1. Copy the env file and generate a secret:

   ```bash
   cp .env.example .env.local
   openssl rand -base64 32   # paste the result into BETTER_AUTH_SECRET
   ```

2. Start a local Postgres:

   ```bash
   docker compose up -d
   ```

3. Apply the database schema:

   ```bash
   npm run db:migrate
   ```

If you change the auth config (e.g. add a plugin or provider), regenerate the schema and a new migration:

```bash
npm run auth:generate   # regenerates src/lib/db/schema/auth.ts from src/lib/auth.ts
npm run db:generate     # creates a new SQL migration from the schema diff
npm run db:migrate      # applies pending migrations
```

`npm run db:studio` opens [Drizzle Studio](https://orm.drizzle.team/drizzle-studio/overview) against the local database.

### Production (Vercel + Supabase)

The Vercel project has a Supabase Postgres database linked, which sets `POSTGRES_URL` (pooled, via Supavisor) and `POSTGRES_URL_NON_POOLING` (direct) automatically. `src/lib/db/index.ts` and `drizzle.config.ts` prefer these over `DATABASE_URL` when present, so no extra config is needed in Vercel.

Migrations run automatically on production deploys via `vercel-build` (`db:migrate` runs only when `VERCEL_ENV=production`, then `next build`), using the direct connection since migrations shouldn't go through the transaction pooler.

> **Note:** `POSTGRES_URL`/`POSTGRES_URL_NON_POOLING` are currently scoped to both the Production and Preview environments in Vercel, i.e. there's no separate preview database yet — PR preview deployments read and write the same data as production.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
