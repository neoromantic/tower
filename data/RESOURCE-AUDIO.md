# Original audio and text resources

`tools/sound_resources.py` creates all audio and text in memory using Python's
standard library. It reads no media files and requires no network or packages.
The sounds, short musical motifs, movie titles and dialog wording were authored
for this resource set. No recordings, samples, melodies, dialog prose or movie
titles were extracted from the original game. Resource IDs and text slot layouts
follow the engine interfaces in `audio_events.h`, `audio.c` and `strings.c`.
The generated resources are provided under the repository's license.

## Generation

Run the resource pack generator from the repository root:

```sh
python3 tools/generate_resources.py
```

The pack generator imports `SOUNDS` and `TEXTS` from `sound_resources`:

- `SOUNDS`: integer resource ID to complete RIFF/WAVE bytes, packed as type
  `0xFF0A`. All 37 distinct IDs in `audio_events.h` and the 15 cinema IDs
  `0xA329` through `0xA337` are included (52 clips).
- `TEXTS`: `(type, resource ID)` to bytes. IDs include the `0x8000` ordinal flag.
  Nine `0xFF06` Pascal string tables and eighteen `0x8005` Win16 dialog templates
  supply original wording for every current `exe_str` and `exe_dlg_text` lookup.
  Unused string indices are empty to preserve the engine's slot numbering.
  The tags `^0`, `$#000` and `$^000` retain their substitution meanings.

To export a single clip for listening without creating a resource pack:

```sh
PYTHONPATH=tools python3 -c 'from pathlib import Path; from sound_resources import SOUNDS; Path("arrival.wav").write_bytes(SOUNDS[0x9771])'
```

## Sound design

All clips are mono, 16-bit little-endian PCM at 22,050 Hz, lasting 0.12 to
3 seconds. Synthesis uses sine oscillators, exponential decays and a per-ID
seeded integer noise sequence. Fixed inputs produce identical output on the same
Python/math runtime. Platform math rounding can affect the last PCM bit.
Each clip peaks at 18,000 of 32,767 to leave mixing headroom; short boundary
ramps prevent clicks. Fire and construction clips can repeat while held.

| Events | Original synthesis |
| --- | --- |
| Cash, lift arrival, toolbar, daily chimes, winter accent | Decaying metallic partials with distinct pitches and timing |
| Startup, celebrations, daily fanfares, party, cinema | Five-note original motif with per-ID rotations and pitch variation |
| Threat, armed device, fire outbreak | Pulsed frequency-modulated alerts |
| Blast, collapse, demolition, placement | Low noise and descending resonant impacts |
| Guards | Repeating short footfall thumps |
| Construction drag | Rapid percussive drill pulses |
| Fire | Filtered noise with seeded sharp crackles |
| Train, refuse truck, parking, lift departure | Modulated motor hum, rumble and rhythmic mechanical transients |
| Dining and retail | Nonverbal synthetic murmur and metallic clinks |
| Office | Short keyboard-like noise taps and a soft equipment tone |
| Hotel and apartments | Quiet filtered room noise and occasional soft taps |
| Day and evening seasonal accents | Sweeping bird/insect-like chirps |

These are intentionally stylized effects, not speech or realistic recordings.
Cinema themes are variations of the same original motif, not film excerpts.

## Verification

Validate coverage against `audio_events.h` plus the cinema ID range; decode each
WAV and measure its PCM energy, peak and boundary samples. Check repeat imports
for deterministic bytes and distinct hashes across clips. Feed the resources to
`audio_load_from_ne` and `exe_strings_init` to verify the actual SDL decoder,
mixer and string/dialog parsers; compare every exported text slot with the
parsed result. No proprietary resource file is needed for these checks.

## Browser realtime audio

The Three.js frontend synthesizes the same 52 semantic IDs directly through the
Web Audio API in `web/audio.js`. It uses original sine/noise/envelope synthesis,
not extracted samples. Category buses, gain, mute and visibility suspend the audio
context; fire and construction have start/stop loop callbacks. Native builds
continue using the bundled WAV clips above.
