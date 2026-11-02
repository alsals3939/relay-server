# Relay — Backend (NestJS)

Portfolio review copy of a NestJS API for workspace management, authentication, administrator operations, onboarding, and AI-assisted chat. **Not a production-ready distribution.**

## Tech stack
- NestJS / TypeScript
- PostgreSQL, Prisma
- JWT authentication
- OpenAI-compatible AI client (OpenAI or local MLX)

## Local setup
1. Install Node.js and PostgreSQL.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` and fill in **locally created** secrets and DB details. Never commit `.env`.
4. Run `npm run prisma:generate`, `npm run prisma:migrate`, and (if desired) `npm run prisma:seed`.
5. Run `npm run start:dev` (default port 3001).

## Safety / provenance
- All environment values in `.env.example` are placeholders or localhost addresses.
- Historical git commits are intentionally not included.
- Review all code, schemas, migrations, and dependencies for publication permissions and sensitive business logic before making this repository public.
- This copy has not been validated against a real database or deployed production environment.
- No open-source license has been granted by this packaging step.
