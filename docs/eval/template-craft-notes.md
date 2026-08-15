# Template craft notes — references/motionsites analysis

Extracted 2026-08-15 from 9 templates in the motionsites.ai catalog (author
github.com/vikod3), cloned into `references/motionsites/` (gitignored) with
Devin's authorization. Context: Devin judged every template in the catalog
better than the WITS refero-baseline (`314da19`), which he graded **D on
presentation**. These notes are the raw evidence behind the template-derived
standards in `presentation-rubric.md`.

License note: grading references only. Their code and assets are never
shipped into client sites.

Method: one read-only analysis agent per template, fixed extraction sections.
grasssite was skimmed directly (Three.js scene, 354-line `scene.js`, 6
transitions in CSS — a 3D/interactive-archetype data point, no DOM craft to
extract).

---

## radiant

### STACK
- Vite + React 18 + TypeScript, Tailwind 3.4.11 + shadcn/ui (Radix primitives) + `tailwindcss-animate`, CVA variants, `lovable-tagger` (Lovable export marker)
- Motion library present: `motion` (motion/react, Framer Motion successor) v12.23.3
- Most on-page interactivity is actually hand-rolled via plain Tailwind `transition-*` utilities, not the Motion lib
- `hls.js` drives a real Mux-hosted adaptive HLS video background with manual fallback wiring — HeroSection.tsx:9-44, duplicated in AboutUs.tsx:11-45
- Full shadcn kit installed (react-hook-form+zod, embla-carousel, recharts, sonner, vaul, cmdk) but largely unused by the two live pages

### MOTION
- Scroll-reveal mechanism: Motion's `whileInView` + `viewport={{once:true, margin:'-100px'}}` — AnimatedContainer.tsx:56-65, AnimatedItem.tsx:45-58, StaggeredList.tsx:70-88
- **Gap:** those three reveal components in `src/components/animations/` are never imported by any page section (Hero, Feature1-3, Journey, CaseStudies, Testimonial, CTA render with zero scroll-reveal, fully static)
- Only real usage: footer-section.tsx defines its own local, near-duplicate `AnimatedContainer` — `initial={{filter:'blur(4px)', translateY:-8, opacity:0}}` → `whileInView={{filter:'blur(0px)', translateY:0, opacity:1}}`, `transition={{delay, duration:0.8}}`, per-column stagger via `delay={0.1 + index*0.1}` — footer-section.tsx:110-119
- Unused reveal system's tokens (still notable as intended craft): duration `0.6`/`0.5`, custom ease `[0.25, 0.46, 0.45, 0.94]`, `staggerChildren:0.1, delayChildren`, direction-based `y:±20/30` offsets, `useReducedMotion()` guard on every component
- Hero entrance: none — h1/badges/CTA render instantly
- Hover systems: nav/links `transition-colors duration-200` (color-only); CaseStudies arrow buttons swap bg `transition-colors duration-200`; JourneySection card = `hover:scale-105 transition-transform duration-300` on the image + `hover:bg-hero-secondary-bg/10 transition-all duration-300` on the card shell — no shadow-lift, no tilt, anywhere
- Marquee: CSS keyframe `marquee: { to: { transform: 'translateX(-50%)' } }`, `animate-marquee var(--duration,30s) linear infinite` (tailwind.config.ts:108-119); DOM content duplicated twice for seamless loop; `direction="right"` references `animate-marquee-reverse` which is never defined — dead/broken prop
- No parallax, no count-up (AboutUs "500+"/"50+" stats are static text), no CSS `animation-timeline`, no cursor-follow

### CARDS
- Two repeated idioms, neither is "info in a white box":
  1. Glass eyebrow/value card: `p-8 bg-hero-badge-bg border border-hero-badge-border rounded-2xl backdrop-blur-md` — AboutUs.tsx:199
  2. Signature motif (5x reuse, Feature1-3/CaseStudies/AboutUs): full-bleed `rounded-[30px]` image with a smaller offset-centered `rounded-[21px]` translucent glass panel on top — `backgroundColor: rgba(11,11,12,0.77)`, `backdrop-blur-sm`, `border border-hero-secondary-border`, `shadow-lg` — FeatureSection.tsx:45,89
- Testimonial cards: `rounded-[30px] border border-hero-secondary-border shadow-lg backdrop-blur-sm` rgba panel, full-height flex col with stars + quote + avatar
- Icons never float alone — always inside a badge chip (icon + `bg-hero-badge-bg` + border + `rounded-2xl` + `backdrop-blur-md`)

### SECTION-DIVISION
- Near-uniform flat `bg-[#050505]` across sections — no alternating light/dark bands
- Separation is spacing-only: `py-12 lg:py-8` (Feature1-3, Testimonial), `py-12 lg:py-16` (CaseStudies), `py-20` (AboutUs), `py-16` + `mt-20 mb-20` (CTA), `mt-[150px]` (JourneySection)
- Hero/About-hero use full-bleed video + `#D9D9D9`@0.7 multiply overlay as the one strong visual break
- Footer is the sole "chrome" break: `rounded-t-4xl md:rounded-t-6xl` card on a radial gradient plus a blurred 1px top hairline — footer-section.tsx:59-60

### HIERARCHY
- Eyebrow badge (icon + pill label, `text-sm`) precedes nearly every H2
- Type scale: H1 `text-4xl md:text-6xl lg:text-7xl xl:text-8xl 2xl:text-[92px]` down to section H2 `text-4xl lg:text-5xl xl:text-6xl`, body flat at `text-base lg:text-lg` — ~6x display/body contrast
- All headings `font-normal` — hierarchy is size-driven, not weight-driven
- No hue accent rule: emphasis via opacity/lightness only (white vs ~67% gray, further `opacity-70`); accent color reserved for photography/video only
- Stat numerals as hierarchy device: `text-6xl font-bold` "500+" / `text-4xl font-bold` "50+"

### COLOR
- Monochrome token system: `--background: 0 0% 2.4%`, `--hero-foreground: 0 0% 100%`, `--hero-muted: 0 0% 67%` — zero saturated hue in design tokens
- shadcn default light-mode/`.dark` tokens are dead scaffolding — both live pages run permanently dark
- Only saturation source: photography/video (further flattened via `filter: saturate(0)`) and marquee brand-logo SVGs, also wrapper-`saturate(0)`'d
- Glass/translucency (rgba panels, `/5 /10 /20` opacity) substitutes for color as the elevation cue

### STANDOUT
1. Real Mux HLS adaptive video hero, desaturated + multiply-tinted, with hand-wired hls.js fallback — not a static hero image/gradient
2. The repeated "full image + offset translucent glass panel" layered composition (5 instances) is a genuine layout craft move a template built from flat cards would never produce
3. A fully-built, reduced-motion-aware Motion reveal system exists in the codebase but is disconnected from the shipped page — the *pattern* of premium motion without follow-through

---

## serein-minimal-hero

### STACK
- Vite 5 + React 18 + TypeScript, Tailwind 3.4, shadcn/ui + `tailwindcss-animate`
- Motion: **hand-rolled only** — no framer-motion/gsap. All motion is CSS `transition` + one `@keyframes` block
- `hls.js` for a Cloudflare Stream HLS video background in the hero — Hero.tsx:4,13-24
- `App.css` contains unused Vite boilerplate; Lovable export fingerprint intact

### MOTION
- Hero entrance: single wrapper `animate-fade-in` on the whole text stack (Hero.tsx:49) — **no stagger**, headline/subhead/CTAs fade in simultaneously as one block
- `@keyframes fade-in { from { opacity:0; transform: translateY(-10px) } }`, `animation: fade-in 0.3s ease-out` (index.css:124-137) — 300ms, default ease-out, 10px rise
- No scroll-reveal mechanism at all: no IntersectionObserver, no scroll-triggered classes. Sections below the fold render fully visible
- Hover system uniform and shallow: `--transition-smooth: all 0.3s cubic-bezier(0.4,0,0.2,1)`; hover changes background opacity or text color only; no scale, no shadow-lift, no translate. One exception: FeaturedModels cards `hover:shadow-lg`
- FeaturedModels.tsx:48 sets `animationDelay: ${index * 0.1}s` per card but no `animate-*` class — a stagger intent never wired up (dead)
- No marquee, no parallax, no scroll-linked transforms

### CARDS
- FeaturedModels: `rounded-3xl` (24px), `card-shadow` (0 1px 3px 10%) + `hover:shadow-lg`, border. Anatomy: header → price block → feature checklist with Check icons → full-width pill CTA. Popular variant gets an absolute pill Badge top-right
- WhyChooseUs benefit "cards" are flat divs, no border/shadow: `p-8 rounded-3xl bg-[#f8f9fc]` with inset icon tile `w-24 h-24 rounded-3xl bg-[#e6eaf7]` — the only off-token colors in the codebase, a two-tone icon-chip technique
- No card has hover elevation transform, border-glow, or gradient edge

### SECTION-DIVISION
- Every section `py-24 px-6` — a single 96px value repeated verbatim, no scale variation
- All sections share `bg-background` (white) — zero color-block separation; only Footer breaks with `bg-muted/30 border-t`
- Container 1400px max, per-section inner caps (`max-w-6xl/5xl/2xl`) the only compositional variety

### HIERARCHY
- No eyebrow labels anywhere
- Hero H1 `text-6xl md:text-7xl lg:text-8xl` (60/72/96px) over a second line `text-4xl md:text-5xl lg:text-6xl` — two-tier headline (bold statement + muted continuation) is the main hierarchy device. Section H2s uniformly `text-5xl md:text-6xl`
- Single family (Inter) everywhere; headline weight only `font-medium` (500) — restrained
- No accent hue: `--accent` equals `--primary` (near-black); no colored CTA or highlight token exists

### COLOR
- Strictly monochrome HSL: everything `0 0% X%`. Only non-neutral token is unused `--destructive`
- Full light/dark theme scaffold with no toggle — dead infrastructure
- No gradients anywhere
- The two hardcoded pastel-blue hexes in WhyChooseUs are the sole departure from grayscale

### STANDOUT
- Full-bleed autoplaying, muted, looping **HLS video background** behind the hero (Cloudflare Stream, hls.js fallback + Safari `canPlayType` branch) at `opacity-50` — real engineering most exports don't bother with
- Floating "pill" navbar: `fixed` + `max-w-6xl` + `rounded-full` + `bg-background/80 backdrop-blur-xl border border-border/40 shadow-lg` — iOS-glass affectation
- Two-line hero headline (bold black + large muted) substitutes for eyebrow/subhead pairing — the only real typographic trick; everything else is scaffold defaults

---

## nexora

### STACK
- Vite 5 + React 18 + TS, SWC, `lovable-tagger`; Tailwind 3.4 + `tailwindcss-animate` + shadcn (only `Button` wired up)
- Motion: **framer-motion 12.23**, hand-rolled into two tiny wrapper components
- `hls.js` for hero video; router/react-query unused boilerplate
- No content beyond Navbar + Hero — no sections, no cards, no footer

### MOTION
- Reveal primitives: `FadeUp.tsx` and `StaggeredFade.tsx`, both `useInView(ref, {once:true})` + `motion.div`
- **FadeUp**: `{opacity:0, y:20}` → `{opacity:1, y:0}`, `duration:0.5, ease:'easeOut'`, manual stagger via hardcoded delays: badge `0`, subheadline `0.8`, CTAs `1`, partner row `1.2` — a choreographed cascade, not a loop
- **Headline stagger**: H1 split into individual letters, each `motion.span` at `delay: i * 0.07` — true per-character stagger, plus a gradient-clipped lead word that fades in as its own span
- Video background cross-fades separately via `transition-opacity duration-500` gated on the HLS `playing` event — decoupled from the framer sequence
- Hover: CTA `hover:scale-[1.02] active:scale-[0.98]` on `bg-primary/90`; outline variants color-swap only; all buttons `transition-all duration-200`
- No marquee, parallax, or count-up

### CARDS
- No card content in the live site; shadcn card primitive is dead code
- Only card-like surface: **AnnouncementBadge** pill — `rounded-full` with `--gradient-badge: linear-gradient(180deg, hsl(0 0% 16%), hsl(0 0% 12%/0.8))` — subtle top-lit gradient giving the pill dimensionality

### SECTION-DIVISION
- One section. Hero `min-h-screen`, `px-6 pt-32 pb-16 lg:px-8 lg:pt-40 lg:pb-20` — asymmetric top>bottom
- Navbar separates via `border-b border-border/30` on `backdrop-blur-sm` — translucent hairline over blurred video

### HIERARCHY
- AnnouncementBadge acts as the eyebrow (emoji + label + arrow pill, `text-sm text-muted-foreground`)
- H1 `text-4xl → md:text-5xl → lg:text-7xl`, `tracking-tighter`, `lg:leading-[1.1]` — aggressive negative tracking
- Subheadline deliberately small: `text-xs md:text-sm lg:text-base text-foreground/70` — heavy display/body contrast via opacity de-emphasis
- Accent rule: only the FIRST WORD of the H1 gets `.gradient-text` — single-word accent, never whole-line

### COLOR
- Strictly achromatic base: every token `0 0% N%` (bg 9% L, fg 98% L)
- Exactly one multi-hue element: `--gradient-hero` = mint `hsl(152 100% 77%)` → coral `hsl(15 90% 65%)` → violet `hsl(277 80% 55%)`, used in exactly two places: clipped onto the headline's first word, and as a `mix-blend-color` wash over the hero video (opacity 0→80% once playing)
- Gradient never touches buttons, borders, or badges — those stay neutral

### STANDOUT
- **Letter-level headline stagger keyed to a single accent word** — far more granular than word/line stagger, accent scoped to one word
- **HLS video hero with color-matched overlay**: streamed video tinted with `mix-blend-color` using the SAME 3-hue gradient as the headline accent — moving background tied to the brand gradient rather than unrelated decoration
- **Hand-tuned entrance cascade over generic stagger**: asymmetric pacing (0 / 0.8 / 1 / 1.2s — long pause after badge/headline, tight CTA+partner grouping) that auto-stagger wouldn't produce

---

## glow

### STACK
- Vite 5 + React 18 + TS, Tailwind 3.4 + `@relume_io/relume-tailwind` preset under shadcn/Radix
- Motion: framer-motion ^12.18.1 everywhere — declarative `variants`/`whileInView`
- Bifurcated codebase: legacy hand-built components NOT routed; live page is Relume-exported components (Header23, Navbar16, Layout228, Pricing11, Cta30) sharing the same tokens

### MOTION
- Scroll-reveal: `whileInView="visible"` + `viewport={{once:true, margin:"-100px"}}` — fires 100px early, identical pattern every section
- Stagger: `staggerChildren:0.15, delayChildren:0.1` (hero); `staggerChildren:0.2` (Relume sections)
- Hero sequence: heading/subhead/CTA cascade `{opacity:0,y:30}→{1,0}, duration:0.8`, then the dashboard screenshot blooms separately: `{opacity:0,scale:0.95}→{1,1}, duration:1, delay:0.5` — text settles first, image scales up half a second later
- Card entrance `y:20→0, duration:0.6`
- Hover: color/opacity transitions at Tailwind default ~150ms; marquee logos `opacity-60 hover:opacity-100`
- Marquee: pure CSS `translateX(0%)→translateX(-50%)` over `20s linear infinite`, width hard-computed per breakpoint for seamless loop
- Mobile hamburger→X: 4 `motion.span` bars morph via width/rotate variants, staggered 0.1–0.3s
- No count-ups, no true scroll-linked parallax

### CARDS
- One glass formula reused verbatim: `bg-[rgba(116,116,116,0.07)] border-[1.5px] border-[rgba(255,255,255,0.40)] backdrop-blur-[50px] shadow-[2px_4px_16px_0px_rgba(248,248,248,0.06)_inset] rounded-[32px]`
- Nested icon badge is the same recipe at 70×70px — fractal consistency
- Card CTAs: filled red gradient `linear-gradient(90deg,#FF5552,#F62623)` + inset highlight + 25%-white outline + `blur(50px)`
- Pill buttons: dual box-shadow — inner white rim glow inset + `0px_32px_24px_-16px` drop, `rounded-[100px]`

### SECTION-DIVISION
- No background blocking; dividers are pure vertical rhythm: `mt-[134px]` desktop collapsing to `mt-10` mobile (~3.35:1 compression); Relume sections `py-16 md:py-24 lg:py-28` + `px-[5%]` gutters
- Only hard border: navbar `border-b-[#333]`; glass cards' own borders do the anchoring on a flat near-black canvas

### HIERARCHY
- Eyebrow: plain `text-[#AAA] font-semibold` tagline above H2
- **Size-linked negative tracking**: display 68/78px `tracking-[-2.5px]`; H2 60/72px `-1.5px`; card H3 24px `-0.5px`; body 18px `0` — tracking scales down with size, a real discipline
- Body `text-[#AAA] opacity-80` vs pure-white headings — that split is the whole display/body contrast mechanism
- Accent (red) strictly reserved for the single primary CTA per section

### COLOR
- 1 accent hue on black/gray: bg `#0D0D0D`/`#130D0C`, text white/`#AAA`, accent `#FF5552→#F62623` (tight 2-stop red-orange)
- Light theme is dead code
- **Glow mechanics with zero glow-CSS**: (1) full-bleed PNG pinned behind the page; (2) looping "portal" MP4 with `mix-blend-mode: color-dodge` over near-black — only the video's highlights bloom through, a living light-portal effect; (3) same video reused behind the CTA at `bg-black/50`; (4) inset white rim-light shadows on pills
- Red touches only interactive elements — never headings, icons, body

### STANDOUT
1. **Video-as-glow via `mix-blend-color-dodge`** — real footage blended onto black so only highlights survive; richer than any static radial gradient, no glow-specific CSS
2. **Size-linked negative tracking system** applied identically across both component sets — a genuine typographic scale
3. **One glass-card formula, fractally reused** for cards, testimonials, and icon badges — a single premium texture token

---

## lumen

### STACK
- Vite + React 18 + TS + SWC; shadcn vendored; **framer-motion 12.23.6 actively used**
- Tailwind 3.4.11 + `tailwindcss-animate`; CVA
- Fonts: Plus Jakarta Sans (400–800) + Manrope (400–800)
- Craft surface tiny: Navbar, HeroSection, CoreFeaturesSection, FeatureCard carry the whole design

### MOTION
- Hero entrance: container `staggerChildren: 0.2, delayChildren: 0.3`; children `opacity 0→1, y: 30→0, duration: 0.6`
- Feature grid reuses the variants gated by scroll: `whileInView="visible"`, `viewport={{once: true, amount: 0.3}}` — no hand-rolled IO, no parallax
- Hover: whole-card `hover:scale-105 transition-transform duration-300`; arrow icon `opacity-0 group-hover:opacity-100`; headline swaps to gradient text-fill on hover (`group-hover:bg-gradient-audio group-hover:bg-clip-text group-hover:text-transparent`)
- CTA `hover:shadow-hero` — hover raises a colored drop shadow
- Hamburger: 3 bars via explicit variants — `translateY(±8) → rotate(±45deg)` staggered 0.1/0.2s; menu panel height-animates via CSS custom property, `duration: 0.4`
- Background video: `saturate-0` + `scale-120 -translate-y-[20%]` + `mix-blend-mode: color` tint layer — video as texture, not spectacle

### CARDS
- **Not** rounded-rect divs: FeatureCard uses a custom SVG (`feature-card-bg.svg`) as backgroundImage — a die-cut/notched silhouette (top-right corner cut into a circular tab) filled `#F7F5F9`
- Fixed media zone (`h-[236px] m-4`) isolates product image from text — consistent rhythm regardless of aspect ratio
- Icon tiles: inline radial gradients (`#9E91FF 4% → #4931FF 64%`) + **hard unblurred offset shadow** `12.7px 12.7px 12.7px rgba(0,0,0,0.1)` — deliberately not Tailwind soft shadows; sticker/neo-brutalist pop
- Cards fire scale + arrow reveal + headline gradient-fill together on hover

### SECTION-DIVISION
- `px-6 sm:px-12 lg:px-16` (hero), `lg:px-[100px]` (features) — arbitrary value breaks the scale for one section
- `py-16 lg:py-20` / `py-12 lg:py-20`; hero `pt-[125px]` clears the fixed navbar precisely
- Division via solid swaps between near-identical near-blacks (`hsl(240 20% 4%)` vs `#060613`) — no borders or shadows; only hard rule is navbar's `border-b border-hero-text/10`

### HIERARCHY
- No literal eyebrow
- H1 `text-4xl…xl:text-7xl font-extrabold`; H2 `lg:text-[40px] font-extrabold` (arbitrary 40px breaks scale)
- **Font-pairing as hierarchy**: headings always Plus Jakarta extrabold, body always Manrope normal/relaxed — two typefaces, not just weight jumps
- Accent rule: one phrase per hero headline gets `bg-gradient-text bg-clip-text text-transparent` — gradient-fill text is the sole emphasis mechanism

### COLOR
- Near-black monochrome throughout; exactly one light surface in the system: `--card-light: 270 14% 97%` used only as the FeatureCard SVG fill — a deliberate single break from the dark canvas
- Two reserved gradients, each scoped to one moment: `--gradient-text` (white → violet → gold) on the hero emphasis phrase; `--gradient-audio` (magenta → teal) on card-title hover; ad-hoc purple radial only on icon tiles — never on buttons or backgrounds
- Accent token defined but unused — reserved headroom

### STANDOUT
- Video-as-texture: desaturated full-bleed video re-tinted via `mix-blend-mode: color` — raw footage becomes an on-brand monochrome backdrop
- Bespoke die-cut card silhouette via SVG background — the one light surface has a distinct, branded shape
- Gradient economy: 2-3 gradients total, each hard-scoped to a single emphasis moment
- Hard offset zero-blur drop-shadows for a stickered, tactile finish

---

## forge

### STACK
- Vite + React 18 + TS, shadcn/Radix, Tailwind 3.4 + `tailwindcss-animate`
- No motion library — **hand-rolled, and barely rolled**: only interactivity is a `useState` accordion + a chevron `transition-transform`
- Full shadcn scaffold mounted but the page uses zero shadcn components — 5 hand-coded section divs
- `App.css` dead code

### MOTION
- **No scroll-reveal mechanism at all.** No IO, no live animate-in classes, no stagger, no hero entrance
- No parallax, marquee, or count-up
- Sole "motion" is **autoplaying looped background video** ×3 (hero, about, gallery-CTA — Cloudinary MP4s) doing the work JS/CSS would normally do
- Two hover states total, both unquantified Tailwind defaults: `hover:bg-white/20 transition-all` (nav pills), `hover:bg-gray-100 transition-all` (CTA)
- Accordion content snaps (conditional render, no height/opacity transition); the defined accordion keyframes belong to the unused Radix version

### CARDS
- No classic card grid. The one card-like element: Gallery CTA panel — `bg-glass-gradient backdrop-blur-[10px] rounded-2xl lg:rounded-3xl border border-white/20 shadow-[0px_24px_32px_rgba(0,0,0,0.05)]` over video
- Hero feature pills reuse the identical glass recipe with `rounded-full`
- `bg-glass-gradient` custom token: `linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.15))` — near-invisible sheen that catches edges against dark video
- No hover-lift, tilt, or image-zoom

### SECTION-DIVISION
- Flat black blocks + 1px hairlines: `border-t border-b border-white/5`
- Padding large and airy: gallery `py-[100px] lg:py-[200px]`, location `py-[188px]`, about `pt-12 lg:pt-20`, footer `py-20`
- Hero full-bleed `h-screen min-h-[900px]` with `bg-black/25` scrim over video

### HIERARCHY
- Consistent eyebrow: `text-white/50 text-xs font-dm-mono font-medium uppercase tracking-wider-2` verbatim across every section — monospace uppercase letter-spaced label is the sole hierarchy signal above every headline
- Custom tracking token `wider-2: '0.48px'` defined once, reused everywhere
- Display `text-4xl md:text-[88px]` uppercase (hero) → `text-3xl lg:text-[48px]` (sections) → body `text-sm`/`text-xs`
- Two-family system: Space Grotesk display/body, DM Mono exclusively for eyebrows/metadata
- 88px display vs 12-14px body, no intermediate sizes — poster-like

### COLOR
- **Zero hue.** Black backgrounds, white/black text, opacity-scaled white (`white/50`, `/[0.08]`, `/[0.05]`, `/20`, `/65`, `/75`) for depth instead of hue
- One gradient total (glass sheen), only on glass surfaces
- All "color" comes from imagery/video

### STANDOUT
- **Video-as-motion substitution**: three looping background videos supply all kinetic energy — zero JS animation code, expensive-feeling result
- **Monochrome + glass discipline**: one reusable glass recipe on every elevated surface gives cohesion without any accent color
- **Eyebrow/mono-label system**: the repeated DM Mono label does more "premium" work than any actual motion

---

## neon

### STACK
- Vite + React 18 + TS, Lovable export, Tailwind 3 HSL-var theme + shadcn scaffolded but **unused** — every section is hand-authored raw markup
- No motion library, no IntersectionObserver, no scroll-linked state anywhere (verified)
- Fonts: Space Grotesk (300–700) + DM Mono (400/500)

### MOTION
- No scroll-reveal, stagger, hero entrance, marquee, parallax, or count-up. Nothing animates on entrance
- Only motion: hover transitions at Tailwind defaults (`hover:bg-white/20 transition-all`, `hover:bg-gray-100`); accordion chevron `transition-transform` + conditional `rotate-180`
- All "life" comes from four full-bleed autoplay Cloudinary videos (Hero/Overview/Gallery/About)

### CARDS
- No bordered white boxes. Two idioms:
  1. **Glassmorphism panel**: `bg-glass-gradient backdrop-blur-sm rounded-3xl border border-white/20 shadow-lg` (overview quote card, hero pills, gallery CTA) — always floated over video
  2. **Hairline seam grid**: feature cells in a `bg-black/5 gap-px` wrapper, each cell `flex-1 bg-white` — 1px gaps produce dividing hairlines so six tiles read as one continuous table, not six boxes

### SECTION-DIVISION
- No color-block alternation — whitespace + hairlines: `border-t border-b border-black/[0.05]`; faint `bg-black/[0.02]` tint on Gallery/Footer
- Extreme non-standard padding: `py-[200px]` (Overview), `py-[100px] lg:py-[200px]` (Gallery), `py-20` (Footer)
- Hero `h-screen min-h-[900px]`, content pinned bottom via `justify-end`

### HIERARCHY
- Eyebrow: `text-xs font-dm-mono font-medium uppercase tracking-wider-2` at `text-black/50` or `text-white/65` on every section; `tracking-wider-2` = 0.48px custom token
- Display huge, uppercase, deliberately **font-normal**: hero H1 `text-4xl md:text-[88px] md:leading-[84.48px] tracking-tight`; sections `md:text-[48px] leading-[51.84px]`; stats `md:text-[40px]`
- Body switches family entirely (system `font-sans` at `text-sm leading-[19.04px] text-black/75`) — sharp display/body contrast
- Figma-precise line-heights throughout (19.04, 51.84, 84.48, 38.40px)

### COLOR
- Monochrome, opacity-modulated black/white only; shadcn palette unused
- Page background light/white; "dark" register only inside video zones via `bg-black/25` overlay
- Only gradient is the glass sheen
- Color fully delegated to the videos; UI chrome stays neutral

### STANDOUT
- **Video-as-color-system**: four AI-generated autoplay videos stand in for imagery AND palette — the monochrome shell exists to let footage carry all interest
- **Glass-over-video motif ×3**: one disciplined recipe, not one-off effects
- **Huge uppercase font-normal display + Figma-precise arbitrary line-heights** — editorial/technical feel with almost zero motion craft

---

## dental-landing-page

### STACK
- Plain hand-rolled HTML/CSS/JS, single 804-line `index.html`, no framework, no motion library; Vite as dev server only
- Plus Jakarta Sans 400–700
- Actually a **single full-viewport hero** — `#viewport{position:fixed;inset:0}`; the body never scrolls

### MOTION
- No scroll-reveal/stagger (nothing to scroll), no count-ups, marquee, parallax, no entrance choreography
- Background: looping muted autoplay `<video>` rather than static image
- Hover/drawer transitions only: drawer `opacity 0.25s ease`; nav-link `opacity .2s`; buttons `background-color 0.2s`
- One piece of real interaction logic: a JS-computed connector line that recalculates endpoint coordinates by trig on resize to keep an annotation pinned to a moving marker

### CARDS
- No content cards. Closest analog: the floating "tip" annotation box — a glass callout with `container-type: size` (children scale in `cqw` units) and a border drawn as four corner `radial-gradient`s with `mask-composite: exclude` so the stroke glows at corners and fades mid-edge

### SECTION-DIVISION
- N/A (one section). Edge spacing via one shared token pair: `--edge-x: clamp(20px, 3.4vw, 48px)` / `--edge-y: clamp(20px, 4.8vh, 48px)` applied to every edge-anchored element

### HIERARCHY
- No eyebrow; rating cluster + annotation callout act as pre-headline anchors
- Display: `--title-fs: clamp(40px, 8.45vw, 120px)`, `line-height:.9`, `letter-spacing:-.04em`, 3 lines
- **Alternating line alignment**: `.title .l2{text-align:right}` breaks the headline into an asymmetric left/right/left silhouette composed against the photo

### COLOR
- Essentially monochrome: `#111`/`#000` stage, white text/UI, inverted-pill CTA. One accent total — amber `#FFCC6D` on the 5 rating stars only
- Only "gradient" is the corner-glow border fake on the tip box

### STANDOUT
- **Product-annotation callout tied to the photo**: tip box + connector line + frosted marker dot pointing at a specific tooth — an e-commerce annotation pattern transplanted onto a dentist hero; reads bespoke/editorial
- **Design-locked fluid math**: nearly every dimension is a `clamp()` or percentage citing literal source pixels (`left: 7.32%; /* 23/314 */`) — continuous scaling, no breakpoint snapping
- **Composition-aware copy**: the right-aligned second headline line interlocks with the model's face in the video — copy art-directed against the specific background asset
- Caveat: supplies no MOTION/CARDS/SECTION-DIVISION patterns — single-hero techniques only

---

## grasssite (direct skim)

- Vite + Three.js (`src/scene.js`, 354 lines) — a 3D hero scene; `nav.js` 10 lines, `style.css` 344 lines with 6 transition/keyframe hits
- Bolt export (`.bolt/mcp.json`)
- Data point for the WebGL/3D archetype (axis 2/3 of WEBSITE-CATEGORIES.md): visual interest carried entirely by the rendered scene; DOM craft minimal
