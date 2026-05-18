# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Feature 21 (Invite Member Logic) complete: share-link-only invite flow with accept invitation page
- Credential encryption hardened: all CredentialField data (key + value) now encrypted at rest, `secret` column removed
- Credential creation bug fixed

## Current Goal

- Define and implement the next feature scope

## Completed

- **[BUGFIX]** Fixed credential creation failing with `P2011 Null constraint violation`:
  - Root cause: The earlier migration renamed `key` → `key_deprecated` and `secret` → `secret_deprecated` instead of dropping them. These columns remained NOT NULL in the database, so any INSERT without values for them failed.
  - Fix: Created migration `20260518072459_drop_deprecated_credential_columns` to drop `key_deprecated` and `secret_deprecated` columns
  - Also refactored `createCredential` and `updateCredentialById` to use explicit `$transaction` with individual `create()` calls instead of nested creates / `createMany` (more reliable with PrismaPg adapter)
  - Added `.default("")` to `value` field in validation schema for safety
  - `npm run build` passes

- **[ARCHITECTURE]** Removed direct client fetch calls from members UI component:
  - Added `listMembersByDivisionAction` and `listMyDivisionsAction` in `app/actions/members.ts` for server-side data loading access
  - Refactored `components/members/MembersView.tsx` to use server actions instead of `fetch('/api/...')`
  - Preserved stale active division recovery flow after leave/kick by switching to first available division via server action response

- **[UX]** Added confirmation modal for member removal and self leave actions:
  - Updated `components/members/MembersView.tsx` to open a `DangerDialog` before executing destructive actions
  - `Remove member` and `Leave division` now require explicit confirmation before calling `removeMemberAction`
  - Added contextual modal copy/title/loading labels for self-leave vs kicking another member

- **[BUGFIX]** Members page now respects role-based visibility and self-leave UX:
  - Updated `components/members/MembersView.tsx` to derive current user membership and gate admin UI (`Invite member` card + `Active invite links`) to `DIVISION_OWNER`/`DIVISION_ADMIN` only
  - Non-admin members no longer see `Change role` and member removal controls for other users
  - Added self action label `Keluar` for current user row; admin removal label updated to `Keluarkan`
  - Updated member copy to avoid implying role controls for non-admin users
  - Updated remove flow toast to distinguish self leave vs admin removal and redirect self leave to `/dashboard`
  - Updated `lib/services/member.service.ts` to allow self-leave for non-owner members while preserving admin-only removal rules for removing other users

- **[POLISH]** Members actions copy switched to English:
  - Updated `components/members/MembersView.tsx` action labels to `Remove member` and `Leave division`
  - Updated self/admin removal success toasts to `You left the division` and `Member removed`

- **[BUGFIX]** Improved sender invite UX wording and audit invite readability:
  - Updated `components/members/MembersView.tsx` to remove synthetic placeholder email submission (`email: ""`) and switch sender-facing copy from pending-centric to link-centric (`Active invite links`, `Awaiting claim`, `active` count)
  - Updated revoke invite toast to show a human-readable label (`Invite link`) for share-link invitations
  - Updated `lib/services/member.service.ts` to write `MEMBER_INVITE` audit `resourceName` as a readable label (`Invite link`) for share-link flow instead of placeholder addresses
  - Added `formatAuditResourceName()` in `lib/audit-meta.ts` and applied it in `components/dashboard/RecentActivity.tsx` + `components/audit/AuditLogRow.tsx` so historical placeholder values like `invite-...@placeholder.local` render as `Invite link`

- **[Feature 21]** Invite Member Logic — share-link-only flow:
  - Removed `resend` dependency from `package.json` and all email-sending logic from `lib/services/member.service.ts`
  - Deleted `lib/emails/invite.ts` (email template no longer needed)
  - Simplified `inviteMember` service: no longer looks up Clerk users or adds directly — always creates an invitation record and returns a share link
  - Made `email` field optional in `lib/validations/member.ts` `inviteMemberSchema` (share-link flow doesn't require email)
  - Rewrote `app/accept-invite/page.tsx`:
    - Shows invitation info (division name, role) with "Pending accepted" status before user accepts
    - Unauthenticated users see sign-up/sign-in buttons with redirect back to accept page
    - Authenticated users without divisions get redirected to onboarding with `redirect_url` back to accept page
    - Authenticated users with divisions see an "Accept & join division" button
  - Created `components/invite/AcceptInviteButton.tsx` — client component with accept action and loading state
  - Added `acceptInvitationAction` server action in `app/actions/members.ts`
  - Updated `proxy.ts` — added `/accept-invite(.*)` to public routes so unauthenticated users can view invitation info
  - Updated `app/onboarding/page.tsx`:
    - Reads `redirect_url` from search params via `useSearchParams()`
    - After onboarding completes, redirects to `redirect_url` (accept-invite page) instead of `/`
    - Wrapped in `Suspense` boundary for `useSearchParams()` compatibility
  - Updated `components/members/MembersView.tsx`:
    - Replaced email-based invite form with "Generate invite link" button (share-link-only)
    - Pending invites now show "Pending accepted" badge and the invite URL with copy button
    - Removed `GlassInput`, `EnvelopeSimple`, `Plus`, `Warning` imports (no longer needed)
  - `npm run build` passes with no type errors

- **[Security]** Encrypt all CredentialField data at rest:
  - Updated `prisma/schema.prisma`: renamed `key` → `encryptedKey`, removed `secret Boolean` column from `CredentialField`
  - Created migration `20260512024053_encrypt_all_credential_fields`: adds `encryptedKey`, copies existing `key` values, drops `key` and `secret` columns
  - Created `scripts/encrypt-existing-keys.ts`: one-time script that encrypted 24 existing plaintext key values using AES-256-GCM
  - Updated `lib/services/credential.service.ts`:
    - `createCredential`: encrypts both key and value via `encryptToString()`
    - `updateCredentialById`: encrypts both key and value on field replacement
    - `revealCredentialFields`: decrypts both `encryptedKey` and `encryptedValue`
    - `listCredentialsForUser` / `resolveCredential`: no longer select `key` or `secret` (only `id` + `credentialId`)
  - Updated `lib/services/project-page.service.ts`:
    - `getCredentialEditData`: decrypts both key and value for edit form pre-fill
    - Project page query no longer selects `key` or `secret`
  - Updated `lib/validations/credential.ts`: removed `secret` from `credentialFieldSchema`
  - Updated `types/credential.ts`: removed `secret` from `CredentialField`, `CredentialFieldWithValue` now has `key` + `value` + optional `decryptionFailed`
  - Updated `app/actions/credentials.ts`: removed `secret` from field array types
  - Updated `components/credentials/CredentialForm.tsx`: removed `secret` toggle, all fields treated as encrypted
  - `npm run build` passes with no type errors

- **[BUGFIX]** Fixed actor name display in activity log and audit log showing raw Clerk user ID instead of name/email:
  - `lib/services/dashboard.service.ts`: fallback chain for `actorName` and member `name` now uses `name || email || "Unknown User"` instead of raw `clerkId`
  - `app/api/audit/route.ts`: last-resort fallback changed from `actorId` to `"Unknown User"` in `resolveActor`
  - `lib/services/audit.service.ts`: Clerk name resolution now falls back to `primaryEmailAddress` before `"Unknown User"`

- **[BUGFIX]** Fixed responsive issues in invite modal dialog:
  - Modal now properly constrains to 100% width with 1rem margin on mobile (`w-[calc(100%-2rem)] max-w-sm`)
  - Updated header layout to flex column on mobile, flex row on sm+ (`flex-col sm:flex-row`)
  - Fixed URL text wrapping from `truncate` to `break-all` for proper line breaking on all screen sizes
  - Changed URL container from horizontal to flex column on mobile with full-width copy button (`flex-col sm:flex-row`)
  - Updated footer to stack vertically on mobile with proper button sizing (`flex-col sm:flex-row` with `order-1/2` for visual order)
  - Added responsive padding and text sizes (text-xs on mobile, text-sm on sm+)
  - Content no longer overflows from card on any screen size

- Completed Feature 19 Phase 2 (Server Actions + service-enforced server pages):
  - Added shared action result utilities in `app/actions/types.ts`
  - Added domain action modules:
    - `app/actions/projects.ts`
    - `app/actions/divisions.ts`
    - `app/actions/credentials.ts`
    - `app/actions/members.ts`
  - Migrated mutation UIs from direct HTTP mutation calls to server actions for projects, divisions, credentials, and members
  - Added page-data service modules:
    - `lib/services/dashboard.service.ts`
    - `lib/services/audit.service.ts`
    - `lib/services/project-page.service.ts`
  - Removed direct Prisma access from server pages and routed through services:
    - `app/(app)/layout.tsx`
    - `app/(app)/auditlog/page.tsx`
    - `app/(app)/dashboard/page.tsx`
    - `app/accept-invite/page.tsx`
    - `app/(app)/projects/[slug]/page.tsx`
    - `app/(app)/projects/[slug]/credentials/new/page.tsx`
    - `app/(app)/projects/[slug]/credentials/[credentialSlug]/edit/page.tsx`
  - Fixed `components/layout/DivisionSwitcher.tsx` import ordering to maintain valid module syntax
  - Verified with `npm run build` (pass)

- Completed Feature 19 Phase 1 (Clean Code implementation):
  - Created `lib/errors.ts` with typed domain errors (`DomainError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `GoneError`, `UnprocessableEntityError`, `InternalError`) and shared `toFieldErrors` mapper
  - Created service layer folder `lib/services/` and extracted business logic from route handlers into:
    - `lib/services/project.service.ts`
    - `lib/services/division.service.ts`
    - `lib/services/credential.service.ts`
    - `lib/services/member.service.ts`
  - Refactored API routes to become thin HTTP handlers (auth check, request parsing, schema validation, service delegation, response mapping):
    - `app/api/projects/route.ts`
    - `app/api/projects/[id]/route.ts`
    - `app/api/divisions/route.ts`
    - `app/api/divisions/[id]/route.ts`
    - `app/api/credentials/route.ts`
    - `app/api/credentials/[id]/route.ts`
    - `app/api/credentials/[id]/reveal/route.ts`
    - `app/api/members/route.ts`
    - `app/api/members/[membershipId]/route.ts`
    - `app/api/members/invite/route.ts`
    - `app/api/members/invitations/[id]/route.ts`
    - `app/api/invite/accept/route.ts`
  - Preserved existing API error payload shape (`{ error: { code, message } }`) and validation field error payloads while centralizing service-level permission and data logic
  - Verified `npm run build` passes after refactor

- **[BUGFIX]** Fixed sign-up redirect and data sync race condition:
  - Changed sign-up `forceRedirectUrl` from `/dashboard` to `/onboarding` to eliminate race condition with webhook
  - Improved webhook handler with comprehensive error handling, validation, and logging
  - Created [WEBHOOK_SETUP_VERIFICATION.md](WEBHOOK_SETUP_VERIFICATION.md) guide for debugging webhook issues
  - Root cause: User was redirected to `/dashboard` before Clerk webhook synced user to database, causing blank page and membershipCount check to redirect to onboarding
  - New flow: Sign-up → Onboarding → Create Division → Dashboard (all data synced properly at each step)

- Migrated the UI theme from classic glassmorphism to liquid glassmorphism
- Updated the shared liquid-glass token system in `app/globals.css`
- Refined the shared button primitive and core shell surfaces for brighter selected/action states
- Added opaque liquid-chip surfaces for primary buttons and selected rows
- Removed the blue selected rail in the sidebar and matched sidebar rows to the liquid chip style
- Switched non-selected sidebar rows to the shared `ghost` button variant
- Changed inactive sidebar rows to text-only buttons with no filled surface
- Updated `globals.css` with Otter design tokens and glass utilities
- Added `app/(app)/layout.tsx` (Server Component app shell)
- Added `components/layout/Sidebar.tsx` (Client Component)
- Added `components/layout/Topbar.tsx` (Client Component)
- Added `app/(app)/dashboard/page.tsx` (Server Component, static mock)
- Kicked off Feature 02: read auth spec and created implementation plan
- Added `lib/clerk-appearance.ts` for Clerk theme variables backed by CSS vars (glass tokens)
- Added `proxy.ts` with Clerk route protection and public auth routes (async, env-var-driven)
- Added `app/sign-in/[[...sign-in]]/page.tsx` and `app/sign-up/[[...sign-up]]/page.tsx`
- Replaced the home page with auth-aware redirects to `/dashboard` and `/sign-in`
- Added Clerk `UserButton` to the Topbar
- Installed `@clerk/ui`
- Reimplemented Feature 02 to best practices:
  - Deleted `components/ClerkProviderWrapper.tsx` (unnecessary wrapper); `ClerkProvider` now inlined directly in root layout
  - Fixed `proxy.ts`: added `async`/`await` on middleware handler, public routes use `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` env vars, `/` removed from public routes
  - Fixed `lib/clerk-appearance.ts`: replaced invalid/shadcn variables with valid Clerk appearance variables mapped to glass CSS tokens (`--glass-bg-raised`, `--text-primary`, `--text-subtle`, `--accent-primary`, etc.)
  - Fixed `components/auth/AuthPageShell.tsx`: replaced shadcn vars (`--background`, `--card`, `--border`, `--foreground`) with glass token system
  - Added `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL` to `.env`
- Verified `npm run build` passes
- Added `app/(app)/divisions/page.tsx` (Server Component, static mock, no API calls)
- Installed `badge` shadcn component (`components/ui/badge.tsx`)
- Used shadcn `Badge` for role labels, `Button` for actions; zero `style={{}}` — all styling via Tailwind v4 CSS variable shorthand `bg-(--var)` / `text-(--var)` and arbitrary `bg-[rgba(...)]`
- Implemented Feature 04 app shell behavior:
  - Added `components/layout/AppShell.tsx` to control sidebar open/close state in a client boundary
  - Updated `app/(app)/layout.tsx` to render the new `AppShell`
  - Replaced `components/layout/Topbar.tsx` with a fixed-height 3-section topbar and functional sidebar toggle in the left section
  - Replaced `components/layout/Sidebar.tsx` with an overlay sidebar that slides in from the left, accepts `isOpen`/`onClose`, and does not push page content
  - Sidebar navigation now uses `Link` + route-based active state via `usePathname`, and closes after navigation
- Adjusted sidebar behavior based on feedback:
  - Sidebar remains floating with glass panel styling, but is now positioned in a dedicated left column so it stays side-by-side with content
  - Restored previous sidebar menu entries (Projects, Credentials, Members, Audit Log, Settings, Support) even when pages are not yet implemented
  - Unavailable menu entries are intentionally rendered as disabled "Coming soon" items to avoid routing to missing pages
- Restored legacy topbar composition while keeping full-width layout:
  - Left section now includes sidebar toggle and breadcrumb context
  - Center section includes glass search input
  - Right section includes OTP badge and Clerk `UserButton`
- Restored `My Divisions` list in sidebar with selectable mock division rows
- Updated shell/profile polish:
  - Topbar is now a floating rounded glass panel (not attached to viewport edges)
  - Topbar profile area now renders Clerk user name + email with `useUser()`
  - Sidebar bottom profile row now uses Clerk components (`UserButton`, `SignOutButton`) and real user identity data
- Applied latest layout refinement request:
  - Topbar changed to fully rounded pill shape
  - Removed OTP badge from topbar
  - Moved search input to right side and kept only profile photo (`UserButton`) in topbar
  - Enforced full-height sidebar container in app shell column
- Updated shell layout direction:
  - Removed topbar from app shell to match cleaner dashboard composition
  - App shell now uses two-pane layout only: floating sidebar on the left and full content canvas on the right
- Added sidebar open/close interaction without topbar:
  - Sidebar now includes an inline close button in the header
  - App shell shows a floating open button when sidebar is collapsed
  - Sidebar width transitions smoothly between open and closed states
- Refined sidebar reopen button positioning:
  - Moved open button anchor from content panel to app shell root for consistent placement when sidebar is collapsed
- Improved collapsed-sidebar aesthetics:
  - Replaced floating standalone open button with a slim left mini-rail glass panel
  - Open control now lives inside that rail for cleaner, stable composition
- Enhanced mini-rail usability:
  - Added persistent app logo in collapsed state
  - Added visible sidebar icon navigation in mini-rail (with active state for available routes)
- Refined icon visibility and shape:
  - Increased visibility of unavailable icons in expanded sidebar (no global opacity fade on rows)
  - Updated collapsed mini-rail to use rounded-full styling for container and icon buttons
- Expanded collapsed mini-rail parity:
  - Added `Settings`, `Support`, and `Profile` presence in collapsed mode
  - Added division color indicators in collapsed mode to preserve division context
- Refined collapsed mini-rail spacing:
  - Added separators in collapsed mode for clearer section breaks
  - Increased spacing between division indicators
  - Matched the collapsed profile avatar size to the logo size
- Refined collapsed Clerk profile sizing:
  - Forced the Clerk `UserButton` trigger and avatar to the same visual size as the blue app logo
- Reworked the navigation flow so Projects are active in the sidebar and credentials are shown inside project detail views
- Added project detail routes under `/projects/[projectId]` with project-scoped credential cards
- Redirected `/credentials` to `/projects` to avoid a standalone global credential surface
- Added environment grouping for project credentials so Production, Development, Staging, and Shared secrets render in separate sections
- Converted credential groups into a collapsible accordion list inside project detail pages
- Implemented Feature 03 Division Switcher redesign:
  - Created `components/layout/DivisionSwitcher.tsx` with dropdown switcher showing division name, member count, and member avatars
  - Integrated DivisionSwitcher into sidebar below logo header
  - Removed "My Divisions" section from sidebar navigation
  - Removed "Divisions" link from main navigation (now accessible via DivisionSwitcher)
  - Updated Feature 03 specification to reflect sidebar switcher approach instead of separate page
- Implemented Feature 03 approved flow refinement:
  - Added Add Division action in switcher dropdown
  - Added Create Division modal in `DivisionSwitcher` and kept active division unchanged after create
  - Added localStorage persistence for division list and active division context
  - Synced division context between expanded sidebar switcher and collapsed mini-rail indicators
  - Enabled Settings navigation and added `app/(app)/settings/page.tsx` for division management surface
  - Added shared `lib/divisions.ts` for types, defaults, storage keys, and helper utilities
- Upgraded Feature 03 modal implementation:
  - Installed latest shadcn `dialog` component
  - Migrated Create Division modal to shadcn `Dialog` with global portal overlay (not inside sidebar)
- Expanded Settings to product-level Otter control center:
  - Redesigned `app/(app)/settings/page.tsx` to include Security & Authentication, Vault Policy, Audit & Compliance, Notifications & Integrations, and Division Access Directory sections
- Fixed app-shell scrolling behavior:
  - Updated `components/layout/AppShell.tsx` so the content pane has proper height constraints (`h-dvh`, `min-h-0`, and full-height content column)
  - Restored vertical scrolling in the main content area via `overflow-y-auto` on a height-bounded container
- Implemented Feature 08 member page:
  - Added `app/(app)/members/page.tsx` as a static shadcn-based member management screen with card rows, invite-by-email UI, and local role switching only
  - Enabled the `Members` item in `components/layout/Sidebar.tsx` so the sidebar now routes to `/members`
- Simplified the member page UI to keep only the required feature surface: invite form, role controls, and card-based member rows
- Reworked role selection into dialog modals with shadcn `RadioGroup` so invite/member role changes now show both the role name and description
- Implemented Feature 09 audit log screen:
  - Added `app/(app)/auditlog/page.tsx` as a static shadcn-based audit trail with search, date range, action/resource filters, division scoping, sorting, pagination, and mobile card fallback
  - Added shadcn `table`, `select`, and `checkbox` primitives for the audit log UI
  - Wired the sidebar and mini-rail navigation to `/auditlog`
- Verified `npm run build` passes after the audit log implementation

- Redesigned audit log UI for simplicity: replaced massive filter panel (checkbox card groups, info cards, bordered sections occupying ~60% viewport) with compact inline toolbar (search + dropdown selects), toggle pill filters for action/resource types, and clean table — reduced file from 1266 lines to ~280 lines
- Implemented Feature 10 onboarding flow (real Prisma implementation):
  - Added `Division` and `DivisionMembership` models with `Role` enum to `prisma/schema.prisma`
  - Ran `prisma migrate dev --name init` — tables live in the connected Prisma Postgres DB
  - Created `lib/prisma.ts` — PrismaClient singleton using PrismaPg driver adapter (`@prisma/adapter-pg`)
  - Created `lib/validations/division.ts` — Zod schema for division creation
  - Created `app/api/divisions/route.ts` — GET (list user divisions) and POST (create division + DIVISION_OWNER membership)
  - Created `app/onboarding/page.tsx` — 2-step glassmorphism card: Step 1 creates division (required, name pre-filled from Clerk user), Step 2 invite team (UI only, skippable)
  - Updated `app/(app)/layout.tsx` — server-side division membership check; redirects to `/onboarding` if user has no division
  - Updated `components/layout/DivisionSwitcher.tsx` — replaced mock DEFAULT_DIVISIONS with real API fetch; localStorage still persists active division ID across sessions
  - Installed `zod`, `react-hook-form`, `@hookform/resolvers`

- Division management in Settings:
  - Added `app/api/divisions/[id]/route.ts` — `PATCH` (rename, owner-only) and `DELETE` (owner-only; guarded: cannot delete last division)
  - Rewrote `app/(app)/settings/page.tsx` — fetches real divisions from API; inline rename (click pencil → edit in place, Enter/blur to save); delete with confirmation dialog and error display; "New Division" button with create dialog; delete button hidden when only one division remains
  - Removed all `DEFAULT_DIVISIONS` / `DIVISIONS_STORAGE_KEY` usage from settings page

## Completed (Onboarding Fix + Auth Redirect)

- Fixed `app/page.tsx`: replaced non-existent `isAuthenticated` with `userId` from `auth()` — resolves post-sign-in redirect loop/delay
- Fixed `app/onboarding/page.tsx`: renamed all "Workspace" UI text to "Division" (step label, card title, card description, field label, default name)
- Fixed `app/api/divisions/route.ts`: wrapped `prisma.division.create` and `writeAuditLog` in separate try/catch blocks; audit log failures are now non-fatal so division creation never returns a blank 500
- Replaced deprecated `result.error.flatten().fieldErrors` (Zod v4) with `Object.fromEntries(result.error.issues.map(...))` in divisions POST route

## In Progress

- Database reset pending explicit user confirmation (see session notes).

## Completed (User Model + Clerk Webhook Sync)

- Added `User` model to `prisma/schema.prisma` — fields: `clerkId (unique)`, `email (unique)`, `name`, `imageUrl?`, `createdAt`, `updatedAt`
- Created and applied `prisma/migrations/20260509032016_add_user_model/migration.sql`
- Regenerated Prisma client — `prisma.user` is now available
- Created `app/api/webhooks/clerk/route.ts` — handles `user.created`, `user.updated` (upsert by `clerkId`), `user.deleted` (deleteMany); uses `verifyWebhook(req)` from `@clerk/nextjs/webhooks` with `CLERK_WEBHOOK_SECRET`
- Updated `proxy.ts` — added `/api/webhooks(.*)` to public routes so Clerk middleware does not block the webhook endpoint
- Added `CLERK_WEBHOOK_SECRET=` placeholder to `.env` — must be filled from Clerk Dashboard → Webhooks → endpoint signing secret
- `npm run build` passes with no type errors

## Completed (Feature 14 — Real Audit Log)

- Extended `AuditAction` enum with 10 new values: `CREDENTIAL_COPY`, `PROJECT_CREATE`, `PROJECT_UPDATE`, `PROJECT_DELETE`, `MEMBER_INVITE`, `MEMBER_ROLE_CHANGE`, `MEMBER_REMOVE`, `DIVISION_CREATE`, `DIVISION_RENAME`, `DIVISION_DELETE`
- Extended `AuditLog` model: added `resourceType String`, `resourceId String?`, `resourceName String`, and `division Division?` back-relation; added `auditLogs AuditLog[]` to `Division` model
- Created `prisma/migrations/20260509030509_extend_audit_log/migration.sql` — adds columns as nullable, backfills existing 38 rows (`resourceType='CREDENTIAL'`, `resourceName` from linked credential or 'Unknown'), then enforces NOT NULL; adds FK for `divisionId → Division`
- Applied migration and regenerated Prisma client
- Created `lib/audit.ts` — `writeAuditLog(payload)` helper used by all mutation routes
- Created `lib/validations/audit.ts` — Zod schema for `GET /api/audit` query params
- Created `app/api/audit/route.ts` — GET handler: division-scoped, supports `divisionId`, `action`, `resourceType`, `dateRange`, `q`, `page`, `perPage`; resolves Clerk actor info (name, email, imageUrl) with per-request Map cache; returns `AuditEntryDTO[]` with pagination
- Updated `app/api/credentials/route.ts` (POST) — uses `writeAuditLog` with `resourceType`, `resourceId`, `resourceName`
- Updated `app/api/credentials/[id]/route.ts` (PUT, DELETE) — uses `writeAuditLog` with full payload
- Updated `app/api/credentials/[id]/reveal/route.ts` (GET) — uses `writeAuditLog`
- Updated `app/api/projects/route.ts` (POST) — adds `PROJECT_CREATE` audit entry
- Updated `app/api/projects/[id]/route.ts` (PATCH, DELETE) — adds `PROJECT_UPDATE` / `PROJECT_DELETE` audit entries
- Updated `app/api/divisions/route.ts` (POST) — adds `DIVISION_CREATE` audit entry
- Updated `app/api/divisions/[id]/route.ts` (PATCH, DELETE) — adds `DIVISION_RENAME` (with oldValue/newValue metadata) / `DIVISION_DELETE` audit entries
- Created `components/audit/AuditLogSkeleton.tsx` — proper Suspense skeleton mirroring table structure
- Created `components/audit/AuditLogRow.tsx` — presentational table row; full `ACTION_META` map for all 15 `AuditAction` values with Phosphor icons and badge colors
- Created `components/audit/AuditLogTable.tsx` — Client Component with filter state (search, dateRange, division, action, resource), `useTransition`-based re-fetch on filter change, `.glass` / `.glass-raised` surfaces, fixed hover via `hover:bg-(--glass-bg-hover)`, actor avatar column
- Rewrote `app/(app)/auditlog/page.tsx` — Server Component with `Suspense`; fetches initial page from Prisma directly (no artificial delay), resolves Clerk actors, passes to `AuditLogTable`
- `npm run build` passes with no type errors

## Completed (Feature 13 — Slug)

- Added `slug String @unique` to `Project` model in `prisma/schema.prisma`
- Added `slug String` + `@@unique([projectId, slug])` to `Credential` model
- Created `prisma/migrations/20260509000000_add_slugs/migration.sql` — nullable-add, id-backfill for existing rows, then NOT NULL + unique index
- Applied migration with `prisma migrate deploy`; regenerated Prisma client
- Created `lib/slug.ts` — `toSlug(name)` lowercases and replaces non-alphanumeric runs with `-`
- Updated `app/api/projects/route.ts` (POST) — generates slug from name; returns `409 CONFLICT` if slug already taken
- Updated `app/api/credentials/route.ts` (POST) — generates slug from name; returns `409 CONFLICT` if slug already taken within the project (`projectId_slug` unique key)
- Updated `types/project.ts` and `types/credential.ts` — added `slug: string` field
- Renamed route folder `[projectId]` → `[slug]` and `[credentialId]` → `[credentialSlug]`
- Rewrote `app/(app)/projects/[slug]/page.tsx` — looks up project by `slug` (not `id`); passes `projectSlug` to `ProjectCredentialsList`
- Rewrote `app/(app)/projects/[slug]/credentials/new/page.tsx` — looks up project by `slug`; passes `project.id` to `CredentialForm`
- Rewrote `app/(app)/projects/[slug]/credentials/[credentialSlug]/edit/page.tsx` — looks up project by `slug`, then credential by `projectId_slug` composite key
- Updated `components/projects/ProjectCard.tsx` — all hrefs use `project.slug`
- Updated `components/projects/ProjectCredentialsList.tsx` — accepts `projectSlug`; edit URL uses `credential.slug`
- Updated `components/projects/DeleteProjectDialog.tsx` — confirmation input asks user to type the project **slug** to enable delete
- Updated `components/credentials/DeleteCredentialDialog.tsx` — accepts `credentialSlug`; confirmation input asks user to type the credential **slug** to enable delete
- Fixed pre-existing type error in `CredentialForm.tsx`: changed `z.boolean().optional().default(true)` to `z.boolean()` and added explicit `secret` to all `append`/`replace` calls (parseDotEnv paste defaults to `secret: false`)

## Completed (Feature 12 — Credentials Page CRUD + Paste .env)

- Added `Credential`, `CredentialField`, `AuditLog` models to `prisma/schema.prisma`; added `AuditAction` enum; ran `prisma migrate dev --name add_credential_auditlog`
- Created `lib/crypto.ts` — AES-256-GCM encrypt/decrypt using `CREDENTIAL_ENCRYPTION_KEY` env var; throws at module load if key is missing
- Added `CREDENTIAL_ENCRYPTION_KEY` (32-byte base64 key) to `.env`
- Created `lib/validations/credential.ts` — `createCredentialSchema`, `updateCredentialSchema`, form schemas, inferred types
- Created `types/credential.ts` — `Credential`, `CredentialField`, `CredentialFieldWithValue`, `CredentialWithProject` interfaces
- Created `app/api/credentials/route.ts` — `GET` (list by division/project, membership-scoped) and `POST` (create with field encryption + audit log)
- Created `app/api/credentials/[id]/route.ts` — `GET` (metadata, no values), `PUT` (replace fields with re-encryption + audit log), `DELETE` (204 + audit log)
- Created `app/api/credentials/[id]/reveal/route.ts` — `GET` (decrypt all field values for authorized member + audit log)
- Created `components/credentials/parseDotEnv.ts` — robust parser supporting comments, blank lines, `export` prefix, quoted values, trim
- Created `components/credentials/CredentialCard.tsx` — glass card with env badge, field count, expand to reveal fields (inline decrypt on demand), per-field secret toggle and copy button
- Created `components/credentials/CredentialForm.tsx` — unified create/edit form with dynamic key/value fields, secret toggle per field, paste .env textarea (replaces fields on paste), max 200 field guard
- Created `components/credentials/CredentialListSkeleton.tsx` — animated loading skeleton
- Created `components/credentials/DeleteCredentialDialog.tsx` — `AlertDialog` confirm with error display
- Rewrote `app/(app)/credentials/page.tsx` — list view with search filter, role-gated create button, empty state, delete dialog; reads active division from localStorage
- Created `app/(app)/credentials/new/page.tsx` — Server Component that fetches user's projects; renders `CredentialForm` in create mode
- Created `app/(app)/credentials/[id]/edit/page.tsx` — Server Component that decrypts current values for pre-fill; role-gated (admin only); renders `CredentialForm` in edit mode
- Credential CRUD surfaced inside project detail, not as a top-level menu:
  - Removed `Credentials` from sidebar nav; `/credentials` redirects to `/projects`
  - Created `app/(app)/projects/[projectId]/credentials/new/page.tsx` — Add Credential page scoped to a project
  - Created `app/(app)/projects/[projectId]/credentials/[credentialId]/edit/page.tsx` — Edit Credential page
  - Created `components/projects/ProjectCredentialsList.tsx` — Client Component: groups credentials by environment, inline delete, edit links, uses `CredentialCard`
  - Updated `app/(app)/projects/[projectId]/page.tsx` — fetches real credentials, shows credential count, wires `ProjectCredentialsList` and "Add credential" button
  - Updated `CredentialForm` to accept `returnUrl` prop; updated `CredentialCard` to accept `editUrl` prop

## Completed (Feature 11 — CRUD Projects)

- Added `Project` model to `prisma/schema.prisma` with `Division` back-relation; ran `prisma migrate dev --name add-project-model`
- Created `lib/auth.ts` — exports `getUserDivisionIds(clerkId)` and `getUserRoleInDivision(clerkId, divisionId)` helpers
- Created `lib/validations/project.ts` — `createProjectSchema`, `updateProjectSchema`, `CreateProjectInput`, `UpdateProjectInput`
- Installed shadcn components: `dropdown-menu`, `alert-dialog`, `textarea`, `sonner`
- Created `app/api/projects/route.ts` — `GET` (list by division, membership-scoped) and `POST` (create, admin-only)
- Created `app/api/projects/[id]/route.ts` — `PATCH` (update, owner/admin) and `DELETE` (owner-only, 204)
- Created `components/projects/credential-types.ts` — extracted `credentialTypeConfig` from mock-data
- Created `components/projects/ProjectCard.tsx` — real `Project` type, three-dot `DropdownMenu` for edit/delete, role-gated affordances
- Created `components/projects/CreateProjectDialog.tsx` — React Hook Form + Zod, shadcn `Dialog`, environment `Select`
- Created `components/projects/EditProjectDialog.tsx` — pre-filled from project, PATCH on submit
- Created `components/projects/DeleteProjectDialog.tsx` — `AlertDialog` with error display, 204 on confirm
- Created `components/projects/ProjectListSkeleton.tsx` — 6-card loading skeleton
- Rewrote `app/(app)/projects/page.tsx` as Client Component — reads active division from `localStorage`, fetches real API, role-gated create/edit/delete, empty state, search filter, division-change listener
- Updated `app/(app)/projects/[projectId]/page.tsx` — loads real `Project` from Prisma, verifies division membership, shows empty credential state
- Updated `components/projects/ProjectCredentialsAccordion.tsx` — imports from `credential-types.ts` instead of deleted mock-data, added empty state
- Deleted `app/(app)/projects/mock-data.ts` — all mock data removed

## Completed (Feature 15 — Invite Member)

- Added `Invitation` model + `InvitationStatus` enum to `prisma/schema.prisma`; added `invitations Invitation[]` back-relation to `Division`
- Applied migration `20260509040857_add_invitation_model`; regenerated Prisma client
- Created `lib/emails/invite.ts` — plain HTML invite email template (`inviteEmailHtml`)
- Created `lib/validations/member.ts` — `inviteMemberSchema` + `changeMemberRoleSchema` (Zod, `as const` enum fix for Zod v4)
- Created `app/api/members/invite/route.ts` — `POST`: Path A (user exists → create membership) + Path B (user absent → create Invitation row, send email via Resend, return invite link)
- Created `app/api/members/route.ts` — `GET`: returns active members (resolves names from `User` table or Clerk API) + pending invitations scoped to division
- Created `app/api/members/[membershipId]/route.ts` — `PATCH` (change role, owner-guarded) + `DELETE` (remove member, owner-guarded); both write audit logs
- Created `app/api/members/invitations/[id]/route.ts` — `DELETE`: revokes pending invitation (admin+ only)
- Created `app/api/invite/accept/route.ts` — `GET`: validates token (status, expiry), creates `DivisionMembership`, marks invitation ACCEPTED, writes audit log
- Created `app/accept-invite/page.tsx` — Server Component: reads token, unauthenticated users redirected to `/sign-up?redirect_url=…`, inlines Prisma logic (no HTTP self-fetch), shows `ErrorCard` on expired/revoked/missing token, redirects to `/` on success
- Rewrote `app/(app)/members/page.tsx` — Client Component: reads `divisionId` from localStorage, fetches real `GET /api/members`, invite form wired to `POST /api/members/invite`, shows copy-able invite link modal on Path B, role change via dialog (PATCH), remove member button (DELETE), revoke invite button (DELETE invitations), pending invites section
- Fixed pre-existing type errors in `app/api/webhooks/clerk/route.ts`: removed `session.pending` and `invitation.*` event comparisons no longer in Clerk SDK type union

## Completed (Feature 16 — ngrok + Clerk Webhook Setup for Development)

- Removed `svix` dependency from `package.json` — Clerk's `@clerk/nextjs/webhooks` provides `verifyWebhook(req)` directly
- Cleaned webhook handler at `app/api/webhooks/clerk/route.ts`:
  - Removed Svix-specific header logging (`svix-id`, `svix-timestamp`, `svix-signature`)
  - Retained comprehensive error handling, validation, and logging for debug purposes
  - Handler uses `verifyWebhook(req)` from `@clerk/nextjs/webhooks` with `CLERK_WEBHOOK_SIGNING_SECRET`
  - Syncs `user.created`, `user.updated` (upsert by `clerkId`), and `user.deleted` events to local database
- Verified `CLERK_WEBHOOK_SIGNING_SECRET` in `.env` — must match Clerk Dashboard → Webhooks → endpoint signing secret
- Verified `proxy.ts` — webhook endpoint (`/api/webhooks(.*)`) already in public routes so Clerk middleware does not block
- Ready for ngrok tunnel during development:
  - Run `ngrok http 3000` to generate tunnel URL
  - Update Clerk Dashboard → Webhooks to point to `https://[ngrok-url]/api/webhooks/clerk`
  - Dev server logs webhook verification and sync status for all user events
- `npm run build` passes with no type errors

## Completed (Onboarding invite + member loading fix)

- Fixed `app/(app)/members/page.tsx`: `loading` now initializes as `false`; was stuck on `true` because the `divisionId` effect returns early when null, never calling `setLoading(false)`
- Wired onboarding Step 2 invite form to real `POST /api/members/invite` API:
  - Tracks `divisionId` in component state (set after Step 1 creates the division)
  - Inline `RadioGroup` role selector (Member / Admin) replaces the placeholder disabled button
  - `useTransition` for loading state; shows sent-invite list with checkmarks below the form
  - Skip button relabels to "Done" once at least one invite has been sent
  - Errors (409 conflict, network) surfaced inline

## Completed (Feature 17 — Settings Page Alignment)

- Created `app/api/profile/route.ts` — `GET`: reads `User` row by `clerkId`; returns `{ name, email, imageUrl, createdAt }` with nulls on missing row (never throws)
- Rewrote `app/(app)/settings/page.tsx`:
  - Added **Profile card** at the top: 48px avatar (DB `imageUrl` → Clerk `imageUrl` → initial letter fallback), display name, email, "Member since" date; "Edit Profile" button calls `useClerk().openUserProfile()` to open Clerk's own modal
  - Simplified **Security & Authentication**: replaced fake Fingerprint/LockKey/WarningCircle rows with three accurate read-only rows (`Authentication: Clerk`, `Session management: Clerk-managed`, `Suspicious login alerts: Clerk-managed`)
  - Fixed **Vault Policy**: removed "Copy protection" row (not implemented); "Encryption at rest" now shows `AES-256-GCM` (matches `lib/crypto.ts`)
  - Fixed **Audit & Compliance**: removed "Audit retention" row (no retention job); moved to full-width below the 2-col grid; "Reveal activity log" shows `Enabled` badge
  - Removed **Notifications & Integrations** card entirely (static badges, no real integrations)
  - Final section order: Header → Profile → Workspace Context → 2-col grid (Security + Vault) → Audit & Compliance → Division Management
- `npm run build` passes with no type errors

## Completed (Feature 18 — Dashboard Real Data)

- Created `lib/audit-meta.ts` — shared `ACTION_META` record (all 15 `AuditAction` values) with `label`, `verb`, `icon`, `badgeClass`, `iconBg`, `iconColor`; plus shared `relativeTime(date)` helper
- Updated `components/audit/AuditLogRow.tsx` — removed duplicate local `ACTION_META` and `relativeTime`; now imports both from `lib/audit-meta`
- Created `components/dashboard/DashboardStats.tsx` — 4 real stat cards (division count, project count, credential count, 7-day audit count); all values from Prisma queries
- Created `components/dashboard/DivisionCards.tsx` — My Divisions grid with real project/member/credential counts per division; accent palette from `getDivisionPalette`; `ROLE_LABEL` map for human-readable role display; empty state
- Created `components/dashboard/RecentActivity.tsx` — feed of 7 most recent audit log entries across user's divisions; actor names from `User` table; action verb + resource name format; `relativeTime` display
- Created `components/dashboard/QuickAccess.tsx` — 5 most recently created projects across all divisions; `<Link href="/projects/[slug]">` rows with credential counts; empty state with CTA
- Rewrote `app/(app)/dashboard/page.tsx` — Server Component; fetches all data with two `Promise.all` rounds (memberships + user info first, then counts/logs/projects + per-division cred counts in parallel); actor names resolved from `User` table; time-of-day greeting from `currentUser()` first name; no mock data remains
- `npm run build` passes with no type errors

## Completed (Feature 20 — Reusable UI Primitives)

- Created `components/ui/glass-input.tsx` — GlassInput wraps shadcn Input with glass className baked in; exports `GLASS_INPUT_CLASS` constant
- Created `components/ui/glass-textarea.tsx` — GlassTextarea wraps shadcn Textarea with glass className baked in
- Created `components/ui/glass-select.tsx` — GlassSelect wraps shadcn Select/SelectTrigger/SelectContent/SelectItem with glass styling and an `options` array prop; handles Phosphor icon rendering
- Created `components/ui/field-input.tsx` — FieldInput renders the correct control via `switch (field.type)` over the `FieldType` enum (`TEXT | PASSWORD | TEXTAREA | SELECT | MONO`); PASSWORD type has built-in eye/eye-slash toggle
- Created `components/ui/form-field.tsx` — FormField composes label + FieldInput + error message; `field.required` drives the asterisk
- Created `components/ui/glass-dialog.tsx` — GlassDialog wraps shadcn Dialog with `glass-heavy rounded-2xl border-(--glass-border)` baked in; optional `footer` prop renders inside `DialogFooter`
- Created `components/ui/danger-dialog.tsx` — DangerDialog wraps shadcn AlertDialog for destructive confirmations; optional `confirmText` renders a "type X to confirm" input; catches `onAction` errors and shows them inline + toast; auto-closes on success
- Created `components/ui/form-actions.tsx` — FormActions renders the liquid-glass submit + ghost cancel button pair
- Refactored `components/projects/CreateProjectDialog.tsx` — uses GlassDialog + FormField; submit button linked via `form="create-project-form"` attribute
- Refactored `components/projects/EditProjectDialog.tsx` — uses GlassDialog + FormField; submit button linked via `form="edit-project-form"` attribute
- Refactored `components/projects/DeleteProjectDialog.tsx` — replaced ~120-line shell with 40-line DangerDialog wrapper
- Refactored `components/credentials/DeleteCredentialDialog.tsx` — replaced ~130-line shell with 40-line DangerDialog wrapper
- Refactored `components/credentials/CredentialForm.tsx` — name field → FormField(TEXT), environment → FormField(SELECT) with ENVIRONMENT_OPTIONS constant, .env paste area → GlassTextarea, key/value row inputs → GlassInput, submit/cancel → FormActions
- Refactored `components/settings/EditProfileDialog.tsx` — name Input replaced with GlassInput
- Zero occurrences of the raw glass input className string remain outside `glass-input.tsx`
- `npm run build` passes with no type errors

## Completed (Server Component Refactor)

- Extracted all client logic out of `page.tsx` files that were incorrectly marked `"use client"`:
  - Created `components/projects/ProjectsView.tsx` — client component; accepts `initialProjects` + `initialDivisions` from server; filters projects by active division client-side (no API round-trip on division switch)
  - Created `components/settings/SettingsView.tsx` — client component; accepts `initialProfile` + `initialDivisions` from server; refreshes via API only after mutations
  - Created `components/members/MembersView.tsx` — client component; reads active division from localStorage; fetches members on demand
  - Rewrote `app/(app)/projects/page.tsx` — server component; calls `listProjectsForUser` + `listDivisionsForUser` from service layer; no `"use client"`
  - Rewrote `app/(app)/settings/page.tsx` — server component; calls `prisma.user.findUnique` + `listDivisionsForUser`; passes serialized profile + divisions as props
  - Rewrote `app/(app)/members/page.tsx` — server component; thin wrapper rendering `MembersView`
- `tsc --noEmit` passes with no type errors

## Next Up

- Define and implement the next feature scope

## Open Questions

- None.

## Architecture Decisions (Feature 03)

- `style={{}}` avoided entirely on the divisions page per spec; color tokens applied via Tailwind v4 shorthand `text-(--text-primary)` / `bg-(--accent-primary)` and Tailwind arbitrary values `bg-[rgba(...)]` for rgba accent backgrounds.
- Per-division accent color is encoded in mock data as Tailwind class strings (no dynamic style injection needed for static mock).

## Architecture Decisions

- Use Clerk `dark` theme from `@clerk/ui/themes` and map its colors to our CSS variables (no hardcoded colors).
- Use `proxy.ts` at project root for Clerk proxy behavior (do not add `middleware.ts`).
- Keep Clerk's default user menu and profile flows intact; add `UserButton` to Topbar.
- Root `/` redirects authenticated users to `/dashboard` and unauthenticated users to `/sign-in`.
- `ClerkProvider` is used directly in root layout — no wrapper component needed.
- Clerk appearance variables must use valid Clerk-defined keys (not shadcn variable names); all values reference CSS custom properties from the glass token system.

## Session Notes

- Feature 01 is pure UI with static mock data — no API calls, no Clerk, no Prisma.
- All glass/canvas CSS tokens live in `globals.css` under `:root`.
- DM Sans replaces Geist Sans as the UI font; JetBrains Mono stays for credentials/code display.
- Feature 02 implementation plan stored in the todo tracker; next step is to implement `ClerkProvider` wrap and add `proxy.ts`.
