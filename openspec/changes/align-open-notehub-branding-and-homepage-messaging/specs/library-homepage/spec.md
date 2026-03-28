## ADDED Requirements

### Requirement: The library homepage SHALL lead with product value
The library homepage SHALL present Open NoteHub as a product for saving, searching, and understanding articles, rather than using visual-theme slogans as the page's primary message.

#### Scenario: Hero copy communicates the product
- **WHEN** a user lands on `/`
- **THEN** the hero headline focuses on collecting, searching, and understanding worthwhile articles
- **THEN** supporting copy explains the AI-reading value in concrete product terms
- **THEN** the homepage does not use theme-led slogans such as "留一点白，文章自己会发光" as the primary product message

#### Scenario: Search remains the primary homepage action
- **WHEN** a user views the homepage hero
- **THEN** the search/browse interaction remains immediately available
- **THEN** supporting content reinforces AI-assisted understanding without introducing a dead-end import action

### Requirement: Theme selection SHALL use product-oriented browsing language
The homepage theme selector SHALL describe browsing modes and their effect on the library view, instead of using purely aesthetic or poetic language as the main explanation.

#### Scenario: Theme drawer copy describes browsing behavior
- **WHEN** a user opens the library theme drawer
- **THEN** each option is labeled and described in product-oriented terms such as focused browsing or editorial scanning
- **THEN** the drawer clearly states that the theme only changes the library homepage/list presentation

#### Scenario: Legacy stored theme values continue to work
- **WHEN** a user previously stored a legacy theme value such as `airy` or `magazine`
- **THEN** the application maps that value to the equivalent new semantic browsing mode
- **THEN** the user's effective theme preference is preserved
