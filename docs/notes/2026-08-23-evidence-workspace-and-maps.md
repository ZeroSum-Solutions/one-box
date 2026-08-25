# Evidence workspace and Google Maps notes

**Status:** Deferred product notes. These are not approved tickets and do not authorize implementation.

## Make the design flow easier to understand

The full design flow includes competitive research, brand identity, design references,
the design contract, tokens, and later review stages. The final experience should explain
each stage in plain language that an eighth grader can understand.

Show the short, useful version first. Let people expand a section when they want the
research, sources, reasoning, or technical detail behind a decision.

The main view should answer four questions:

1. What are we deciding?
2. What did OneBox learn?
3. What does the proposed choice look like?
4. What does the person need to do next?

## Put feedback and decisions at the bottom

Each review page should end with a clear feedback composer. This applies to research,
brand direction, reference selection, the design contract, tokens, and other approval
stages.

The composer should include:

- Drag and drop for files.
- A visible attachment control.
- A text field for feedback.
- A send button.
- Support for useful evidence such as a brand kit, logo files, screenshots, color
  references, and documents that arrived after the project started.

A person should be able to say, for example, "I do not like these colors," attach a
brand kit or reference image, and send both together.

Place **Approve to Continue** and **Request Changes** at the bottom of every review page,
close to the final content being reviewed. We can also keep controls near the top when
helpful, but a person should never need to scroll back up to find the next action.

## Show tokens instead of only describing them

Design-system choices should use visual specimens wherever possible:

- Render typography in the actual font, weight, size, line height, and hierarchy being
  proposed. If the body font is Roboto or Times New Roman, the specimen should use it.
- Show spacing values as visible gaps between real interface elements.
- Show corner-radius values on cards, buttons, fields, and image frames.
- Render border styles at their real thickness and color.
- Show each shadow and overlay on a representative surface.
- Show colors in realistic interface roles, not only as isolated swatches.
- Include useful interaction states such as hover, focus, disabled, error, and selected
  when they affect the design contract.

Keep the first view simple. Detailed token values, provenance, and implementation notes
can live in expanded sections.

The goal is to help people catch mismatches before generation. Better visual review at
this stage should reduce later revisions, model calls, and project cost.

## Configure Google Maps later

OneBox still needs a working Google Maps setup for local-market maps and Places
verification.

When this work begins:

- Use the `devzerosum@gmail.com` Google account.
- Let Devin complete Google sign-in, MFA, billing confirmation, and any consent screens.
- Identify the minimum Google Maps Platform APIs OneBox needs.
- Restrict the key to the required APIs and approved local or production origins.
- Store the key through ZS Vault and expose it to OneBox as `GOOGLE_MAPS_API_KEY`.
- Verify both the map display and Places lookup with a small local test.
- Record expected billing limits and add a safe degraded state when Maps is unavailable.

No Google account, billing, or credential work is authorized by this note.

## Possible future work groups

These notes can later become separate proposed tickets:

1. Plain-language evidence and design-system review flow.
2. Bottom feedback composer with attachments and send behavior.
3. Bottom approval and change-request actions on every review stage.
4. Visual token specimens for typography, spacing, radii, borders, shadows, colors,
   and interaction states.
5. Google Maps and Places configuration, key restrictions, and degraded-state testing.
