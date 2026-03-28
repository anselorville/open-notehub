## 1. Canonical identity alignment

- [x] 1.1 Rename user-visible brand strings in app metadata, login, reader chrome, and article metadata to `Open NoteHub`
- [x] 1.2 Rename project/runtime identifiers that still use `learnhub`, including package metadata, env defaults/examples, compose metadata, script/operator strings, and session cookie names
- [x] 1.3 Add compatibility handling so legacy local `learnhub.db` data remains accessible after default DB-path alignment

## 2. Homepage product messaging

- [x] 2.1 Rewrite the library homepage hero, supporting copy, and related labels so the page presents Open NoteHub as a product for collecting, searching, and understanding articles
- [x] 2.2 Keep search/browse as the primary homepage action while explicitly surfacing AI reading value in supporting content
- [x] 2.3 Remove theme-slogan language from the homepage so the first screen no longer reads like a visual style demo

## 3. Theme vocabulary alignment

- [x] 3.1 Replace theme labels and descriptions with product-oriented browsing mode language
- [x] 3.2 Rename internal theme IDs to semantic values and map legacy stored theme values forward
- [x] 3.3 Ensure the theme drawer clearly states that it only changes the library homepage/list presentation

## 4. Documentation and verification

- [x] 4.1 Update active repository docs and design/plan docs that still refer to the current product as LearnHub
- [x] 4.2 Search the repository for leftover `LearnHub` / `learnhub` references and resolve intentional exceptions explicitly
- [x] 4.3 Validate the renamed and rewritten surfaces with typecheck plus browser checks for homepage, login, and article metadata
