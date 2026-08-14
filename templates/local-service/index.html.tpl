<!--
  one-box / templates/local-service / index.html.tpl

  FROZEN L1 local-service starter skeleton. src/lib/builder.ts parameterizes
  this file — it never invents structure. Placeholders use mustache-lite
  double-curly section-dot-element tokens; builder.ts fills them from
  CopyDoc fields of the same name (see WAVE-NOTES-buildgate.md for the full
  field contract) or computes a raw-HTML block for composite placeholders
  (the hero media block, the list placeholders, the meta and jsonLd tags).

  Section visibility: each section below is wrapped in a same-line HTML
  comment pair naming it, SECTION colon id opening it and slash-SECTION
  colon id closing it (see the literal markers further down this file —
  not reproduced here with their own comment delimiters, since a nested
  "dash dash greater-than" would close THIS comment early). Nav anchor
  links use the equivalent NAVLINK-prefixed pair. builder.ts strips a
  marked block entirely when skeleton.sections does not include that
  section id, and keeps only the inner content (marker comments removed)
  when it does. nav/hero/contact/footer are always kept by the builder
  regardless of skeleton content, so the page never loses required chrome;
  every OTHER id is section-gated.

  Every editable node carries a data-edit-id attribute shaped
  "section.element" — the only selector the editor (edit_site) accepts.
-->
<!doctype html>
<html lang="en" class="no-js">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="generator" content="one-box" />
  <title>{{meta.title}}</title>
  <meta name="description" content="{{meta.description}}" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%23888'/%3E%3C/svg%3E" />
  <link rel="stylesheet" href="tokens.css" />
  <link rel="stylesheet" href="site.css" />
  <script>document.documentElement.classList.replace('no-js','js');</script>
  {{jsonLd}}
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>

  <!-- SECTION:nav -->
  <header class="site-header">
    <nav class="nav" aria-label="Primary">
      <a class="nav__logo" href="#top" data-edit-id="nav.logo">{{nav.logo}}</a>
      <ul class="nav__links">
        <!-- NAVLINK:services -->
        <li><a href="#services">Services</a></li>
        <!-- /NAVLINK:services -->
        <!-- NAVLINK:why-us -->
        <li><a href="#why-us">Why Us</a></li>
        <!-- /NAVLINK:why-us -->
        <!-- NAVLINK:reviews -->
        <li><a href="#reviews">Reviews</a></li>
        <!-- /NAVLINK:reviews -->
        <!-- NAVLINK:service-area -->
        <li><a href="#service-area">Service Area</a></li>
        <!-- /NAVLINK:service-area -->
        <!-- NAVLINK:contact -->
        <li><a href="#contact">Contact</a></li>
        <!-- /NAVLINK:contact -->
      </ul>
      <a class="nav__cta btn btn--ghost" href="{{nav.phoneHref}}" data-edit-id="nav.phone" aria-label="Call {{nav.phone}}">
        <span aria-hidden="true" class="icon icon--phone"></span>
        {{nav.phone}}
      </a>
    </nav>
  </header>
  <!-- /SECTION:nav -->

  <main id="main">

    <!-- SECTION:hero -->
    <section class="hero" id="top" aria-label="Introduction">
      <div class="hero__inner">
        <div class="hero__content" data-reveal="up">
          <h1 class="hero__headline" data-edit-id="hero.headline">{{hero.headline}}</h1>
          <p class="hero__sub" data-edit-id="hero.sub">{{hero.sub}}</p>
          <a class="btn btn--primary hero__cta" href="{{hero.ctaHref}}" data-edit-id="hero.cta">{{hero.cta}}</a>
        </div>
        {{hero.media}}
      </div>
    </section>
    <!-- /SECTION:hero -->

    <!-- SECTION:trust-bar -->
    <section class="trust-bar" aria-label="Trust indicators" data-reveal="up">
      <ul class="trust-bar__list">
        {{trust-bar.items}}
      </ul>
    </section>
    <!-- /SECTION:trust-bar -->

    <!-- SECTION:services -->
    <section class="section services" id="services" aria-labelledby="services-heading">
      <div class="section__inner">
        <p class="section__eyebrow" data-reveal="up">Services</p>
        <h2 class="section__heading" id="services-heading" data-reveal="up">{{services.intro}}</h2>
        <ul class="services__grid">
          {{services.items}}
        </ul>
      </div>
    </section>
    <!-- /SECTION:services -->

    <!-- SECTION:why-us -->
    <section class="section why-us" id="why-us" aria-labelledby="why-us-heading">
      <div class="section__inner">
        <p class="section__eyebrow" data-reveal="up">Why Us</p>
        <h2 class="section__heading" id="why-us-heading" data-reveal="up">{{why-us.intro}}</h2>
        <ul class="why-us__list">
          {{why-us.items}}
        </ul>
      </div>
    </section>
    <!-- /SECTION:why-us -->

    <!-- SECTION:reviews -->
    <section class="section reviews" id="reviews" aria-labelledby="reviews-heading">
      <div class="section__inner">
        <p class="section__eyebrow" data-reveal="up">Reviews</p>
        <h2 class="section__heading" id="reviews-heading" data-reveal="up">What people say</h2>
        <ul class="reviews__grid">
          {{reviews.items}}
        </ul>
      </div>
    </section>
    <!-- /SECTION:reviews -->

    <!-- SECTION:service-area -->
    <section class="section service-area" id="service-area" aria-labelledby="service-area-heading">
      <div class="section__inner service-area__inner">
        <div class="service-area__copy" data-reveal="up">
          <p class="section__eyebrow">Service Area</p>
          <h2 class="section__heading" id="service-area-heading">{{service-area.intro}}</h2>
          <ul class="area-list">
            {{service-area.items}}
          </ul>
        </div>
        <aside class="area-panel" data-reveal="up">
          <p class="area-panel__value">{{service-area.range}}</p>
          <p class="area-panel__note">Not sure if we reach you? Call and we&#39;ll tell you straight.</p>
          <a class="btn btn--ghost area-panel__cta" href="{{nav.phoneHref}}">{{nav.phone}}</a>
        </aside>
      </div>
    </section>
    <!-- /SECTION:service-area -->

    <!-- SECTION:contact -->
    <section class="contact-band" id="contact" aria-labelledby="contact-heading" data-reveal="up">
      <div class="contact-band__inner">
        <div>
          <h2 class="contact-band__heading" id="contact-heading" data-edit-id="contact.headline">{{contact.headline}}</h2>
          <p class="contact-band__sub" data-edit-id="contact.sub">{{contact.sub}}</p>
        </div>
        <div class="contact-band__actions">
          <a class="btn btn--primary" href="{{contact.ctaHref}}" data-edit-id="contact.cta">{{contact.cta}}</a>
          <a class="btn btn--ghost" href="{{contact.phoneHref}}" data-edit-id="contact.phone">
            <span aria-hidden="true" class="icon icon--phone"></span>
            {{contact.phone}}
          </a>
        </div>
      </div>
    </section>
    <!-- /SECTION:contact -->

  </main>

  <!-- SECTION:footer -->
  <footer class="site-footer">
    <div class="footer__inner">
      <div class="footer__brand">
        <p class="footer__business-name" data-edit-id="footer.business-name">{{footer.business-name}}</p>
        <p class="footer__tagline" data-edit-id="footer.tagline">{{footer.tagline}}</p>
      </div>
      <a class="footer__phone" href="{{footer.phoneHref}}" data-edit-id="footer.phone">{{footer.phone}}</a>
      <p class="footer__copyright">&copy; {{footer.year}} {{footer.business-name}}. All rights reserved.</p>
    </div>
  </footer>
  <!-- /SECTION:footer -->

  <script src="reveal.js"></script>
  <script src="gsap.min.js"></script>
  <script src="ScrollTrigger.min.js"></script>
  <script src="motion-runtime.js"></script>
</body>
</html>
