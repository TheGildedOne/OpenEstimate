# Contributing to OpenEstimate

Thank you for helping make construction estimating software free for everyone.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/openestimate.git`
3. **Install** dependencies: `pnpm install`
4. **Setup** environment: `cp .env.example .env` (defaults work for local dev)
5. **Build** shared types: `pnpm --filter shared build`
6. **Migrate** database: `pnpm db:migrate && pnpm db:seed`
7. **Start** dev servers: `pnpm dev`

## Project Architecture

```
packages/shared   → TypeScript types + Zod schemas used by both client and server
packages/server   → Fastify API server + Drizzle ORM + SQLite
packages/client   → React 18 + Vite + Tailwind CSS frontend
```

The `shared` package must be built (`pnpm --filter shared build`) before the server or client
can compile, because both import from `@openestimate/shared`.

## Development Guidelines

### TypeScript

- **Strict mode** is enabled. No `any` types without an explanatory comment.
- Use the shared Zod schemas for all validation — don't duplicate them.
- Server types come from `drizzle-orm` inferences (`typeof schema.table.$inferSelect`).
- Client types come from `@openestimate/shared`.

### API Routes

Every route file follows the same pattern:

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth';

const myRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/something', { preHandler: [authenticate] }, async (request, reply) => {
    // ...
    return reply.send({ data: result });
  });
};

export default myRoutes;
```

Error responses are always:
```typescript
return reply.status(400).send({ error: 'Human readable message', code: 'SNAKE_CASE_CODE' });
```

### Database

- All queries use Drizzle ORM — never raw SQL string interpolation.
- Schema changes require a migration: `pnpm db:generate` then commit the migration file.
- Seed data is in `packages/server/src/db/seed.ts` — idempotent, safe to re-run.

### Frontend

- **No inline styles** — use Tailwind utility classes only.
- **Dark mode** — every component needs `dark:` variants.
- **Empty states** — every list/table needs an `<EmptyState>` component.
- **Loading states** — every async data fetch needs a `<Skeleton>` or spinner.
- **Error states** — catch errors, show toast via `useUIStore().showError()`.
- Components in `src/components/ui/` are primitives — keep them generic.
- Page components in `src/pages/` are feature-specific.

### The Estimate Grid

The estimate grid (`EstimateGrid.tsx`) is the most performance-sensitive component.
Before submitting changes to it:

1. Test with 200+ line items — performance must not degrade.
2. Tab/arrow key navigation must still work correctly.
3. Undo/redo must capture the change.
4. Run the E2E tests: `pnpm --filter client test:e2e`.

## Testing

```bash
# Server unit tests
pnpm --filter server test

# Server unit tests (watch mode)
pnpm --filter server test:watch

# E2E tests (requires dev server running)
pnpm --filter client test:e2e
```

Unit tests live in `packages/server/tests/`. The calculation logic in
`estimateCalculator.ts` must be 100% unit tested.

E2E tests live in `packages/client/tests/e2e/`. They use Playwright and
require the app to be running with seeded data.

## Pull Request Process

1. **One feature per PR** — don't bundle unrelated changes.
2. **Write a clear PR description** — what changed and why.
3. **Tests required** — new features need tests. Bug fixes ideally reproduce the bug first.
4. **`pnpm lint && pnpm test` must pass** — the CI will enforce this.
5. **Keep PRs small** — large diffs are hard to review and easy to get wrong.

## Issues

- **Bug reports** — include steps to reproduce, expected vs actual behavior, and your env.
- **Feature requests** — describe the use case before the implementation.
- **Security issues** — email security@openestimate.dev instead of opening a public issue.

## Code of Conduct

Be helpful, be constructive, be kind. We're building tools for people who build things.
