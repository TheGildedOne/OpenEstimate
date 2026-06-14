# OpenEstimate

**The free, self-hosted alternative to Sage Estimating.**

A complete, production-ready construction cost estimating platform for contractors of all sizes — from solo remodelers to mid-size general contractors. Built in the open, hosted on your terms, free forever.

<!-- screenshot: Dashboard -->

---

## Why OpenEstimate?

| | OpenEstimate | Sage Estimating |
|---|---|---|
| **Cost** | Free (MIT) | ~$10,000–$30,000/seat (3yr TCO) |
| **Hosting** | Your server, your data | Sage's cloud or on-prem install |
| **UX** | Modern web app (React 18) | Desktop app from 2005 |
| **Source code** | Open — audit, fork, contribute | Black box |
| **Estimate grid** | Virtualized, keyboard-native, spreadsheet-feel | Slow on large estimates |
| **PDF Takeoff** | Built-in, no add-on required | Requires PlanSwift add-on ($) |
| **Bid Leveling** | Built-in | Requires BidMatrix add-on ($) |
| **Client portal** | Built-in, shareable links | Not included |
| **API** | REST API included | No public API |
| **Customization** | Fork and modify freely | Vendor-locked |

Sage Estimating is a well-built product for enterprises with dedicated estimating departments and five-figure software budgets. OpenEstimate is for everyone else.

---

## Feature Overview

### ✅ Estimate Builder
- Virtualized grid — fast with 500+ line items
- Keyboard-native (Tab, Arrow, Enter, Ctrl+C/V, Ctrl+Z/Y)
- Inline editing — no popup dialogs for values
- Right-click context menu: duplicate, delete, move, convert to assembly
- Multi-row select (Shift+click, Ctrl+click)
- Assemblies with nested child items
- Section-based organization with subtotals
- Overhead / Profit / Tax / Bond with editable % and real-time $ amounts
- Version history: every save captured, restore any version, side-by-side diff
- Multiple estimates per project (base bid, alternates)
- Cost database autocomplete as you type descriptions

### ✅ Cost Database
- Browse by CSI division category tree
- 80+ seed items with realistic 2024 US pricing
- Full CRUD: add, edit, delete items
- Price history tracking with charts
- CSV import/export (RSMeans-compatible format supported)
- Usage tracking: see which estimates reference each item
- Bulk price update workflow

### ✅ PDF Takeoff
- Upload multi-page PDF blueprints
- Draw measurements directly on plans:
  - **Linear** — walls, pipes, conduit runs
  - **Area** — floor areas, ceilings, roofing
  - **Count** — doors, outlets, fixtures
  - **Volume** — concrete footings, excavation
- Scale calibration per sheet
- Push measurements directly to estimate line items
- Takeoff summary export (CSV/PDF)

### ✅ Subcontractor Bid Leveling
- Company-wide subcontractor directory
- Log bids per trade per project
- Side-by-side bid comparison table (low highlighted green, high red)
- Scope adjustments to normalize bids
- Award bid and link to estimate
- Sub analytics: win rate, avg bid amounts

### ✅ Change Orders
- CO-001, CO-002... auto-numbering per project
- Line items with additions and deductions
- Status flow: Draft → Submitted → Approved/Rejected
- Approved contract value running total
- Professional PDF export with signature line

### ✅ Export System
- **Client Proposal PDF** — professional, margin-free view
- **Internal Estimate PDF** — all columns, full margin breakdown
- **Excel Workbook** — one sheet per section, formatted
- **CSV Export** — raw data for accounting import
- **QuickBooks CSV** — maps to QBO chart of accounts

### ✅ Client Portal
- Shareable links (7-day, 30-day, or never-expire)
- Clean branded view of estimate (no unit costs, no margins shown)
- Client can approve or reject online (records timestamp + IP)
- Comment field for client feedback
- Notifications to estimator on client action

### ✅ Templates
- Save any estimate as a reusable template
- 8 built-in templates with realistic line items:
  - Residential Remodel | Commercial TI | New Residential
  - Roofing | Concrete Flatwork | Electrical Rough-In
  - Interior Painting | HVAC Install
- Apply to estimate: merge, replace, or append
- Public (company-wide) or private templates

### ✅ Reporting
- Win rate over time (monthly/quarterly/yearly)
- Bid performance by trade and by client
- Win/Loss charts with competitor tracking
- Labor vs material split analysis
- Estimator productivity metrics

### ✅ Notifications
- In-app notification center with unread count
- Email notifications (SMTP): bid due reminders, CO status, client approvals
- Per-user notification preferences

### ✅ User Management
- Roles: Admin | Estimator | Viewer
- Invite users by email
- Session management (view and revoke active sessions)

### ✅ Everything Else
- Full dark mode
- Responsive (works on iPad landscape)
- Keyboard shortcut reference (press `?`)
- First-time setup wizard
- Docker deployment in one command
- S3-compatible storage (local by default)

---

## Quick Start

### Docker (Recommended)

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/openestimate.git
cd openestimate

# 2. Configure environment
cp .env.example .env
# Edit .env:
#   - Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to random strings
#   - Set CLIENT_URL to your domain

# 3. Start (builds and runs everything)
docker compose up -d

# 4. Seed the database
docker compose exec app node packages/server/dist/db/seed.js

# 5. Open the app
open http://localhost:3001
```

**Default credentials:**
- Email: `admin@openestimate.local`
- Password: `changeme123`
- ⚠️ Change your password immediately after first login.

---

### Manual Setup (Development)

**Prerequisites:** Node.js 20+, pnpm 9+

```bash
git clone https://github.com/yourusername/openestimate.git
cd openestimate

# Install dependencies (all packages)
pnpm install

# Set up environment
cp .env.example .env
# Edit .env as needed (defaults work for local dev)

# Build shared types
pnpm --filter shared build

# Set up database
pnpm db:migrate
pnpm db:seed

# Start development servers (hot reload)
pnpm dev
```

The app runs at:
- Frontend: http://localhost:5173
- API: http://localhost:3001

---

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` and edit:

| Variable | Required | Description |
|---|---|---|
| `JWT_ACCESS_SECRET` | **Yes** | Random secret ≥32 chars for access tokens |
| `JWT_REFRESH_SECRET` | **Yes** | Different random secret for refresh tokens |
| `DATABASE_URL` | No | `file:./data/openestimate.db` (SQLite) or PostgreSQL URL |
| `CLIENT_URL` | No | Your frontend URL for CORS (default: http://localhost:5173) |
| `PORT` | No | Server port (default: 3001) |
| `STORAGE_DRIVER` | No | `local` or `s3` (default: local) |
| `STORAGE_LOCAL_PATH` | No | Where to store uploaded files (default: ./data/uploads) |
| `MAX_FILE_SIZE` | No | Max upload size in bytes (default: 52428800 = 50MB) |
| `SMTP_HOST` | No | SMTP server for email notifications |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM` | No | From address for emails |
| `S3_ENDPOINT` | If S3 | S3 endpoint URL |
| `S3_BUCKET` | If S3 | Bucket name |
| `S3_ACCESS_KEY` | If S3 | Access key |
| `S3_SECRET_KEY` | If S3 | Secret key |

### Using PostgreSQL

Change `DATABASE_URL` to a PostgreSQL connection string:
```
DATABASE_URL=postgresql://user:password@localhost:5432/openestimate
```

Drizzle handles both SQLite and PostgreSQL — no code changes required.

### S3 Storage

Works with AWS S3, Backblaze B2, MinIO, and any S3-compatible provider:
```env
STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_BUCKET=my-openestimate-files
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

---

## Tech Stack

### Frontend
- **React 18** + **Vite** — fast builds, instant HMR
- **Tailwind CSS** — utility-first styling, full dark mode
- **Zustand** — lightweight global state
- **React Router v6** — client-side routing
- **TanStack Table** — virtualized, keyboard-navigable estimate grid
- **TanStack Query** — server state management with caching
- **Recharts** — charts and reporting visuals
- **pdfjs-dist** + **fabric.js** — PDF rendering + canvas takeoff overlay
- **@dnd-kit** — drag-and-drop for kanban, row reordering
- **Framer Motion** — UI animations
- **React Hook Form** + **Zod** — forms and validation
- **lucide-react** — icons

### Backend
- **Node.js** + **Fastify** — fast, TypeScript-first HTTP server
- **Drizzle ORM** + **SQLite** (better-sqlite3) — local DB, zero config
- **JWT** — access tokens (15min) + refresh tokens (30d, httpOnly cookie)
- **pdf-lib** — PDF generation for proposals, COs
- **ExcelJS** — Excel export
- **nodemailer** — email notifications
- **node-cron** — scheduled bid due reminders

### Infrastructure
- **Docker** + **Docker Compose** — one-command deployment
- **pnpm workspaces** — monorepo (shared, server, client packages)
- **Vitest** — unit tests
- **Playwright** — E2E tests on estimate builder
- **GitHub Actions** — CI: lint, test, build on every PR

---

## Project Structure

```
openestimate/
├── .github/workflows/        # CI + Docker release
├── packages/
│   ├── shared/               # TypeScript types + Zod schemas
│   │   └── src/
│   │       ├── types/        # All entity interfaces
│   │       └── schemas/      # Validation schemas (shared client+server)
│   ├── server/
│   │   └── src/
│   │       ├── db/           # Schema, migrations, seed
│   │       ├── routes/       # One file per feature
│   │       ├── services/     # Export (PDF/Excel), notifications, storage
│   │       ├── middleware/   # JWT auth, RBAC
│   │       └── lib/          # Pure calculation functions
│   └── client/
│       └── src/
│           ├── pages/        # Route-level components
│           ├── components/   # Reusable UI components
│           ├── store/        # Zustand stores (auth, UI, estimate)
│           ├── hooks/        # Custom React hooks
│           └── lib/          # API client, calculation helpers
└── docker-compose.yml
```

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss.

### Development Setup

```bash
# Fork + clone
git clone https://github.com/YOUR_USERNAME/openestimate.git
cd openestimate

pnpm install
cp .env.example .env

pnpm --filter shared build
pnpm db:migrate
pnpm db:seed
pnpm dev
```

### Running Tests

```bash
# Unit tests (server)
pnpm --filter server test

# E2E tests (requires dev server running)
pnpm --filter client test:e2e

# All tests
pnpm test
```

### Code Style

- TypeScript strict mode throughout — no `any` without a comment
- Prettier + ESLint — run `pnpm lint` before committing
- Zod schemas for all API input validation
- HTTP status codes used correctly
- Error responses always `{ error: string, code: string }`
- No raw SQL string interpolation — use Drizzle's parameterized queries

### PR Process

1. Branch from `main`
2. Make your changes with tests
3. `pnpm lint && pnpm test` must pass
4. Submit PR with a clear description of what and why

---

## Roadmap

These are genuinely not yet built (honest):

- [ ] **Mobile app** — React Native companion for field use
- [ ] **BIM/IFC file import** — parse IFC files for quantity takeoff
- [ ] **Procore integration** — sync projects and documents
- [ ] **Autodesk Construction Cloud integration**
- [ ] **Actual cost tracking** — log actual vs estimated after project completion
- [ ] **Multi-currency** — per-project currency override
- [ ] **Approval workflows** — multi-stage internal estimate approval
- [ ] **Custom report builder** — drag-and-drop report designer
- [ ] **QuickBooks direct sync** — OAuth integration instead of CSV export
- [ ] **AI description autocomplete** — use LLM to suggest line items

---

## License

MIT — see [LICENSE](LICENSE)

Use it commercially, fork it, modify it, sell services around it. No restrictions.

---

## Credits

Built by the open-source community. Inspired by Sage Estimating, PlanSwift, ProEst, and every estimating spreadsheet that crashed at 200 rows.

If this saves your company $10,000 in software licenses, consider [sponsoring the project](https://github.com/sponsors/yourusername) or contributing back.
