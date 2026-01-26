# Tasks: Glassmorphism Design System Enhancement

**Input**: Design documents from `/specs/001-glassmorphism-design/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: No formal tests requested. Visual verification via browser testing.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Project type**: Next.js App Router (monorepo at repository root)
- **CSS**: `app/globals.css`
- **Config**: `tailwind.config.ts`
- **Components**: `components/{ui,layout,sections,shared}/*.tsx`

---

## Phase 1: Setup (Foundation CSS)

**Purpose**: Update CSS variables and Tailwind configuration to Apple Liquid Glass palette

- [ ] T001 Update CSS color variables to Apple Liquid Glass palette (light mode) in app/globals.css
- [ ] T002 Update CSS color variables to Apple Liquid Glass palette (dark mode) in app/globals.css
- [ ] T003 [P] Update glass utility classes (.glass, .glass-subtle, .glass-bold) in app/globals.css
- [ ] T004 [P] Add backdrop-filter fallback styles with @supports in app/globals.css
- [ ] T005 [P] Add prefers-reduced-motion media query styles in app/globals.css
- [ ] T006 Remove gradient background decorations from body in app/globals.css
- [ ] T007 [P] Update Tailwind backdropBlur configuration in tailwind.config.ts
- [ ] T008 [P] Update Tailwind color tokens for glass utilities in tailwind.config.ts
- [ ] T009 Run npm run check:fix to verify CSS/config changes

**Checkpoint**: CSS foundation ready - component updates can begin

---

## Phase 2: User Story 1 - Visual Brand Impression (Priority: P1) 🎯 MVP

**Goal**: Visitors see premium glassmorphism on homepage cards and containers

**Independent Test**: Visit homepage, verify all cards display blur effects with semi-transparent backgrounds in both light and dark modes

### Implementation for User Story 1

- [ ] T010 [US1] Update Card component with glass classes in components/ui/card.tsx
- [ ] T011 [P] [US1] Update Header background (remove gradient, add glass-bold) in components/layout/Header.tsx
- [ ] T012 [P] [US1] Update Footer with glass styling in components/layout/Footer.tsx
- [ ] T013 [P] [US1] Update Skills section card styling in components/sections/Skills.tsx
- [ ] T014 [P] [US1] Update Projects section card styling in components/sections/Projects.tsx
- [ ] T015 [P] [US1] Update Blog section card styling in components/sections/Blog.tsx
- [ ] T016 [P] [US1] Update Certificates section styling in components/sections/Certificates.tsx
- [ ] T017 [P] [US1] Update ProjectCard component styling in components/ProjectCard.tsx
- [ ] T018 [P] [US1] Update BlogPostCard component styling in components/BlogPostCard.tsx
- [ ] T019 [US1] Verify glass effects in dark mode across all updated components
- [ ] T020 [US1] Run npm run build to verify no compilation errors

**Checkpoint**: User Story 1 complete - homepage displays consistent glassmorphism

---

## Phase 3: User Story 2 - Navigation Experience (Priority: P2)

**Goal**: Interactive elements (buttons, dropdowns) have glass styling with smooth hover transitions

**Independent Test**: Hover over buttons, open dropdowns, verify glass effects and 200-300ms transitions

### Implementation for User Story 2

- [ ] T021 [US2] Update Button component with glass-subtle variants in components/ui/button.tsx
- [ ] T022 [P] [US2] Update DropdownMenu with glass-bold styling in components/ui/dropdown-menu.tsx
- [ ] T023 [P] [US2] Update ThemeToggle button styling in components/shared/ThemeToggle.tsx
- [ ] T024 [P] [US2] Update LanguageSwitcher trigger and dropdown in components/LanguageSwitcher.tsx
- [ ] T025 [P] [US2] Update CVDownloadButton with glass accent styling in components/shared/CVDownloadButton.tsx
- [ ] T026 [US2] Verify hover transitions are 200-300ms across all interactive elements
- [ ] T027 [US2] Verify focus states show accent ring on all interactive elements

**Checkpoint**: User Story 2 complete - all interactive elements have glass styling

---

## Phase 4: User Story 3 - Content Readability (Priority: P2)

**Goal**: Text remains readable on glass backgrounds meeting WCAG AA standards

**Independent Test**: Check text contrast ratios meet 4.5:1 minimum on all glass backgrounds

### Implementation for User Story 3

- [ ] T028 [US3] Verify and adjust text colors for contrast in light mode glass backgrounds
- [ ] T029 [US3] Verify and adjust text colors for contrast in dark mode glass backgrounds
- [ ] T030 [P] [US3] Update muted/secondary text colors if contrast insufficient in app/globals.css
- [ ] T031 [P] [US3] Add subtle text-shadow to improve readability if needed (optional)
- [ ] T032 [US3] Manual contrast check using browser dev tools or accessibility tool

**Checkpoint**: User Story 3 complete - all text meets accessibility standards

---

## Phase 5: User Story 4 - Responsive Glass Effects (Priority: P3)

**Goal**: Glass effects work well on mobile/tablet with reduced-motion support

**Independent Test**: View site on mobile viewport and with prefers-reduced-motion enabled

### Implementation for User Story 4

- [ ] T033 [US4] Test glass effects on mobile viewport (375px width)
- [ ] T034 [P] [US4] Adjust glass opacity/blur for mobile if performance issues detected
- [ ] T035 [US4] Test glass effects on tablet viewport (768px width)
- [ ] T036 [US4] Verify prefers-reduced-motion removes all transitions
- [ ] T037 [US4] Test on Safari iOS for webkit-backdrop-filter support

**Checkpoint**: User Story 4 complete - responsive design verified

---

## Phase 6: Polish & Verification

**Purpose**: Final cleanup and cross-browser testing

- [ ] T038 [P] Run npm run check:fix for final lint/format
- [ ] T039 [P] Run npm run build to verify production build
- [ ] T040 Test complete flow in Chrome
- [ ] T041 [P] Test complete flow in Firefox
- [ ] T042 [P] Test complete flow in Safari
- [ ] T043 [P] Test complete flow in Edge
- [ ] T044 Verify theme toggle transition is smooth (no flicker)
- [ ] T045 Performance check: verify no significant CLS or LCP regression
- [ ] T046 Final visual review in both light and dark modes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - can start immediately
- **Phase 2 (US1)**: Depends on Phase 1 completion
- **Phase 3 (US2)**: Depends on Phase 1 completion (can run parallel to US1)
- **Phase 4 (US3)**: Should follow US1/US2 to verify actual component contrast
- **Phase 5 (US4)**: Should follow US1/US2 to test actual responsive behavior
- **Phase 6 (Polish)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Start after Phase 1 - Core visual foundation
- **User Story 2 (P2)**: Start after Phase 1 - Can run parallel to US1 (different files)
- **User Story 3 (P2)**: Best after US1/US2 - Requires actual glass backgrounds to test
- **User Story 4 (P3)**: Best after US1/US2 - Requires actual components to test responsively

### Parallel Opportunities

Phase 1:
```
T003 (glass utilities) | T004 (fallback) | T005 (reduced-motion)
T007 (tailwind blur) | T008 (tailwind colors)
```

Phase 2 (US1) - all section components in parallel:
```
T011 (Header) | T012 (Footer) | T013 (Skills) | T014 (Projects)
T015 (Blog) | T016 (Certificates) | T017 (ProjectCard) | T018 (BlogPostCard)
```

Phase 3 (US2) - all controls in parallel:
```
T022 (DropdownMenu) | T023 (ThemeToggle) | T024 (LanguageSwitcher) | T025 (CVDownloadButton)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup CSS foundation
2. Complete Phase 2: User Story 1 (cards, header, footer, sections)
3. **STOP and VALIDATE**: Verify glassmorphism looks correct
4. Can deploy MVP at this point

### Incremental Delivery

1. Phase 1 → CSS ready
2. Phase 2 (US1) → Core visual complete → **MVP deployable**
3. Phase 3 (US2) → Interactive elements polished
4. Phase 4 (US3) → Accessibility verified
5. Phase 5 (US4) → Responsive verified
6. Phase 6 → Cross-browser tested, production ready

---

## Notes

- [P] tasks = different files, no dependencies - can run simultaneously
- [Story] label tracks which user story the task belongs to
- This is a CSS-heavy feature - most "implementation" is className changes
- No backend changes required
- Test in browser after each component update
- Commit after each phase or logical group of tasks
