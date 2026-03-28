## Context

Open NoteHub has already been renamed at the repository level, but the shipped experience is still split across multiple identities. Users still encounter `LearnHub` in the login page, article metadata, top navigation, and default metadata title. Developers still see `learnhub` in package metadata, compose definitions, database defaults, cookie names, and scripts. This inconsistency weakens trust and makes the project feel unfinished.

The homepage has a second problem: the hero copy currently explains the selected visual theme more than it explains the product. The page needs to communicate the product's value immediately: save articles, search them later, and use AI to understand them better.

## Goals / Non-Goals

**Goals:**
- Make `Open NoteHub` the single canonical product name across user-visible surfaces and repository/runtime defaults.
- Reframe the library homepage as a product entry point for collecting, searching, and understanding articles.
- Keep search and browsing as the first-class homepage action while making AI understanding visible in the supporting message.
- Change library theme naming from visual metaphors to product-oriented browsing modes.
- Preserve access to existing local data when default database identifiers change.

**Non-Goals:**
- Building the future article-import flow or adding a dead-end import CTA before that capability exists.
- Redesigning article pages or smart-reading pages beyond naming/copy alignment.
- Reworking dark mode, card structure, or unrelated visual systems beyond what branding/copy alignment requires.

## Decisions

### 1. `Open NoteHub` is the canonical brand everywhere

All user-visible brand surfaces will use `Open NoteHub`. Descriptive phrases such as "开放式知识文库" may appear as product descriptors, but they do not replace the brand name.

The same alignment applies to project/operator-facing identifiers that matter during setup and operations:
- `package.json` package name
- `NEXT_PUBLIC_SITE_TITLE` defaults and examples
- docker compose service/image/container/volume names
- session cookie name
- default local database path
- setup docs and active project docs

Alternative considered:
- Keep old internal identifiers and only change visible UI labels. Rejected because the user explicitly wants a full alignment, and mixed names would continue to leak into setup and maintenance workflows.

### 2. Homepage copy should explain the product, not the theme

The homepage hero will shift from theme-led copy to product-led copy.

Recommended messaging shape:
- Product descriptor: `开放式知识文库`
- Headline: `收藏、搜索、理解每一篇值得留下的文章`
- Supporting copy: explain that Open NoteHub helps users keep articles in one place and use AI to continue understanding them through translation, summarization, and follow-up thinking.

The search field remains the primary interaction in the hero. Supporting copy, sublabels, and stats can reinforce AI reading value, but the first screen should still feel like the entry to a working product rather than a landing page or marketing site.

Alternative considered:
- Keep poetic design-language headlines and only tweak the subtitle. Rejected because the current mismatch is conceptual, not cosmetic.

### 3. Theme chooser should use experience vocabulary

The library theme drawer remains homepage-only, but its vocabulary changes from aesthetic metaphors to browsing modes. The product message belongs to the homepage hero; the drawer should only describe how the library view behaves.

Recommended user-facing theme names:
- `专注浏览` (default): calmer spacing, lighter hierarchy, better for continuous browsing and filtering
- `导读编排`: stronger title/summary emphasis, better for rapid scanning and editorial-style selection

Implementation note:
- Internal theme IDs should also move to semantic names such as `focus` and `editorial`.
- Existing stored values `airy` and `magazine` should be mapped forward so current users keep their preference instead of silently resetting.

Alternative considered:
- Keep `airy` / `magazine` internally and only relabel the UI. Rejected because the rename request is intentionally end-to-end, and the storage migration is small enough to handle cleanly.

### 4. Rename project defaults with compatibility for legacy local data

Changing default identifiers can accidentally strand existing users or developers if the application starts looking at a new empty database or ignores legacy state.

Compatibility strategy:
- Default local DB path becomes `file:./open-notehub.db`.
- If `DATABASE_URL` is unset, `open-notehub.db` does not exist, and legacy `learnhub.db` does exist, the runtime/migration path should keep using the legacy data or migrate it in place before startup continues.
- Session cookie name changes to an Open NoteHub-aligned value. Existing sessions may be invalidated once; that is acceptable.
- Local theme storage keeps forward compatibility by mapping legacy theme keys/values.

Alternative considered:
- Hard-cut all defaults with no compatibility logic. Rejected because it would make local environments appear empty after a simple rename.

### 5. Documentation alignment includes active historical project docs

Repository docs and active planning/spec files that still describe the product as LearnHub should be updated so the project's own written record matches the current brand.

This includes:
- `README.md`
- setup/env examples
- current design/spec/plan documents under `docs/`
- script comments and operator-facing output strings

It does not require renaming generated screenshots or unrelated binary artifacts.

## Risks / Trade-offs

- [Default DB rename makes the app look empty locally] -> Add compatibility logic for legacy `learnhub.db` before switching defaults.
- [Cookie rename logs users out] -> Accept a one-time re-login and make the new cookie name stable.
- [Overwriting homepage copy could drift into marketing language] -> Keep the hero grounded in concrete product actions: collect, search, understand.
- [Historical docs may lose context if rewritten too aggressively] -> Update branding references while preserving the technical substance and timeline of those documents.

## Migration Plan

1. Add the new Open NoteHub-aligned identity spec and homepage messaging spec.
2. Rename user-visible branding and metadata in the app shell, login screen, article metadata, and homepage.
3. Rename theme vocabulary and add legacy preference mapping.
4. Align project/runtime identifiers such as package metadata, env examples, compose defaults, cookie name, and DB defaults.
5. Add compatibility handling for legacy local databases.
6. Sweep docs/scripts for `LearnHub`/`learnhub` references and update them where they still describe the current product.
7. Verify by searching for leftover brand strings and by browser-checking the homepage, login page, and article metadata.

## Open Questions

- Whether the future import flow should eventually become a homepage secondary CTA once that feature exists. This change intentionally leaves room for it without introducing a dead action now.
