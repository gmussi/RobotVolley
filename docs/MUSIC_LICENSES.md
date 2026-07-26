# Music licensing

Verified **2026-07-26**. Match background tracks are sourced from Pixabay under the
[Pixabay Content License](https://pixabay.com/service/license-summary/).

## Shipped match tracks

| In-game file | Pixabay source | Author | Pixabay ID |
|--------------|----------------|--------|------------|
| `src/assets/audio/music_match_a.mp3` | Technology Synth Pop | MoodMode | [165429](https://pixabay.com/music/electronic-technology-synth-pop-165429/) |
| `src/assets/audio/music_match_b.mp3` | Pop Synth Background Music | petrushkasound | [465681](https://pixabay.com/music/electronic-pop-synth-background-music-465681/) |

Original downloads (repo root, encoding sources):

- `moodmode-technology-synth-pop-165429.mp3`
- `petrushkasound-pop-synth-background-music-465681.mp3`

Encoded for shipping via `tools/encode_match_music.sh` (128 kbps MP3).

## Not third-party music

- **Menu loop** — procedural (`src/audio/procedural.js` → `makeMenuLoop`)
- **Victory stinger** — procedural (`makeVictoryStinger`)
- **All SFX** — procedural WAV exports (`tools/gen_audio.mjs` / `src/audio/procedural.js`)

## Pixabay Content License — game use

Permitted for Robot Volley (paid Steam release):

- ✓ Free use, including commercial
- ✓ Modification/adaptation (re-encoding, in-game looping/mixing)
- ✓ No attribution required (credited in-game anyway — see `src/data/credits.js`)

Prohibited uses that do **not** apply here:

- ✕ Selling/distributing the raw audio **standalone** (we ship it embedded in the game)
- ✕ Trademark/logo misuse (instrumental tracks, no recognisable brands)

If either track is ever replaced, update this file and `src/data/credits.js`.
