"""Original procedural sound and text resources; see data/RESOURCE-AUDIO.md."""

import io
import math
import struct
import wave

# Resource ID: (timbre, seconds, fundamental Hz). No sampled source material.
SPECS = {
    0xA71D: ("bell", .48, 1320),       # income: bright coin pair
    0xA714: ("impact", .85, 54),       # explosion
    0xA71F: ("melody", .9, 440),       # event resolved
    0xA719: ("fire", 2, 70),           # held fire crackle
    0xA713: ("alarm", .85, 330),       # threat
    0xA710: ("alarm", .65, 220),       # armed
    0xA716: ("alarm", 1.2, 660),       # fire outbreak
    0xA718: ("melody", 2.4, 523.25),   # celebration
    0x88E8: ("motor", 1.8, 65),        # refuse truck
    0xA71E: ("steps", .8, 135),        # guard footsteps
    0x9771: ("bell", .55, 880),        # elevator arrival
    0x9772: ("motor", .45, 180),       # elevator door / departure
    0xA71A: ("motor", 2.5, 95),        # rail rumble
    0x938C: ("bell", 1, 1046.5),       # morning chime
    0x938D: ("melody", 1.8, 392),      # special morning
    0x938B: ("melody", 1.4, 493.88),
    0x9388: ("melody", 1.4, 349.23),   # new day
    0x9389: ("melody", 1.7, 587.33),
    0x938A: ("bell", 1.5, 392),        # evening
    0x9B58: ("impact", .22, 180),      # construction stamp
    0x9B59: ("drill", 1, 48),          # held construction tool
    0x9B5A: ("bell", .12, 740),        # tool selection
    0xA715: ("impact", .7, 75),        # alternate collapse
    0x9B5B: ("impact", .4, 110),       # demolition
    0xCE20: ("melody", 2.8, 329.63),   # startup
    0x8568: ("dining", 3, 245),
    0x8569: ("dining", 3, 295),
    0x85A8: ("office", 3, 185),
    0x8629: ("room", 3, 220),
    0x8628: ("room", 3, 165),
    0x8668: ("dining", 3, 350),
    0x86A8: ("motor", 3, 45),
    0x86A9: ("motor", 3, 58),
    0x8B28: ("melody", 3, 261.63),     # party music
    0xA71C: ("birds", 3, 1600),        # daytime accent
    0xA71B: ("birds", 3, 2400),        # evening insects
    0xA712: ("bell", 2, 1568),         # winter bells / visitor cue
}
for movie in range(15):
    SPECS[0xA329 + movie] = ("melody", 3, 196 * 2 ** (movie / 12))

SOUNDS = {}
RATE = 22050
for rid, (kind, duration, frequency) in SPECS.items():
    frames = int(RATE * duration)
    samples = []
    state = rid
    low = 0.0
    for i in range(frames):
        t = i / RATE
        phase = 2 * math.pi * frequency * t
        state = (1664525 * state + 1013904223) & 0xFFFFFFFF
        noise = state / 2147483648 - 1
        low = .94 * low + .06 * noise
        if kind == "bell":
            beat = t % .24
            s = math.exp(-beat * 14) * (math.sin(phase) + .3 * math.sin(phase * 2.76))
            s *= math.exp(-t * 2)
        elif kind == "melody":
            # Original five-note motif, rotated by resource ID; no quoted tune.
            note = int(t / .3)
            interval = (0, 7, 3, 10, 12)[(note + rid) % 5]
            p = phase * 2 ** (interval / 12)
            s = (math.sin(p) + .22 * math.sin(p * 2)) * math.exp(-(t % .3) * 9)
        elif kind == "alarm":
            p = phase + 16 * math.sin(2 * math.pi * 3 * t)
            s = math.sin(p) * (.35 + .65 * math.sin(2 * math.pi * 4 * t) ** 2)
        elif kind == "impact":
            s = (3 * low + math.sin(phase / (1 + 6 * t))) * math.exp(-t * 12 / duration)
        elif kind == "steps":
            beat = t % .32
            s = (low * 4 + .4 * math.sin(phase)) * math.exp(-beat * 65)
        elif kind == "drill":
            s = (noise * .35 + math.sin(phase)) * math.exp(-(t % .055) * 80)
        elif kind == "fire":
            s = low * 2 + noise * .08
            if state % 1301 < 8:
                s += noise * 2
        elif kind == "motor":
            s = (.55 * math.sin(phase + 7 * math.sin(t * 3)) + 2 * low)
            s *= .6 + .4 * math.sin(t * 9) ** 2
            s += .18 * noise * math.exp(-(t % .19) * 45)
        elif kind == "birds":
            p = phase + 22 * math.sin(t * 13)
            s = math.sin(p) * math.exp(-(t % .43) * 25) + .12 * low
        elif kind == "dining":
            s = (.35 * math.sin(phase + 5 * math.sin(t * 7)) + low)
            s *= .3 + .7 * math.sin(t * 5) ** 2
            s += .2 * math.sin(phase * 9.3) * math.exp(-(t % .71) * 65)
        elif kind == "office":
            s = low * .4 + noise * math.exp(-(t % .137) * 170)
            s += .12 * math.sin(phase) * math.exp(-(t % 1.3) * 8)
        elif kind == "room":
            s = low + .1 * math.sin(phase) * math.sin(t * 3) ** 4
            s += .25 * noise * math.exp(-(t % .91) * 120)
        # Short boundary ramps suppress clicks, including on the held loops.
        s *= min(1, i / 220, (frames - 1 - i) / 220)
        samples.append(s)
    scale = 18000 / max(abs(s) for s in samples)
    pcm = struct.pack("<" + "h" * frames, *(round(s * scale) for s in samples))
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setparams((1, 2, RATE, frames, "NONE", "not compressed"))
        wav.writeframes(pcm)
    SOUNDS[rid] = output.getvalue()

# Indexed by the existing engine's text slots. Empty slots are unused.
TABLES = {
    0x190: ["Express lift", "Passenger lift", "Service lift"],
    0x1A4: [
        "The Glass Orchard", "Letters from Orbit", "Midnight Tram",
        "Cloud Harbor", "The Last Lighthouse", "Under Copper Skies",
        "The Clockmaker's Map", "Small Planet, Long Weekend", "Paper Comet",
        "A Table for Tomorrow", "The Quiet Expedition", "Lantern District",
        "Winter on Platform Nine", "Neighbors of the Moon", "The Blue Stair",
    ],
    0x2BC: ["", "", "Honored guest"],
    0x2BD: ["", "", "", " - heading out for a meal"],
    0x2C6: [""] * 47 + ["Fire damage"],
    0x3EB: [""] * 24,
    0x3EC: ["Select Resume before adjusting lift settings."],
    0x3ED: [""] * 7,
    0x3EF: ["Office rent received", "Hotel takings received", "Apartment sale completed",
            "Restaurant takings received", "Fast food takings received", "Shop takings received",
            "Cinema takings received", "Event hall takings received"],
}
TABLES[0x3EB][6] = "Construction exceeds the available funds."
TABLES[0x3EB][23] = "This shaft has reached its car limit."
TABLES[0x3ED][3] = "Choose a name of 15 characters or fewer."
TABLES[0x3ED][6] = "The building can have 20 named tenants."

DIALOGS = {
    0xBB8: ["Understood", "An honored guest booked the suite on floor ^0."],
    0xBB9: ["Welcome", "Your honored guest has arrived."],
    0xBBA: ["Excellent", "Your guest has departed.", "The visit earned a favorable review."],
    0xBBB: ["The guest left disappointed. Improve their stay before the next visit.", "Understood"],
    0xBC3: ["Fire on floor ^0. Keep evacuation routes clear."],
    0xBC4: ["Dispatch an aerial fire crew for $#000?", "Dispatch", "Use guards"],
    0xBC5: ["The fire is out. Check the damaged floors and rebuild where needed.", "Inspect"],
    0xBC6: ["Building security is working to contain the fire.", "Understood"],
    0xBCC: ["Send guards", "Pay ransom", "A bomb threat has arrived. The demand is $#000; the deadline is 3 o'clock."],
    0xBCE: ["Guards are searching the building for the device. Time is short.", "Proceed"],
    0xBCF: ["The guards located the device and made it safe.", "Good news"],
    0xBD0: ["The search ran out of time. An explosion struck floor ^0.", "Inspect"],
    0xBD6: ["Your building has earned two stars. Keep growing!", "Continue"],
    0xBD7: ["Three stars awarded. Your building is becoming a destination.", "Continue"],
    0xBD8: ["Four stars awarded. A thriving community fills your tower.", "Continue"],
    0xBD9: ["Five stars awarded. Your tower is a city landmark.", "Continue"],
    0xBDA: ["The highest tower honor is yours. The whole building celebrates!", "Celebrate"],
    0xBE0: ["A lucky find", "Excavation uncovered a forgotten cache valued at $^000."],
}

TEXTS = {}
for rid, strings in TABLES.items():
    raw = bytearray((0, len(strings)))
    for text in strings:
        encoded = text.encode("ascii")
        raw += bytes((len(encoded),)) + encoded
    TEXTS[0xFF06, rid | 0x8000] = bytes(raw)
for rid, strings in DIALOGS.items():
    # Win16 dialog, no font, menu or class; static controls in lookup order.
    raw = bytearray(struct.pack("<IB4H", 0, len(strings), 0, 0, 240, 100))
    raw += b"\0\0\0"
    for index, text in enumerate(strings):
        raw += struct.pack("<5HI", 0, index * 12, 230, 12, index + 1, 0)
        raw += b"\x82" + text.encode("ascii") + b"\0\0"
    TEXTS[0x8005, rid | 0x8000] = bytes(raw)
