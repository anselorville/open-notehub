## ADDED Requirements

### Requirement: Canonical product identity SHALL be Open NoteHub
The application and its active project/runtime defaults SHALL use `Open NoteHub` / `open-notehub` as the canonical product identity. Descriptive phrases such as "开放式知识文库" MAY be used as descriptors, but SHALL NOT replace the brand name on canonical product surfaces.

#### Scenario: User-visible brand surfaces are aligned
- **WHEN** a user opens the login page, library homepage, reader chrome, or article page metadata
- **THEN** the canonical brand name displayed is `Open NoteHub`
- **THEN** no visible `LearnHub` label remains on those surfaces

#### Scenario: Project defaults are aligned
- **WHEN** a developer inspects package metadata, env examples/defaults, docker compose metadata, or operator-facing setup docs
- **THEN** the default identifiers use `Open NoteHub` / `open-notehub`
- **THEN** no current setup path tells the developer they are deploying or configuring `LearnHub`

### Requirement: Identity renames SHALL preserve access to existing local data
When default runtime identifiers are renamed for Open NoteHub alignment, the system SHALL preserve access to existing local data or provide a deterministic compatibility path instead of silently abandoning it.

#### Scenario: A legacy local database is present
- **WHEN** the runtime starts without an explicit `DATABASE_URL`
- **AND** `open-notehub.db` does not exist
- **AND** legacy `learnhub.db` does exist
- **THEN** the system continues using the legacy data or migrates it before normal startup proceeds
- **THEN** the user does not see an empty library solely because of the rename

#### Scenario: Session identity changes after cookie rename
- **WHEN** an existing `LearnHub` session cookie is no longer recognized after the identity alignment
- **THEN** the user MAY need to log in again
- **THEN** new sessions use the Open NoteHub-aligned cookie name
