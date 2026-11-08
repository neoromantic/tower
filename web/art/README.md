# Original splash art

`web/hero.png` is new original Tower artwork generated with explicitly selected
`openai/gpt-image-2.6-flare` through the Images API. It replaces the previous
landing illustration. The exact prompt, safe response routing metadata,
generation ID, dimensions and hashes are in [splash-provenance.json](splash-provenance.json).

`icon-192.png` and `icon-512.png` are deterministic center-crop derivatives of
that generated source, used by the installable PWA. Older `hero-source.jpg` and
`dither.py` are historical source/tooling for the previous illustration and do
not generate the current splash.

Gameplay graphics are separate [complete style packs](../../docs/style-packs.md).
