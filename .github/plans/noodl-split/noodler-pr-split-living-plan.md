# NoodleR PR-Split — Living Plan

Authoritative repository plan as of 2026-07-23. Update the status table and merged list as
work lands. Historical slice numbers are retained where useful, but the order below
is the current intended order.

This Living Plan replaces the historical repository v2 plan. Kickoff prompts remain
self-contained; this file is the planning authority unless product direction
explicitly replaces it.

## Terminology — "private" is retired

Earlier slices called the NoodleR side of the split **private**. That word is gone from the
code and the UI as of the platform rename. It read as a real privacy or security guarantee to
users, and it collided with the genuine access concept one level down.

Historical slice descriptions below are left in their original wording; **new work must use the
current vocabulary**:

| Old | Current |
| --- | --- |
| `visibility: "public" \| "private"` | `platform: "noodle" \| "noodler"` |
| `publicAccountId` | `noodleAccountId` |
| "private account" / "private post" | "NoodleR account" / "NoodleR post" |
| `generatePrivatePost` / `noodlePrivate*` | `generateNoodlerPost` / `noodleNoodler*` — see `packages/server/src/services/noodle/noodle-noodler-*.ts` |
| `privatePostGuide` | `noodlerPostGuide` |
| `privateGenerationGuidance` | `noodlerGenerationGuidance` |

The one thing that keeps the word: post-level `access: "public" | "subscriber" | "ppv"`
(`noodler-access.ts`) is the actual paywall/visibility control and is deliberately unchanged.
`platform` says *which simulated app an account lives on*; `access` says *who may read a post*.

## Product charter

NoodleR is Marinara's standalone **18+ adult creator-platform simulation**, analogous
to how Noodle simulates Twitter-like social media. Its purpose is to give users a new,
exciting way to interact with their personas and characters through creator/stage
profiles, including exploring sides of those characters that their ordinary public
identity or conversation may not expose.

The product experience therefore needs both agency and life:

- users can create, play, guide, and control stage-profile creators;
- characters can sustain those profiles autonomously enough to feel active rather
  than like a static post generator;
- the user can experience the creator platform through profiles, feed content,
  access choices, interactions, and eventually audience response;
- stage identity/disclosure supports open alter egos and concealed sides while server
  policy prevents accidental identity leaks.
- Open profiles show their linked identity directly. Hinted profiles reveal the linked
  display name and handle only through a deliberate profile-badge hint while keeping
  exact identifiers out of generated content. Secret profiles expose no identity hint.

## Merged so far

| Slice | What | PR |
| --- | --- | --- |
| 1A | Typed settings + atomic patching (four subtrees: profile/social/scheduler/privacy; closed the raw-settings escape hatch) | #3744 |
| 1B | Private-account schema + isolation (unique `publicAccountId`, atomic creation) | #3751 |
| 2 | Client navigation shell + real containers (discriminated navigation state, `NoodleShell`) | #3759 |
| 3 | Public generation service seam (public generation extracted from routes) | #3782 |
| 4 | Private generation operation (`generatePrivatePost`, discriminated public/private request union) | #3795 |
| 5 | Stage identity + guided generation (open/hinted/secret disclosure and identity-leak protection) | #3830 |
| 6 | Subscriptions & access (subscriber posts, PPV unlocks, hidden-from, viewer-persona scoping) | #3856 |
| 6b | Shell/feed parity and private interactions (real component reuse, pink theming, merged feed, access-gated interactions, coin popover, mode toggle) | #3888 |
| 7 | Roleplay authoring and creator-profile parity (literal Post, optional Guide, titles, unified profiles, stage creation) | #3969 |

## Current status and intended order

| Order | Work | Status | Dependency |
| --- | --- | --- | --- |
| 0 | Slice 6b stabilization and browser proof | Integrated Playwright proof passed with a Guided-output coverage gap; bare staging proof not isolated | Merged 1A–6b |
| 1 | Slice 7 — roleplay authoring and creator-profile parity | Merged through #3969 | 4, 5, 6, 6b |
| 2 | Slice 8 — toggleable text-only automatic creator posting and control plane | **Release-candidate requirement** | 7 authoring operation and stabilization gate |
| 3 | Slice 8b — access-protected generated creator images | Local branch implements image generation on the manual Guide and automatic-post paths (NoodleR-owned enablement + single-image-per-post `imagesEnabled` policy on the autoPosting subtree), identity-protected image prompts, private-media namespace served through an access-checked endpoint, prompt-review lease path, and delete cleanup; `pnpm check` + `regression:noodle` pass; real-provider image smoke remains; not merged | 7 and 8 posting paths |
| 4 | Slice 9a — quiet synthetic fan engagement | Planned after auto-posting | 6, 6b, 8 |
| 5 | Slice 9c — persona-first named superfans and non-economic visible moments | Roleplay-first, compute-bounded follow-up | 9a |
| 6 | Slice 9d — opt-in real-character named fans | Planned later | 9c |
| 7 | Slice 9b — support points and visible economic events | Optional low-priority fun addition | 9a; defer if scope grows |
| 8 | Slice 9e — named-fan profiles and access-filtered history | Ambient identity follow-up | 9c; extended by 9d |
| 9 | Slice 10 — composer media parity | Implemented in draft PR #3981; automated gate passed, manual UI proof pending | 6b, 7 authoring UI |
| 10 | Slice 11 — cross-mode integration | Blocked on product contract | manual/automatic posting paths |
| 11 | Slice 12 — creator projects/milestones | Last | Explicit prerequisites to be defined |

## Product and UX principles

- Optimize for fun and roleplay payoff before simulation realism. A realistic system
  does not earn scope unless it makes the experience more enjoyable or controllable.
- A character-backed creator is still the user's real character behind a stage
  identity—an alter ego that may be open or concealed—not an unrelated synthetic
  actor. Keep source identity and stage presentation separate in data and policy.
- Ship sensible defaults so NoodleR works without configuration. Put optional
  switches, dials, and overrides behind the global/per-creator control plane for
  advanced users; define precedence before adding each override.
- Treat desktop and mobile as required surfaces, not separate follow-up products.
- Preserve multiple roleplay entry points without duplicating capability logic:
  creator-profile authoring in Slice 7, autonomous creator activity in Slice 8, and
  later chat/cross-mode bridges in Slice 11 all call typed application operations.

## Functional foundation — already merged, not a release candidate

Slices 1A–6b already form a functional AI-guided NoodleR product:

1. Enable NoodleR.
2. Create a stage profile from an eligible persona or character.
3. Manually trigger a generated private post as any managed stage profile through
   the existing inline guided composer/profile selector.
4. Choose public, subscriber, or PPV access.
5. View the merged private feed as a selected viewer persona.
6. Subscribe, unlock, like, reply, and repost under server-side access rules.

This is a useful guided foundation, but it does not meet the agreed release threshold.
A release candidate must support roleplay autonomy: at minimum, required Slice 7's
authoring/profile shape plus toggleable per-character automatic posting and a user-
approved way to guide and control the experience in Slice 8.

### Stabilization gate — NEXT

No speculative product work belongs in this gate. Use the current merged behavior
and fix only reproduced blockers.

Required proof:

- Enable/disable NoodleR and confirm disabled routes/surfaces stay hidden.
- Create, edit, and delete a stage profile.
- Generate a public, subscriber, and PPV post from the existing guided composer.
- Switch viewer personas and verify hidden/subscriber/PPV access.
- Subscribe, unlock, like, reply, and repost; reload and confirm persisted results.
- Exercise desktop and mobile layouts, themes, loading, empty, disabled, and
  actionable error states.
- Confirm hinted/secret generated content and prompt data do not expose the linked
  public name/handle.

**Proof receipt (2026-07-23):** seeded desktop and mobile Playwright Chromium runs
passed on `noodl-split-7-roleplay-authoring` at `b2b9adc6`. They covered disabled
route/surface hiding; stage-profile create/edit/delete; public/subscriber/PPV guided
generation; viewer switching and hidden/subscriber/PPV access; subscribe, unlock,
like, reply, repost, and reload persistence; loading, empty, disabled, forced-error
retry, dark/light themes, and responsive bounds. A local OpenAI-compatible stub drove
the real server generation path, verified that hinted/secret provider requests did
not contain the linked public name/handle, deliberately returned those identifiers,
and confirmed stored title/body/image-prompt output removed them. Screenshots were
inspected after animations settled. No functional blocker was reproduced. Temporary
specs, data, screenshots, traces, and the local server were removed.

This is integrated branch proof, not an isolated run of bare `origin/staging`.
Therefore it strengthens Slice 7 readiness but does not, by itself, close the
historical claim that 6b alone passed before Slice 7 was applied. A real external
provider smoke remains separate from the deterministic local-provider proof.

**Follow-up gap (2026-07-23):** the proof exercised identity redaction with a
non-null `imagePrompt`, while its stub returned `poll: null`. It therefore did not
assert Slice 7's text-only output constraint. A real Guided run subsequently
reproduced one composite post containing a title, body, poll, and image prompt.
Static tracing confirms that the inherited private generator asks for, validates,
persists, and displays those fields together. This does not invalidate the access,
persistence, responsive-layout, or identity-redaction results above, but it blocks
Slice 7 readiness until the output policy conforms to the slice boundary. A local
correction now requests only title/body and defensively persists neither poll nor
image-prompt output; server typechecking and build pass, while provider/browser
regression proof remains required.

Passing this gate proves the merged foundation and unblocks Slice 7. It does **not**
make 6b a release candidate.

## Release-candidate definition

NoodleR reaches release-candidate status only after all of the following are true:

1. The 6b stabilization/browser/reload proof passes.
2. Required Slice 7 roleplay authoring and creator-profile parity land.
3. Slice 8 provides text-only automatic posting that is independently toggleable per
   stage profile and safe to stop globally.
4. The user can guide and control autonomous behavior through an explicitly accepted
   control plane.

The currently specified minimum control-plane proposal is:

- existing global `enableNoodler` product kill switch;
- a dedicated NoodleR section in application settings for NoodleR-wide automation
  controls and defaults;
- a global automatic-schedule on/off control, rather than a separately named
  “pause all” feature;
- a global **Refresh NoodleR now** action over automation-enabled creators;
- per-stage-profile automatic-posting enable/disable;
- per-stage-profile Low/Medium/High cadence;
- next-run status and schedule editing/rescheduling;
- editable stage profile identity/personality as durable generation guidance;
- Slice 7's optional one-shot guide for user-triggered posts.

Creator-specific controls live on that creator's stage-profile page. Later fan
controls extend the same two-level information architecture: NoodleR-wide controls in
Settings and creator-specific controls on the creator page. They still use separate
typed capability leaves and server-owned timestamps; shared UI placement does not
permit one raw settings object or one shared schedule.

Automatic posts default to `subscriber` access: in the current no-currency product,
this is the follow/subscribe-to-see path. Slice 8 does not automatically create PPV
posts or add currency.

There is no separate quiet-hours field. Users control timing through the NoodleR
schedule and can reschedule planned/next runs, following Noodle's existing schedule
UX within the per-creator `nextRunAt` model.

“Automatic-post creative brief” would mean persistent per-creator instructions used
only for scheduled posts, for example “focus on backstage updates; avoid spoilers.”
This is distinct from stage identity/personality and from Slice 7's one-shot guide.
It would also differ from a project: a project ends after its configured post count,
while this text would affect every future automatic post until edited or cleared.
Product direction rejected this extra layer. Do not add it. Stage identity/personality owns
durable character direction, Guide owns one post, and Project owns the next bounded
sequence of posts.

## Authoring terminology

“Manual” can describe three different behaviors:

- **The user manually triggers AI generation from direction text.** This already
  exists on merged staging.
- **The user triggers AI generation without a guide.** The server contract already
  permits an omitted `privatePostGuide`, but the merged composer currently requires
  non-empty direction text. Slice 7 must expose this as the normal unguided path and
  make guidance optional.
- **The user's literal text is published without an LLM.** This does not exist on
  staging or on the reference `noodl-split-7-post-as-character` branch. Product
  direction explicitly selected this behavior for Slice 7: **Post** publishes the draft literally, while
  **Guide** sends the current draft through the existing private generation pipeline.

Literal authoring therefore lands in Slice 7 through a strict private-post input,
stage-profile author scope, existing access choices, one server operation, and one
client mutation. It does not need images, scheduling, fan activity, or a separate
generation path.

## Disposition of current unmerged branches

### Reference post-as branch — discard as one integration unit

`origin/noodl-split-7-post-as-character` bundles a large profile-page expansion, a
small per-profile guided-composer placement, private generated images, a public-profile
onboarding shortcut, cache/author-selection fixes, and removal of
`GuidedPostModal`.

Do not merge the branch as one integration unit. Rebuild the required Slice 7
behavior from fresh `origin/staging`, preserving the merged access and generation
contracts:

- Every managed stage profile needs a Noodle-parity creator profile page.
- Every stage-profile page needs an unobtrusive collapsed composer so any managed
  creator can be roleplayed directly from their page.
- Normal generation does not require direction text. **Guide** is an explicit button
  that uses the current composer draft. **Post** publishes the draft literally.
- Add an optional title to NoodleR posts end to end. A blank title is absent; unlocked
  posts display it above the body, while locked subscriber/PPV projections hide it
  with the body so it cannot leak protected content.
- Remove the main-timeline stage-profile picker. Its author is the stage profile
  linked to the currently selected Noodle persona; never silently fall back to the
  first managed stage profile.
- Add an unobtrusive create-stage-profile action to eligible public Noodle profiles
  when NoodleR is enabled. This may be a later Slice 7 follow-up, but is not optional.
- Reproduce and fix cache issues independently if they exist on staging.
- Keep image generation/selection, user attachments, polls, and modal deletion
  outside the required core. Product direction confirmed those media capabilities come
  later.

### Local fan-activity branch — park as prior art

Do not merge the current fan branch merely because it is implemented and validated.
It is a high-complexity automation tranche, not an MVP prerequisite, and its global
public-random-user actor model conflicts with the revised per-creator synthetic-fan
direction.

Retain it only as evidence for access rechecks, bounded model output, transactional
generated-audience commands, cadence/claim behavior, account locking, and shutdown.
Reassess or reimplement after fan identity and economics are approved.

## Slice 7 — Roleplay authoring and creator-profile parity

**Goal:** every managed creator has a real profile and can be roleplayed from that
profile through literal posting or optional AI guidance. Main-timeline authorship
follows the user's selected persona instead of a second local picker.

**Depends on:** merged Slices 4, 5, 6, and 6b plus the stabilization proof. The old fan
branch is unrelated prior art. The reference branch is behavior reference only.

**Current implementation status (2026-07-23):** implemented on branch
`noodl-split-7-roleplay-authoring`; not yet merged. The current local diff adds the
title/body-only Guided correction and the unified creator-profile layout described
below. Shared/server/client focused lint or type checks, the client production build,
`regression:noodle`, and `regression:prompt` pass. Seeded desktop/mobile Playwright
verification passes for the unified layout and subscriber-list contract. The earlier
provider/browser coverage gap for a real Guided request remains: a successful
real-external-provider title/body-only generation smoke and human usability pass are
still required before readiness is claimed.

**Unified-profile proof receipt (2026-07-23):** a seeded Playwright Chromium pass
opened a managed profile as its linked persona and as a different viewer persona.
It confirmed one profile/feed surface; the decorative fallback banner; coexisting
Subscribe, Edit Profile, Access, and Delete controls; the collapsed per-profile
composer above Posts/Media/Subscribers; subscriber empty and populated states; and
desktop/mobile responsive bounds with no horizontal overflow. A subscribe action
updated the count and list immediately, survived a page reload through the new
subscriber endpoint, and was then undone so seeded state was restored. The Access
dialog opened without changing policy. The mobile empty-state spacing was tightened
after visual inspection so its primary message clears the fixed bottom navigation.
No temporary browser artifacts remain.

### Commit 1 — Private post contracts, operations, and deterministic author identity

- Put connection resolution, per-stage-profile operation locking, and
  `generatePrivatePost()` behind one typed application operation used by every
  authoring entry point. Preserve Slice 6 access/interaction policy; authoring does
  not grant viewing or interaction access.
- Add a separate typed manual-private-post command. **Post** stores the normalized
  optional title and body literally with `source: "manual"`; it never disguises user
  text as `privatePostGuide` or invokes the provider.
- Treat `privatePostGuide` as optional end to end. Omit it for unguided generation;
  do not send an empty-string pseudo-guide or create a parallel generation path.
- Add `title: string | null` as a first-class private-post field across storage,
  shared post/view DTOs, generated private-post output, private create/update
  validation, and post-card presentation. Keep public Noodle create/update inputs
  unchanged; public posts have no title.
- **Guide** submits the current title/body draft as one-shot guidance through the
  generated-post operation and persists the generated optional title/body result.
  Apply disclosure/identity protection to both generated title and body.
- If Guide is invoked with no title/body direction, omit `privatePostGuide` and perform
  ordinary unguided generation; never send an empty-string pseudo-guide.
- Normalize a whitespace-only title to `null` and use one shared bounded title limit.
  Legacy rows project `null`. Locked subscriber/PPV views return `title: null`.
- Remove the main-timeline stage-profile picker.
- Resolve main-timeline author identity as:
  selected Noodle persona -> its public Noodle account -> the stage profile whose
  `publicAccountId` links to that account.
- If the selected persona has no linked stage profile, never fall back to another
  creator. Show a disabled/empty authoring state with a route into stage-profile
  creation; preserve the selected viewer persona.
- In the shared sidebar persona picker, show an accessible NoodleR badge for personas
  that have a linked stage profile. The badge is a visibility affordance, not a
  second author picker or a fallback-author rule.

### Commit 2 — Noodle-parity stage-profile page and per-profile composer

- Add a navigable creator-profile view for every managed stage profile, including
  character-backed profiles. Reuse Noodle's real profile, post-card, composer-shell,
  and responsive primitives; do not build a parallel approximation.
- Show that creator's profile information and posts using private projections and
  existing access filtering.
- Add a collapsed, unobtrusive composer on the page. It always authors as the viewed
  managed stage profile and expands to the full NoodleR composer.
- Use one unified profile surface, not separate viewer and management modes. The
  selected viewer persona still determines subscribe, unlock, like, reply, repost,
  and access-filtered post presentation, while human-controller actions for the
  managed creator coexist visibly in the same header and post list.
- Show Subscribe/Subscribed for the selected viewer alongside Edit Profile, Access,
  and Delete for the human-controlled creator. Keep the axes distinct in behavior
  even though they share one page: creator controls must not grant the selected
  viewer access or interaction rights.
- Render one post list only. Accessible posts may expose both viewer interactions
  and creator edit/delete actions. Inaccessible posts remain locked for the selected
  viewer, while an explicit controller edit/delete action may reveal the owned
  content only inside that management action. Do not duplicate the feed or render an
  unexplained “Creator controls” accordion.
- Keep the selected persona's linked stage profile reachable through the shared
  Profile navigation even though self-interaction rules exclude that creator from
  the viewer feed. When the feed has no other visible creators, link its empty state
  directly to the owned profile instead of implying that the profile disappeared.
- Keep the collapsed “Post as this creator” composer directly below the profile
  header. The collapsed row is text-first without an avatar; the expanded composer
  retains the creator avatar, optional title, and body, with its collapse control in
  the top-left header and a clearly icon-labeled Post action. It always targets the
  viewed stage profile without changing the selected viewer persona.
- Use Posts, Media, and Subscribers tabs. Subscribers shows the current subscriber
  count and opens the subscriber list; no additional audience-privacy model is
  required for this slice.
- Give the profile header a plain solid-color fallback banner now. Persisted
  user-selected cover media is desired but belongs with later media/upload plumbing.
- Treat reference/mockup post authors and content as illustrative only; a creator
  profile lists that creator's posts, not unrelated mockup authors.
- Default to generation without forcing a separate guided mode. Guidance is an
  explicit button/action that uses the composer's current draft as input; it is not a
  required gate before every post. Existing access/PPV controls remain available.
- The composer exposes optional **Title** and body fields. **Post** publishes both
  literally; **Guide** transforms the current draft through the private generator.
  Labels, loading state, and failure copy must keep those outcomes unambiguous.
- Image generation/selection, user attachments, and polls belong to later slices.
  Their parity icons may remain visibly disabled before the capabilities land, but
  must not activate existing backend scaffolding or silently generate output.

### Commit 3 — Create from an eligible public Noodle profile

- When NoodleR is enabled and the public persona/character has no linked stage
  profile, show a small, unobtrusive create-stage-profile action on its Noodle profile.
- Route into the existing typed creation flow with the source account preselected.
- Hide or replace the action when a stage profile already exists; never create a
  second private account for the same `publicAccountId`.
- This commit may land as a later Slice 7 follow-up, but the capability is required
  and remains tracked until merged.

### Slice 7 proof and non-scope

- Prove selected-persona author resolution, linked-profile badge state, no-profile
  behavior, every managed stage-profile page, literal Post and optional Guide,
  optional title create/edit/remove/display, access choices, failure draft retention,
  cache invalidation, reload persistence, mobile layout, and identity-leak protection.
- Prove locked subscriber/PPV posts hide both title and body, public Noodle APIs do
  not accept titles, and legacy/titleless posts remain valid.
- Confirm authoring as a profile does not bypass hidden/subscriber/PPV/self-action
  rules for the selected viewer persona.
- Do not add automatic posting, fan activity, image generation/selection, user
  attachments, or polls.
- **Provisional output contract pending maintainer confirmation:** title and body are
  the default core of every generated post. Poll and generated-image output are
  optional enrichments and must be explicitly enabled for that individual Guide
  request; absent an enabled request capability, both outputs must be `null` and
  must not be persisted. Do not introduce persistent defaults or infer whether these
  request-scoped toggles land in Slice 7 until the maintainer confirms their timing.
- **Reproduced blocker and local remedy (2026-07-23):** the inherited private-generation contract
  currently permits a single Guided post to contain title, body, poll, and image
  prompt together without explicit selection. The minimum safe correction is to
  generate title/body only by default and suppress poll/image output unless the
  request explicitly opts into those capabilities. The current local fix narrows
  both the prompt and strict response format to title/body and writes `imagePrompt:
  null` with empty metadata even if a non-strict provider returns extra fields.

## Slice 8 — Text-only automatic creator posting

**Goal:** make characters autonomously produce content while Marinara is running,
with per-character toggles and an accepted user control plane, using the same private-
generation pipeline as user-triggered posts.

**Depends on:** the merged Slice 7 creator-post application operation plus the
stabilization gate. It does not depend on the discarded reference-branch implementation
or on fan activity.

### Service boundary

The route currently owns connection resolution and per-account in-flight
coordination around `generatePrivatePost()`. In a behavior-preserving first commit,
move that orchestration behind one typed private creator-post application operation:

- HTTP guided generation and the scheduler call the same operation directly.
- Keep `generatePrivatePost()` as the capability-owned generation core.
- Schedulers never import routes or call `app.inject()`.
- Use one in-process operation lock per private account. Different creators remain
  independently runnable.
- Revalidate mutable stage/disclosure policy after provider work before persistence.

This is the extension seam later projects/chat commands may call; do not prebuild
those features.

### Settings and scheduling contract

Use one per-account model:

```ts
interface NoodleAutoPostingSettings {
  enabled: boolean;
  intensity: 1 | 3 | 6;
  nextRunAt: string | null;
}

interface NoodleAccountSchedulerSettings {
  autoPosting?: NoodleAutoPostingSettings;
}
```

- Default projection: disabled, intensity 1, `nextRunAt: null`.
- `nextRunAt` is server-owned and excluded from client-editable patches.
- `enableNoodler` is sufficient as the global feature kill switch. Do not add a
  competing global posts-per-day schedule or `lastAutomaticPostAt`.
- The NoodleR Settings schedule toggle may disable automatic posting globally without
  disabling the NoodleR product. This is the schedule's enabled state, not a second
  “pause all” concept.
- Intensity means at most 1/3/6 automatic posts per day for that profile.
- Enabling or changing intensity clears `nextRunAt` transactionally; the scheduler
  seeds a future first run.
- Claim a due run by advancing `nextRunAt` before provider work.
- After downtime, run at most once; never replay every missed interval.
- Expected skips/provider failures move to a bounded future cadence and cannot
  hot-loop.
- Shutdown clears timers and awaits the active poll before storage closes.

The first automatic-post slice is text-only. Scheduler and any confirmed manual-
refresh posts use `subscriber` access by default. Do not generate automatic PPV posts
or add a currency/access-default settings system in this slice.

### UI and proof

- Add a dedicated NoodleR section to application Settings for the global kill switch
  and approved global automation controls, including automatic schedule on/off and
  the confirmed Generate/Refresh-now scope.
- Put per-profile automatic-posting toggle, Low/Medium/High intensity, and next-run
  status on that creator's Slice 7 profile page rather than hiding them only in the
  profile manager.
- Let the user inspect and reschedule that creator's next planned run. Do not add a
  separate quiet-hours setting when the schedule itself provides timing control.
- Define and prove automation precedence before adding a global default plus creator
  override. The global kill switch always wins; do not infer whether other automatic-
  posting fields are defaults, hard limits, or bulk actions.
- Make it plain which editable stage-profile fields guide every automatic post. Do
  not imply that Slice 7's one-shot guide controls future scheduled posts.
- Slice 7's per-creator composer already supplies single-creator generate-now. Slice
  8 adds a global **Refresh NoodleR now** over automation-enabled creators. Prioritize
  creators scheduled in the near future, then process the remaining enabled creators.
  Call the same creator-post operation with bounded concurrency and per-creator typed
  outcomes; one creator's failure must not roll back successful creators.
- Each successful selected creator contributes one visible feed action/post so the
  manual refresh rewards the user immediately.
- A successful manual refresh consumes a creator's near-future scheduled slot and
  advances `nextRunAt` using that creator's configured cadence/schedule policy. Keep
  the spirit of an explicitly set schedule rather than resetting to an unrelated
  default or allowing an immediate duplicate automatic post.
- Enabling autopost without a user-chosen schedule uses a sensible randomized default
  cadence. It is not a second scheduler mode. Exact jitter/distribution is an
  implementation choice bounded by the selected intensity and anti-burst rules.
- Preserve mobile layout, themes, loading/disabled states, and actionable errors.
- Prove strict schema/default normalization and atomic config/timestamp updates.
- Use a temporary controlled-clock/provider proof for future first run, 1/3/6
  cadence, claim-before-generation, no catch-up burst, simultaneous polls, same-
  account exclusion, different-account independence, provider failure, and shutdown.
- Remove temporary proof artifacts before handoff.

**Explicit non-scope:** private images, user uploads, polls, fan actions, named fans,
support points/events, active/passive posting policy, automatic PPV, a separate
automatic-post creative brief, cross-mode publication, projects, and new profile/
navigation destinations.

## Slice 8b — Access-protected generated creator images

**Goal:** add LLM-generated images to the established manual Guide and automatic-post
paths without mixing in user uploads or polls.

Follow public Noodle's proven orchestration shape rather than inventing another media
pipeline:

1. The private text generator proposes the existing optional `imagePrompt` alongside
   the post. Do not make a second text-model call just to decide whether to draw.
2. Apply NoodleR-owned enablement and a bounded per-run quota before image-provider
   work. Reuse the shared default image connection, image defaults, prompt compiler,
   retry helper, prompt-review setting, and reference-image mechanics; do not read
   public Noodle's enable flag or quota as NoodleR policy.
3. Compile the final image prompt from the private draft, stage-profile presentation,
   and permitted appearance references. Open/hinted/secret identity protection applies
   to image prompts and reference selection, not only post text.
4. Stage generated bytes before persistence. Revalidate creator/profile state, promote
   and commit media metadata with the post, and compensate staged files on failure.
5. If prompt review is enabled, persist a private pending prompt, claim it with the
   same renewable-lease pattern as public Noodle, and finalize it exactly once.
6. Image-provider failure leaves a valid text post with bounded failure metadata; it
   does not fail or retry the entire creator refresh indefinitely.

Private storage is the deliberate difference from public Noodle. Store generated files
in a NoodleR-owned private-media namespace and serve them through an access-checked
post-media endpoint. Never place secret/subscriber/PPV output in the public Noodle
gallery or a generally readable character gallery. Locked projections expose neither
the image URL nor prompt. Deleting a post/profile must clean up owned private media.

This slice enables the approved **image** output choice only when the full path above
exists. It does not add image upload, gallery attachment, polls, or a second posting
operation. Slice 10 still owns user-uploaded media and polls.

## Slice 9a — Quiet synthetic fan engagement

**Goal:** make existing creator content receive access-valid synthetic engagement
without bundling economics, moments, or real-character identity sourcing.

**Depends on:** Slices 6/6b and preferably Slice 8 so creator content exists.

- Synthetic fans are scoped to a creator and do not borrow real character state.
- Start with routine likes/replies/reposts against posts the synthetic actor may
  actually view. Subscriber/PPV content remains unavailable until the later economic
  slice grants access.
- One LLM call may propose engagement; deterministic quotas, target validation,
  deduplication, and anti-spam guards apply afterward.
- Access gating occurs before prompt target selection and again transactionally
  before persistence.
- Introduce a fan-identity provider seam even if the first provider only supplies
  synthetic identities.
- Routine reactions appear quietly on posts. No viral/big-spender moment layer.
- Use dedicated generated-audience commands; never widen persona-facing interaction,
  subscribe, or unlock APIs to arbitrary generated actors.
- Extend the established control-plane surfaces: NoodleR-wide fan controls belong in
  the NoodleR Settings section, while creator-specific fan controls belong on that
  creator's profile page.
- Global fan settings provide defaults and creator pages may override them. Include a
  configurable audience-archetype mix rather than assuming one generic fan mass:
  ordinary fans, eccentric fans, cross-fandom visitors, raiders, organic discovery,
  and audiences suited to non-adult/free-resource creators are approved directions.
  Exact labels, weights, and schema remain Slice 9 implementation design. Do not reuse
  auto-post settings, timestamps, or enablement merely because the controls share
  screens.

Fan activity may reuse Slice 8's scheduler infrastructure and pure cadence helper,
but it owns a separate `scheduler.fanActivity` leaf, `nextRunAt`, transactional claim,
service, retry behavior, and enable/disable state. One shared timestamp would couple
independent capabilities and is prohibited.

## Slice 9c — Named superfans and visible moments

Add persistent named synthetic superfans with personality/relationship continuity,
then visible non-economic moments such as a recurring fan becoming a superfan or a
post receiving an unusual burst of attention. Keep this above the quiet engine and
fan-identity provider rather than mixing it into baseline target/access logic.

This is persona-first, not one expensive named-fan simulation per character-backed
creator. Default 9c eligibility means a stage profile linked through `publicAccountId`
to a public Noodle account of kind `persona`. Character-backed stage profiles still
receive the cheaper access-valid quiet activity from 9a.

Compute rules:

- Generate a named synthetic superfan once, persist it, and reuse its identity/
  personality; do not regenerate the fan on every activity tick.
- Derive ordinary visible moments deterministically from persisted engagement where
  possible. Do not make one LLM call per creator merely to decide whether a moment
  appears.
- Apply a global/per-tick quota before any optional LLM work.
- Keep 9a engagement batching bounded; neither 9a nor 9c scales provider calls
  linearly with every character in the library.

One presentation decision remains. Normal likes/replies/reposts stay quiet. A **fan
moment** is an extra prominent story event, such as recurring Mina becoming a superfan
or one post receiving an unusual burst of attention. Before 9c implementation, decide:

- which moments ship first;
- whether they appear as a compact feed card, creator-profile activity item, or both;
- the deterministic activity threshold that triggers each one.

Recommended smallest answer: **Superfan formed** and **Post taking off**, shown as
compact feed and creator-profile activity cards. Let implementation choose conservative
deterministic starting thresholds and tune them later from actual behavior, rather than
adding threshold sliders.

Selected character-backed creators may opt into 9c through an explicit per-creator
setting. The setting is off by default; persona-backed creators remain the default 9c
eligible group. This is creator eligibility only and does not change fan identity
sourcing.

This slice deliberately precedes economics so roleplay payoff can be tested without a
ledger. Big-spender, paid-unlock, and earnings moments remain Slice 9b scope.

## Slice 9d — Opt-in real-character named fans

Swap the named-superfan provider to optionally borrow approved character identity:

- Opt-in per character.
- Read-only name/avatar/persona flavor.
- No writeback into character chat, memory, relationship, or state.
- Subscribing/unlocking as a fan never mutates the borrowed character.

Depends on the synthetic named-superfan engine being proven first.

9c creator eligibility and 9d fan identity sourcing are separate axes. A persona-
backed creator can have a synthetic or later real-character fan; opting a real
character into being a fan does not make every character-backed creator eligible for
9c processing.

## Slice 9e — Named-fan profiles and access-filtered history

Durable faux profiles belong only to actors whose identity continuity matters:

- persistent synthetic named superfans from 9c;
- opted-in borrowed real-character named fans from 9d; and
- any later ambient fan explicitly promoted into the named-superfan layer.

A named-fan profile contains its stable display name/handle, deterministic local avatar
or approved borrowed avatar, short persona/relationship bio, creator-scoped “following
since” date, and visible activity with that creator. Do not spend an image-provider call
on every fan avatar. Public history reuses existing access-filtered post/interaction
projections: show replies, reposts, visible moments, and support events only when the
current viewer may see their targets. Never reveal a locked post's title, body, image,
prompt, or existence through profile history.

The ordinary anonymous fan mass receives no account row, clickable route, follower
graph, or cross-post identity. Represent it through aggregate counts and compact
ambient phrases such as “24 people liked this.” When an anonymous generated reply must
show an author, persist an event-local display snapshot and deterministic placeholder
avatar with that interaction so reloads remain stable, but do not turn it into a fan
profile. This is ambience, not another social network.

Reuse shared profile/post presentation and the fan-identity provider. Do not create a
third post model or allow a fan profile to bypass creator/viewer access policy.

## Slice 9b — Support points and visible economic events

**Status:** accepted as a low-priority fun addition, not a release requirement. Defer
it if the scope grows materially.

Treat “Coins or Points” as a score for now, not currency:

- no spendable balance, transfer ledger, reversal system, or cash-like claims;
- no subscription tiers;
- support/economic events are available across creator profiles, not only persona-
  backed creators;
- events are visible to all viewers of the creator profile;
- points and events are persisted/idempotent so reloads or retries do not double-count
  them.

Keep the first version to two idempotent state-transition events:

- **Joined the inner circle**: the fan successfully subscribes for the first time;
  add **10 support points**.
- **Unlocked a post**: the fan successfully unlocks one previously locked post; add
  **5 support points** once for that fan/post pair.

The wording may adapt to the creator's theme, but the stored event kinds and weights
remain stable. Do not add tips, renewals, tiers, balances, transfers, spending, or
exchange-rate semantics merely to make the score look economic.

### Roleplay example

1. A creator posts a subscriber-only backstage entry.
2. A recurring synthetic superfan, Mina, chooses to subscribe. Every viewer of the
   creator profile can see a small in-world event: “Mina joined the inner circle.”
3. That access lets Mina read the entry and leave an in-character reply that continues
   her established relationship with the creator.
4. A later support/unlock event adds to the creator's points score and appears in the
   public profile activity.

The fun is visible support, recognition, relationship progress, and changed access;
the score is feedback rather than spendable money. Events may use named or anonymous
synthetic fans, so 9b does not require 9c identity continuity merely to record support.

Access-changing actions must commit before later interactions in the same generated
batch and all targets must be revalidated transactionally.

## Slice 10 — Composer media parity

Implementation status: draft PR #3981 contains the complete code and documentation
path. `pnpm check`, the Noodle regression suite, the installer-artifact guard, and a
focused upload/access/persistence/deletion proof pass. Final browser and usability
verification remains manual.

Add one user-uploaded image and one optional two-to-four-option poll through real
schema, private storage, mutation, projection, voting, and cleanup plumbing. Enable
the existing disabled composer controls only after those paths work. The title remains
optional; an image or poll may stand alone without a body. A user may deliberately add
either attachment or both to one post.

Literal **Post** publishes the user's title, body, image, poll, access, and PPV values.
**Guide** may change title/body text only and must preserve the selected image, poll,
access level, and PPV price. The private text model remains title/body-only; this slice
must not re-enable generated image prompts or generated polls.

Uploaded bytes use Slice 8b's post-owned NoodleR private-media namespace, never the
public Noodle/global gallery. A draft keeps its local file or source URL in the client;
the Post, Guide, or edit request promotes the bytes and persists the post's serving URL
and `metadata.privateMediaPath` together. Replacement promotes the new file before the
post update, removes the old file only after that update succeeds, and compensates the
new file on failure. This deliberately avoids a second unattached-asset table, claim
lifecycle, and stale-draft cleanup job. Locked projections expose neither image URLs
nor poll metadata. Media delivery repeats the viewer access check, and poll voting
uses the existing viewer-persona access and creator self-interaction gates.

User-uploaded media remains distinct from Slice 8b's LLM-generated private images at
the authoring boundary, while sharing its post-owned storage and serving contract.
Slice 10 does not reopen Slice 8b's generation, disclosure, or prompt-review contract.

## Slice 11 — Cross-mode integration

Global persona, slash commands, and roleplay/chat posting may create NoodleR posts
through the typed private-post operation. NoodleR posts never mirror, leak, or appear
on the public Noodle timeline. A NoodleR post with `access: "public"` means free to view
inside NoodleR; it does not become a public-Noodle post.

The controller can explicitly choose Free/Public for an individual manual, Guided, or
project-planned NoodleR post through the existing access input. Automatic posts remain
subscriber by default and must not silently widen access. If public-Noodle posting is
ever desired, it is a separate explicit action through Noodle's own posting operation,
with no shared post identity or automatic mirroring.

Before kickoff, approve the remaining cross-mode contract:

- source actor and mode;
- identity/disclosure/access behavior;
- manual versus command-triggered origin;
- idempotency and failure behavior;
- affected query keys and navigation surfaces.

Implement cross-mode behavior in an explicit bridge service that depends on typed
public/private operations. Do not hide it inside either generation service.

Character-backed stage profiles may later opt into context from their source character
through two independent settings in that creator's profile editor: **Use character
lorebook for post ideas** and **Use character schedule for post ideas**. Both are off
by default, only appear for linked character-backed creators, and read the enabled
source live when generation begins. Explain beside the toggles that NoodleR reads the
current source context without copying it or writing back to the character.

Keep this behind one context-provider/adapter boundary, not direct reads scattered
through generation. Lorebook and schedule context are supplementary; stage-profile
identity/personality and an explicit one-shot Guide are more specific instructions,
while safety and access policy always win. A source-character schedule guides content
only—what the character may be doing—not publication timing. Slice 8's per-creator
`nextRunAt` remains the sole timing authority. Do not add a global enable-all toggle.

## Slice 12 — Creator projects and milestones

Keep last. A project is one creator's bounded, editable content arc—not another posting
scheduler. The first version supports one active project per creator plus drafts and
archives. It stores a name, user-editable brief/behavior guidance, target generated-post
count from 1–20 (default 5), remaining count, status (`draft`, `active`, `paused`,
`completed`, `archived`), and an optional editable list of planned post beats.

For example, activating **Bunnies and Books** for five posts makes the next five
successful generated posts for that creator follow the brief or consume the next
planned beat. The user can edit the brief/beats, change the remaining count, pause,
resume, or end the project. A failed/skipped generation does not consume a beat. A
literal manual post does not consume the project unless the controller explicitly
attaches it to the project.

Slice 8's per-creator scheduler remains the only publication clock. An active project
supplies content context to the same generated private-post operation when that
creator's normal automatic slot or explicit Guide runs; it owns no `nextRunAt`, polling
loop, or route self-call. When the source-character schedule-context toggle is enabled,
the current schedule may inform what a project post depicts, but never when it is
published. On success, associate the post, advance the beat/count, and complete the
project when exhausted in the smallest transaction after policy revalidation.

The `noooooods` project implementation is reference-only and materially overstates
this contract: do not port its `startsAt`/`endsAt`, milestone `dueAt`/`notBefore`,
minimum-spacing scheduler, or scheduler-to-route `app.inject()` orchestration. Reuse
only useful project presentation ideas after mapping them to this bounded post sequence.

Projects may request only output capabilities already shipped and must call their
existing operations; they do not own another image, poll, or attachment pipeline.
The current product answer does not settle the project-level media preference/UI, so exact media
defaults and per-beat media controls remain open rather than inferred.

## Architecture rules for every later slice

- Noodle and NoodleR remain two capabilities on one social-data substrate.
- Share contracts, storage invariants, narrow pure helpers, provider mechanics,
  operation locks, cadence infrastructure, and capability-based presentation.
- Keep public refresh, private generation, automatic posting, fan engagement,
  economics, projects, prompts, projections, and schedule state separate when their
  actors, access, output, or persistence policy differs.
- Routes are HTTP adapters. Schedulers/projects/commands call application services,
  never routes or internal HTTP.
- Provider/media work stays outside database transactions. Revalidate mutable policy
  before commit.
- Authoring identity and viewer/access identity are separate axes.
- Visibility and disclosure are enforced by server/storage policy, not prompts or
  hidden UI alone.
- Do not widen persona-facing commands for generated actors.
- No bulk module reorganization. Improve only seams touched by the active slice.

## Standing workflow and validation rules

- Branch fresh from freshly fetched `origin/staging`; `noooooods` and parked branches
  are reference-only.
- One logical change per PR. Separate pure moves/refactors from behavior changes.
- One writer per slice; use separate worktrees for independent concurrent slices.
- The ~500 LOC / 8 file guideline is a warning, not a cap. Never weaken correctness
  or types to stay under it.
- During implementation, use focused checks such as server/client lint,
  `pnpm regression:noodle`, `pnpm regression:prompt`, or the smallest matching proof.
- Before shipping or marking ready, run `pnpm check` with at least a 300-second
  timeout and `pnpm guard:installer-artifacts`; add `pnpm version:check` when version
  or release references change. Run relevant browser smoke/manual proof for UI work.
- Do not claim browser/manual checks that did not run. The human contributor performs the real pass
  when the environment cannot.
- Update code-coupled docs and changelog in the same PR as behavior.
- Confirm/open a GitHub issue before implementation.
- No AI/bot attribution. Stage files intentionally.
- PR descriptions open with the slice/capability, prior merged foundation, rationale,
  and explicit non-scope. Leave human validation boxes unchecked.

## Decision log

- This living plan supersedes the tracked repository v2 plan for future work.
- NoodleR's north star is a standalone 18+ adult creator-platform simulation for
  interacting with personas and characters through stage identities, analogous to
  Noodle's Twitter-like simulation.
- Slice 6b is the functional AI-guided foundation, not the release candidate.
- Slice 7 is required roleplay authoring/profile parity. The reference post-as branch is discarded only as an integration unit; its approved core behavior is rebuilt from
  fresh staging.
- The main-timeline stage-profile picker is removed. Authoring maps the selected
  Noodle persona to its linked stage profile and never falls back to another creator.
- Per-profile generation does not require direction text; **Guide** is a draft-aware
  button/action rather than a required mode.
- Public-profile stage creation is required but may be a later Slice 7 follow-up.
- The local fan branch is parked as prior art and is not a prerequisite.
- Automatic posting is the next autonomous capability and is text-only first.
- Fan work is roleplay-first: quiet synthetic engagement, named/moment behavior, then
  opt-in real-character identity sourcing. Support points/events are an optional
  low-priority later addition.
- Shared scheduler infrastructure does not mean shared schedule state.
- Release-candidate status requires Slice 7, toggleable Slice 8 auto-posting, and an
  explicitly accepted user guidance/control plane.
- NoodleR controls use two levels: a global NoodleR Settings section and per-creator
  controls on creator pages. Capability state remains independently typed.
- Slice 8 automatic/manual-refresh posts default to subscriber access. Automatic PPV
  and currency are excluded.
- Slice 8 uses schedule enable/disable and schedule rescheduling; it does not add
  separate pause-all or quiet-hours fields.
- Global **Refresh NoodleR now** runs automation-enabled creators, prioritizing those
  scheduled soon and then the remaining enabled creators. Slice 7's composer owns the
  single-creator path.
- A successful global/manual refresh consumes a near-future automatic slot and
  advances the creator's `nextRunAt` under the existing cadence/schedule policy,
  preserving explicit schedule intent and preventing an immediate duplicate run.
- Autopost enabled without a user-authored schedule uses a sensible randomized
  default cadence; exact jitter is implementation detail, not a separate scheduler.
- Global fan policy values are defaults with per-creator overrides. Fan policy may
  shape the audience archetype mix, including ordinary, eccentric, cross-fandom,
  raider, organic-discovery, and non-adult/free-resource audiences. Slice 9 defines
  exact labels, weights, validation, and persistence without sharing auto-post state.
- Slice 9c permits explicit per-creator opt-in for selected character-backed creators;
  it is off by default. Persona-backed creators remain eligible by default.
- Character-backed creator profiles may independently opt into live source-character
  lorebook and schedule context for post ideas. Both default off; source schedules
  guide content, never publication timing, and no global enable-all control exists.
- Initial support events are **Joined the inner circle** (+10 support points on first
  subscription) and **Unlocked a post** (+5 once per fan/post unlock). Points remain a
  non-spendable score and the event/score update is idempotent.
- Slice 8b adds generated creator images immediately after text-only auto-posting by
  adapting public Noodle's prompt/quota/review/staging mechanics to access-protected
  NoodleR media storage. User uploads, gallery attachment, and polls remain Slice 10.
- Durable fan profiles are limited to named identity-continuity actors. Anonymous fan
  mass stays aggregate; anonymous replies retain only an event-local display snapshot.
  All fan history is filtered through the current viewer's post-access projection.
- NoodleR posts never mirror into public Noodle. `access: "public"` means Free/Public
  inside NoodleR, selected explicitly per post; automatic posts stay subscriber by
  default and cannot silently widen access.
- A creator project is an editable bounded content arc over the next 1–20 successful
  generated posts (default 5), with at most one active project per creator. It reuses
  Slice 8 timing and the private-post operation; source schedules may guide content but
  never publication time. Exact project-level media controls remain undecided.
- There is no permanent auto-post-only creative brief. Durable stage identity, one-post
  Guide, and bounded Projects are the complete instruction layers.
- Slice 7 guidance is a button/action over the current composer draft, not a required
  always-on mode. **Post** publishes the draft literally; **Guide** transforms it
  through the existing private generation pipeline.
- Literal non-LLM private posting is required product behavior, not merely a fallback
  or implementation convenience.
- Guided generation ultimately exposes four independent output choices: **enable
  title**, **enable text**, **enable image**, and **enable poll**. The image and poll
  choices land only with their later output capabilities; do not expose dead controls
  in the text-only Slice 7 surface. Defaults, minimum-enabled validation, persistence,
  and exact slice placement for the title/text switches still require implementation
  planning rather than product inference.
- NoodleR posts have an optional first-class title. Titles participate in private
  generation and disclosure protection and are hidden whenever the post body is
  access-locked. Public Noodle remains titleless.
- Image generation/selection, attachments, and polls are explicitly later scope.
- The sidebar persona picker shows which personas have linked NoodleR profiles without
  becoming a second author picker.
- Fun and roleplay payoff take priority over realism-only simulation scope. Sensible
  defaults ship first; advanced controls remain optional and explicitly layered.
- Slice 9e gives named continuity actors faux profiles and access-filtered history;
  anonymous audience ambience remains aggregate and non-clickable.

## Product decisions still open

- **Special fan-moment cards?** May 9c start with the recommended **Superfan formed**
  and **Post taking off** cards in both the feed and creator-profile activity, using
  conservative deterministic thresholds that we tune later? If not, specify the first
  moments, display surface, or triggering behavior product direction intends instead.
- Remaining cross-mode source/trigger and failure contracts; the destination is
  NoodleR and public-Noodle mirroring is prohibited.
- Project-level media defaults and per-beat output controls. Project sequencing and
  timing ownership are resolved.
