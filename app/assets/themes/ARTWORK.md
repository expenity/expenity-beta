# Theme artwork

`brick-cluster-v2.webp`: generated with the built-in image generation tool, then resized and encoded as a transparent WebP (960 × 640) for local/offline use. No runtime image generation or external image host is used.

Final generation prompt:

> Use case: product-mockup. Create a premium studio 3D-rendered decorative cutout of four colorful LEGO-style interlocking plastic building bricks floating separately in an airy diagonal composition. One classic bright red 2 by 4 brick with EXACTLY EIGHT raised round cylindrical studs in two rows of four, one vivid blue 2 by 2 brick with four studs, one golden yellow 2 by 4 brick with eight studs, one rich green 2 by 2 brick with four studs. Correct familiar toy-brick proportions, thick molded plastic body, real dimensional side walls, rounded edges, circular stud top faces and cylindrical sides clearly visible. Three-quarter isometric perspectives, varied gentle rotations, clean molded surfaces, beautiful glossy plastic with soft highlights and subtle self-shadowing. Each brick separate with wide clear gaps, no touching or overlapping. No flat rectangles, no watercolor, no engraved lettering or text, no extra objects, no app UI, no watermark. Transparent alpha background without floor or cast ground shadow. Balanced landscape composition, all four bricks entirely inside frame with generous transparent outer padding. High detail and polished lighting, cheerful primary colors.

Character generation was rejected. The reference drawings below are sourced images, not generated artwork.

## Vader portrait

`vader-portrait-v1.webp` is a resized/re-encoded copy of the image explicitly selected by the user:
- Creator: ZT_OSCAR
- Source: https://pixabay.com/illustrations/ai-generated-darth-vader-caricature-7914418/
- Source image: https://cdn.pixabay.com/photo/2023/04/10/18/43/ai-generated-7914418_1280.jpg
- Retrieved: 2026-10-17
- License: Pixabay Content License, https://pixabay.com/service/license-summary/ (full terms: https://pixabay.com/service/terms/)

This third-party image is NOT covered by the repository's GPL license. It is used as an integrated decorative app-theme asset, not as a standalone stock-image offering. Pixabay's license does not clear any separate third-party character/trademark rights. Preserve this source/license note with the asset. Display-only CSS makes it monochrome and blends its background; the supplied pose is not changed or represented as an actual holding/back pose.

## Colored-pencil brick revision

`brick-pencil-v3.webp` replaces the glossy rendered brick artwork in the active theme. Generated with the built-in image-generation tool and encoded as a transparent 1104 × 736 WebP. Original output is retained in the generation library; the optimized asset is bundled locally and cached offline.

Final prompt:

> Use case: illustration-story. Create finished artistic COLORED-PENCIL ILLUSTRATIONS of four familiar interlocking toy building bricks, each isolated with generous space between, for a playful mobile-app background. Hand-drawn traditional colored pencil and graphite on transparent alpha: clearly visible pencil grain, layered cross-hatching, delicate uneven graphite contours, warm expressive drawing, soft hand-shaded volume. NOT a photograph, NOT a glossy 3D render, NOT vector art, NOT flat rectangles. Subjects: red 2x4 brick with eight raised round studs in two rows of four; blue 2x2 brick with four studs; yellow 2x4 brick with eight studs; green 2x2 brick with four studs. Each has correct recognizable thick plastic brick proportions, visible side walls, and genuinely drawn cylindrical studs with elliptical tops. Varied gentle isometric angles. Rich but slightly muted primary colored-pencil pigments, soft charcoal edges, little pencil sketch marks close to each object only. Four separate objects in a loose airy composition, all completely inside frame, no overlap. Fully transparent empty background: no paper rectangle, no white backdrop, no glow, no scenery, no text, no branding, no watermark, no UI. High-quality editorial sketchbook illustration that remains charming and legible when displayed small.

## Mario and the user-selected Mickey/Minnie reference

- Mario theme: `mario-pencil-v4.png`, `goomba-pencil-v1.png`, `mushroom-pencil-v1.png`, `boo-pencil-v1.png`, `star-pencil-v1.png` are the five PNG illustrations supplied directly by the user on 2026-10-17. Copied without editing; original transparency retained. They replace the rejected colored vector and the provisional sourced Mario sketch. Original artist and general reuse license were not supplied. No GPL relicensing or independent reuse permission is asserted. Preserve this provenance note.
- `mickey-minnie-pencil-v1.webp`: the reference explicitly selected by the user, https://www.pinterest.com/pin/mickey-and-minnie-valentines-day-drawing--5348093303221313/, pin credited to Junior / junior_nbs. Original drawing authorship and any general reuse license are not established by the pin. Included at the user's direction for this theme; no GPL relicensing or independent reuse permission is asserted. Preserve the source reference and obtain the original artist's terms before independent reuse.
- Retrieved 2026-10-17. Both assets are local WebP files, not runtime Pinterest/Pixabay embeds. Preserve these provenance notes with the assets.

## Locally bundled fonts

Noto Sans, Noto Serif, Roboto, Roboto Slab, Open Sans, Fira Sans, Comfortaa, Alegreya, Literata and Geologica: obtained from the Google Fonts CSS API on 2026-10-17. Latin/Greek subsets at weights 400/700, unmodified WOFF2 files. Individual upstream license notices are bundled in fonts/. Fonts load locally and are cached offline; there is no runtime Google Fonts request.

`vader-cutout-v1.png` is the same portrait with its background removed (subject cutout made locally, no external service), used on the start screen. The source and license note above apply to it as well.

`minnie-cutout-v1.png` is the pencil drawing above with its white background removed (made locally), used on the start screen.
