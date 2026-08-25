"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

/** Purpose-built readers for the six evidence artifacts.
 *
 * These payloads are the run's actual design decisions — a palette with named
 * roles and explicit prohibitions, a Tailwind theme mapping, a CSS variable
 * hierarchy, a rendered contract. Dumped as JSON they are unreadable, and a
 * reviewer who cannot read an artifact cannot honestly approve it. Each type
 * gets a reader shaped to what it is.
 *
 * One rule governs all of them: the client's colours appear ONLY inside a
 * bounded swatch. They never set a surface, a border, a control or any text in
 * the midnight shell — the shell frames the palette, it never joins it. */

// ---------------------------------------------------------------- colour math

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseHex(value: string): [number, number, number] | null {
  if (!HEX_COLOR.test(value)) return null;
  let hex = value.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio. Reported on swatch cards as measured proof — the
 * reviewer approving a palette should not have to take legibility on trust. */
export function contrastRatio(a: string, b: string): number | null {
  const left = parseHex(a);
  const right = parseHex(b);
  if (!left || !right) return null;
  const lumL = relativeLuminance(left);
  const lumR = relativeLuminance(right);
  const [hi, lo] = lumL > lumR ? [lumL, lumR] : [lumR, lumL];
  return (hi + 0.05) / (lo + 0.05);
}

function TokenValue({ value }: { value: string }) {
  return (
    <>
      {HEX_COLOR.test(value) && (
        <span className="tok-swatch" style={{ background: value }} aria-hidden="true" />
      )}
      <code>{value}</code>
    </>
  );
}

// ------------------------------------------------------------------- markdown

/** Just enough markdown for a generated design contract: headings, paragraphs,
 * bullets, bold runs and inline hex. A full parser would be a dependency for
 * four constructs the generator actually emits. */
function inlineMarkdown(text: string, key: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${key}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    if (HEX_COLOR.test(part)) {
      return (
        <span className="md-hex" key={`${key}-${index}`}>
          <span className="tok-swatch" style={{ background: part }} aria-hidden="true" />
          <code>{part}</code>
        </span>
      );
    }
    return part;
  });
}

export function ContractMarkdown({ source }: { source: string }) {
  // Everything before the closing fence is YAML the token views already
  // present far better than a wall of key/value text.
  const body = source.startsWith("---") ? source.replace(/^---[\s\S]*?\n---\n/, "") : source;
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {items.map((item, index) => (
          <li key={index}>{inlineMarkdown(item, `li-${blocks.length}-${index}`)}</li>
        ))}
      </ul>
    );
  };

  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim().length === 0) {
      flushBullets();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushBullets();
      const level = heading[1].length;
      const text = inlineMarkdown(heading[2], `h-${blocks.length}`);
      blocks.push(
        level <= 2 ? (
          <h3 key={`h-${blocks.length}`}>{text}</h3>
        ) : (
          <h4 key={`h-${blocks.length}`}>{text}</h4>
        )
      );
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();
    blocks.push(<p key={`p-${blocks.length}`}>{inlineMarkdown(line, `p-${blocks.length}`)}</p>);
  }
  flushBullets();

  return <div className="md-doc">{blocks}</div>;
}

// ------------------------------------------------------------- artifact fetch

function useArtifactText(href: string): { text: string | null; failed: boolean; loading: boolean } {
  const [result, setResult] = useState<{ href: string; text: string | null; failed: boolean }>({
    href: "",
    text: null,
    failed: false,
  });
  useEffect(() => {
    let active = true;
    fetch(href)
      .then((response) => {
        if (!response.ok) throw new Error(`artifact returned ${response.status}`);
        return response.text();
      })
      .then((value) => {
        if (active) setResult({ href, text: value, failed: false });
      })
      .catch(() => {
        if (active) setResult({ href, text: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [href]);
  return { text: result.text, failed: result.failed, loading: result.href !== href };
}

/** Source text with a bounded well — DESIGN.md §Long-run disclosure: no
 * artifact sets the page's height. */
export function ArtifactSource({ href, label }: { href: string; label: string }) {
  const { text, failed, loading } = useArtifactText(href);
  // The labelled region wraps every state, not just the loaded one: it is how
  // assistive tech names the block, and a region that appears only after a
  // fetch resolves is a region a screen reader never hears announced.
  return (
    <section aria-label={`${label} preview`}>
      {/* The direct link renders in every state, including the failed one:
          when the inline preview cannot be read, opening the file is exactly
          what the reader needs, so it must not be the thing that disappeared. */}
      <p className="doc-view__bar">
        <a className="btn-ghost btn-mini" href={href}>
          Open {label}
        </a>
      </p>
      {loading && <p role="status">Loading {label}…</p>}
      {failed && (
        <p role="alert" className="chat-error">
          {label} could not be read. Open the versioned artifact directly.
        </p>
      )}
      {text !== null && (
        <pre className="source-well" tabIndex={0}>
          {text}
        </pre>
      )}
    </section>
  );
}

/** Rendered-first, source-one-click-away. The default view of a contract is
 * the contract, not the file that carries it. */
export function ContractDocument({ href, label }: { href: string; label: string }) {
  const [showSource, setShowSource] = useState(false);
  const { text, failed, loading } = useArtifactText(href);

  return (
    <section className="doc-view" aria-label={`${label} preview`}>
      <div className="doc-view__bar">
        <p className="eyebrow">{`{ ${label.toLowerCase()} }`}</p>
        <button
          type="button"
          className="btn-ghost btn-mini"
          onClick={() => setShowSource((value) => !value)}
        >
          {showSource ? "Rendered" : "View source"}
        </button>
        <a className="btn-ghost btn-mini" href={href}>
          Download
        </a>
      </div>
      {loading && <p role="status">Loading {label}…</p>}
      {failed && (
        <p role="alert" className="chat-error">
          {label} could not be read. Open the versioned artifact directly.
        </p>
      )}
      {text !== null &&
        (showSource ? (
          <pre className="source-well" tabIndex={0}>
            {text}
          </pre>
        ) : (
          <ContractMarkdown source={text} />
        ))}
    </section>
  );
}

// -------------------------------------------------------------------- palette

export interface PaletteEntry {
  name: string;
  value: string;
  cssVar?: string;
  role?: string;
  forbidden?: string;
  evidenceIds?: string[];
}

/** The showpiece. Each card carries a bounded swatch of the client's colour,
 * its name and variable, the role it plays, the rule that forbids misuse, and
 * measured contrast against the palette's own darkest and lightest members —
 * proof rather than assertion. */
export function PaletteGrid({ entries }: { entries: PaletteEntry[] }) {
  const hexes = entries.map((entry) => entry.value).filter((value) => HEX_COLOR.test(value));
  const luminances = hexes
    .map((hex) => ({ hex, lum: relativeLuminance(parseHex(hex)!) }))
    .sort((a, b) => a.lum - b.lum);
  const darkest = luminances[0]?.hex;
  const lightest = luminances[luminances.length - 1]?.hex;

  return (
    <div className="palette-grid">
      {entries.map((entry) => {
        const isHex = HEX_COLOR.test(entry.value);
        const against = isHex && darkest && lightest
          ? [
              { label: darkest, ratio: contrastRatio(entry.value, darkest) },
              { label: lightest, ratio: contrastRatio(entry.value, lightest) },
            ].filter((pair) => pair.ratio !== null && pair.label !== entry.value)
          : [];
        return (
          <article className="palette-card" key={`${entry.cssVar ?? ""}-${entry.name}`}>
            {/* The one sanctioned place an arbitrary client colour touches this
                UI: bounded by the card's own hairline, never behind text. */}
            <div
              className="palette-card__swatch"
              style={isHex ? { background: entry.value } : undefined}
              aria-hidden="true"
            >
              {!isHex && <span className="palette-card__nonhex">not a colour literal</span>}
            </div>
            <div className="palette-card__body">
              <h4 className="palette-card__name">{entry.name}</h4>
              <p className="palette-card__ids mono-meta">
                <span className="palette-card__hex">{entry.value}</span>
                {entry.cssVar && <span>{entry.cssVar}</span>}
              </p>
              {entry.role && <p className="palette-card__role">{entry.role}</p>}
              {entry.forbidden && (
                <p className="palette-card__never">
                  <span>Never</span> {entry.forbidden}
                </p>
              )}
              {against.length > 0 && (
                <dl className="palette-card__contrast mono-meta">
                  {against.map((pair) => (
                    <div key={pair.label}>
                      <dt>
                        <span
                          className="tok-swatch"
                          style={{ background: pair.label }}
                          aria-hidden="true"
                        />
                        {pair.label}
                      </dt>
                      <dd>{pair.ratio!.toFixed(2)}:1</dd>
                    </div>
                  ))}
                </dl>
              )}
              {entry.evidenceIds && entry.evidenceIds.length > 0 && (
                <p className="palette-card__evidence mono-meta">
                  from {entry.evidenceIds.slice(0, 2).join(", ")}
                  {entry.evidenceIds.length > 2 && ` +${entry.evidenceIds.length - 2}`}
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Non-colour tokens: same grammar, no swatch. Grouped by category so a
 * reviewer reads spacing as a ladder and motion as a system, not as 80
 * alphabetised rows. */
export function TokenSpecList({
  groups,
  showSpecimens = true,
}: {
  groups: Array<{
    category: string;
    tokens: Array<{ semanticName: string; value: string; usage: string; evidenceIds: string[] }>;
  }>;
  showSpecimens?: boolean;
}) {
  return (
    <div className="spec-groups">
      {showSpecimens && <TokenSpecimenGallery groups={groups} />}
      {groups.map((group) => (
        <section className="spec-group" key={group.category}>
          <p className="eyebrow">{`{ ${group.category} }`}</p>
          <table className="spec-table">
            <tbody>
              {group.tokens.map((token) => (
                <tr key={token.semanticName}>
                  <th scope="row">
                    <code>{token.semanticName}</code>
                  </th>
                  <td className="spec-table__value">
                    <TokenValue value={token.value} />
                  </td>
                  <td className="spec-table__usage">{token.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function usageValue(
  token: { usage: string } | undefined,
  pattern: RegExp,
): string | undefined {
  return token?.usage.match(pattern)?.[1];
}

function specimenFontFamily(family: string | undefined): string | undefined {
  if (!family) return undefined;
  const knownShellFamilies: Record<string, string> = {
    switzer: "var(--font-body)",
    "clash display": "var(--font-display)",
    "jetbrains mono": "var(--font-mono-app)",
  };
  return knownShellFamilies[family.toLowerCase()] ?? family;
}

function specimenWeights(token: { usage: string }): number[] {
  return usageValue(token, /weights?\s+([0-9, ]+)/i)
    ?.split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter(Number.isFinite) ?? [];
}

function specimenFontStatus(family: string, weights: number[]): string {
  const loadedWeights: Record<string, number[]> = {
    switzer: [400, 510, 590],
    "clash display": [500, 600],
    "jetbrains mono": [400],
  };
  const available = loadedWeights[family.toLowerCase()];
  if (!available) {
    return "Uses this family and its declared weights when available; otherwise shows a browser fallback or synthesized weight.";
  }
  const missing = weights.filter((weight) => !available.includes(weight));
  return missing.length === 0
    ? "Loaded in this reviewer at every declared weight."
    : `Family loaded, but weight${missing.length === 1 ? "" : "s"} ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} unavailable; the browser may synthesize them.`;
}

/** Show the proposed system doing real work before asking a reviewer to read
 * its variable table. Arbitrary client values stay inside these bounded
 * specimen wells, preserving the Midnight Instrument shell around them. */
export function TokenSpecimenGallery({
  groups,
}: {
  groups: Array<{
    category: string;
    tokens: Array<{ semanticName: string; value: string; usage: string; evidenceIds: string[] }>;
  }>;
}) {
  const byCategory = new Map(groups.map((group) => [group.category, group.tokens]));
  const typography = byCategory.get("typography") ?? [];
  const spacing = byCategory.get("spacing") ?? [];
  const radii = byCategory.get("radius") ?? [];
  const borders = byCategory.get("border") ?? [];
  const shadows = byCategory.get("shadow") ?? [];
  const layers = byCategory.get("layer") ?? [];
  const colors = byCategory.get("color") ?? [];
  const componentStates = byCategory.get("component-state") ?? [];
  const familyTokens = typography.filter((token) => /--font-/i.test(token.semanticName));
  const typeTokens = typography.filter((token) => /--text-/i.test(token.semanticName));
  const hasSpecimens = typography.length + spacing.length + radii.length + borders.length + shadows.length + layers.length + colors.length > 0;

  if (!hasSpecimens && componentStates.length === 0) return null;

  return (
    <section className="token-specimen-gallery" aria-labelledby="token-specimen-title">
      <div className="token-specimen-gallery__head">
        <p className="eyebrow">{"{ real examples }"}</p>
        <h3 id="token-specimen-title">See the system before reading its values</h3>
      </div>
      <div className="token-specimen-gallery__grid">
        {familyTokens.length > 0 && (
          <article className="token-specimen token-specimen--type">
            <span className="token-specimen__label">Typography</span>
            <div className="token-font-family-list">
              {familyTokens.map((familyToken) => {
                const family = specimenFontFamily(familyToken.value);
                const weights = specimenWeights(familyToken);
                const headingWeight = weights.length > 0 ? String(Math.max(...weights)) : undefined;
                const bodyWeight = weights.length > 0 ? String(Math.min(...weights)) : undefined;
                const familyRole = familyToken.usage.split(";")[0];
                const roleSpecificTypes = /heading|display|title/i.test(familyRole)
                  ? typeTokens.filter((token) => /heading|display|title/i.test(`${token.semanticName} ${token.usage}`))
                  : /body|interface|copy/i.test(familyRole)
                    ? typeTokens.filter((token) => !/heading|display|title/i.test(`${token.semanticName} ${token.usage}`))
                    : typeTokens;
                return (
                  <section className="token-font-family" key={familyToken.semanticName}>
                    <div className="token-font-family__head">
                      <strong>{familyToken.value} · {familyRole}</strong>
                      <code>{familyToken.semanticName}</code>
                    </div>
                    <p className="token-font-family__availability">
                      {specimenFontStatus(familyToken.value, weights)}
                    </p>
                    {(roleSpecificTypes.length > 0 ? roleSpecificTypes : typeTokens.length > 0 ? typeTokens : [{
                      semanticName: "type-sample",
                      value: "20px",
                      usage: "body; line-height 1.5",
                      evidenceIds: [],
                    }]).map((typeToken) => {
                      const isHeading = /heading|display|title/i.test(`${typeToken.semanticName} ${typeToken.usage}`);
                      const lineHeight = usageValue(typeToken, /line-height\s+([^;\s]+)/i);
                      const tracking = usageValue(typeToken, /tracking\s+([^;\s]+)/i);
                      return (
                        <p
                          className={isHeading ? "token-specimen__heading" : "token-specimen__body"}
                          key={`${familyToken.semanticName}-${typeToken.semanticName}`}
                          style={{
                            ...(family ? { fontFamily: family } : {}),
                            fontSize: typeToken.value,
                            ...(isHeading && headingWeight ? { fontWeight: headingWeight } : {}),
                            ...(!isHeading && bodyWeight ? { fontWeight: bodyWeight } : {}),
                            ...(lineHeight ? { lineHeight } : {}),
                            ...(tracking ? { letterSpacing: tracking } : {}),
                          }}
                        >
                          <span>{typeToken.usage.split(";")[0]}</span>
                          {isHeading ? "The quick brown fox" : "A real type specimen for readable interface copy."}
                        </p>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          </article>
        )}
        {colors.length > 0 && (
          <article className="token-specimen">
            <span className="token-specimen__label">Color roles</span>
            <div className="token-color-role-list">
              {colors.map((token) => {
                const rgb = parseHex(token.value);
                const foreground = rgb && relativeLuminance(rgb) > 0.42 ? "#111111" : "#ffffff";
                return (
                  <div
                    className="token-color-role"
                    key={token.semanticName}
                    style={{ background: token.value, color: foreground }}
                  >
                    <span>{token.usage.split(";")[0] || "Interface role"}</span>
                    <code>{token.semanticName}</code>
                  </div>
                );
              })}
            </div>
          </article>
        )}
        {spacing.length > 0 && (
          <article className="token-specimen">
            <span className="token-specimen__label">Spacing</span>
            <div className="token-measure-list">
              {spacing.map((token) => (
                <div className="token-measure" key={token.semanticName}>
                  <div className="token-spacing-demo" style={{ gap: token.value }} role="img" aria-label={`Two elements separated by ${token.value}`}>
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                  </div>
                  <code>{token.semanticName}: {token.value}</code>
                </div>
              ))}
            </div>
          </article>
        )}
        {radii.length + borders.length + shadows.length > 0 && (
          <article className="token-specimen">
            <span className="token-specimen__label">Surfaces</span>
            <div className="token-surface-list">
              {radii.map((token) => (
                <div className="token-surface-demo" key={token.semanticName} style={{ borderRadius: token.value }}>
                  <span>Radius</span><code>{token.semanticName}: {token.value}</code>
                </div>
              ))}
              {borders.map((token) => (
                <div className="token-surface-demo" key={token.semanticName} style={{ border: token.value }}>
                  <span>Border</span><code>{token.semanticName}: {token.value}</code>
                </div>
              ))}
              {shadows.map((token) => (
                <div className="token-surface-demo" key={token.semanticName} style={{ boxShadow: token.value }}>
                  <span>Shadow or overlay</span><code>{token.semanticName}: {token.value}</code>
                </div>
              ))}
            </div>
          </article>
        )}
        {layers.length > 0 && (
          <article className="token-specimen">
            <span className="token-specimen__label">Stacking layers</span>
            <div className="token-layer-demo" aria-label="Stacking layer examples">
              {layers.map((token, index) => (
                <div
                  className="token-layer-demo__item"
                  key={token.semanticName}
                  style={{ zIndex: token.value, insetInlineStart: `${index * 16}px` }}
                >
                  <span>{token.usage}</span>
                  <code>{token.semanticName}: {token.value}</code>
                </div>
              ))}
            </div>
          </article>
        )}
        {componentStates.length > 0 && (
          <article className="token-specimen token-specimen--states">
            <span className="token-specimen__label">Interaction states</span>
            <div className="token-state-demo" aria-label="Button state examples">
              {componentStates.map((token) => {
                const state = token.semanticName.split("-").at(-1)?.toLowerCase() ?? "default";
                return (
                  <div className="token-state-demo__item" key={token.semanticName}>
                    <button
                      type="button"
                      data-state={state}
                      aria-pressed={state === "selected" ? true : undefined}
                      disabled={state === "disabled"}
                    >
                      {state.charAt(0).toUpperCase() + state.slice(1)}
                    </button>
                    <code>{token.value}</code>
                  </div>
                );
              })}
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------- tailwind

export function ThemeMappingTable({
  mappings,
  swatchFor,
}: {
  mappings: Array<{ cssVariable: string; tailwindName: string; rationale: string }>;
  swatchFor: (tailwindName: string) => string | undefined;
}) {
  return (
    <table className="map-table">
      <thead>
        <tr>
          <th scope="col">Source variable</th>
          <th scope="col">Theme name</th>
          <th scope="col">Why</th>
        </tr>
      </thead>
      <tbody>
        {mappings.map((mapping) => {
          const swatch = swatchFor(mapping.tailwindName);
          return (
            <tr key={mapping.cssVariable}>
              <th scope="row">
                <code>{mapping.cssVariable}</code>
              </th>
              <td className="map-table__target">
                {swatch && (
                  <span className="tok-swatch" style={{ background: swatch }} aria-hidden="true" />
                )}
                <code>{mapping.tailwindName}</code>
              </td>
              <td className="map-table__why">{mapping.rationale}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ----------------------------------------------------------- css architecture

export function VariableHierarchy({ layers }: { layers: string[] }) {
  return (
    <ol className="hierarchy">
      {layers.map((layer, index) => (
        <li className="hierarchy__row" key={layer} style={{ paddingLeft: `${index * 18}px` }}>
          <span className="hierarchy__rule" aria-hidden="true" />
          <span className="hierarchy__name">{layer}</span>
          <span className="hierarchy__depth mono-meta">L{index}</span>
        </li>
      ))}
    </ol>
  );
}

/** `tokenToComponentUsage` is currently built upstream by comma-splitting each
 * token's prose `usage` string, so its "components" are often sentence
 * fragments ("providing a grounded", "stable foundation for content. Never:
 * …"). A badge is a label affordance — wrapping a clause in one asserts a
 * precision the data does not have. Short, punctuation-free entries render as
 * badges; anything sentence-shaped renders as the prose it actually is. When
 * the pipeline emits real component names, they all become badges again with
 * no change here. */
function isComponentName(use: string): boolean {
  return use.length <= 28 && !/[.;:]/.test(use);
}

export function UsageMap({
  usage,
  swatchFor,
}: {
  usage: Record<string, string[]>;
  swatchFor: (token: string) => string | undefined;
}) {
  const rows = Object.entries(usage);
  return (
    <ul className="usage-map">
      {rows.map(([token, uses]) => {
        const swatch = swatchFor(token);
        return (
          <li className="usage-map__row" key={token}>
            <span className="usage-map__token">
              {swatch && (
                <span className="tok-swatch" style={{ background: swatch }} aria-hidden="true" />
              )}
              <code>{token}</code>
            </span>
            <span className="usage-map__uses">
              {uses.map((use, index) =>
                isComponentName(use) ? (
                  <span className="badge usage-map__use" key={`${use}-${index}`}>
                    {use}
                  </span>
                ) : (
                  <span className="usage-map__prose" key={`${use}-${index}`}>
                    {use}
                  </span>
                )
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ----------------------------------------------------------------- QA + misc

export function CheckTable({
  checks,
  renderEvidence,
}: {
  checks: Array<{ area: string; status: string; notes: string; evidencePath?: string }>;
  renderEvidence: (path: string, area: string) => ReactNode;
}) {
  return (
    <ul className="check-list">
      {checks.map((check) => {
        const failed = check.status !== "pass";
        return (
          <li className={`check-row${failed ? " check-row--fail" : ""}`} key={check.area}>
            <span className="check-row__mark" aria-hidden="true">
              {failed ? "!" : "✓"}
            </span>
            <span className="check-row__area">{check.area}</span>
            <span className="check-row__notes">{check.notes}</span>
            <span className="check-row__status mono-meta">{check.status}</span>
            {check.evidencePath && (
              <div className="check-row__evidence">
                {renderEvidence(check.evidencePath, check.area)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A neutral track, deliberately: a green/red confidence bar would assert a
 * certainty the crawl data does not carry. */
export function ConfidenceTrack({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span className="confidence">
      <span className="confidence__track" aria-hidden="true">
        <span className="confidence__fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="mono-meta">{pct}%</span>
    </span>
  );
}
