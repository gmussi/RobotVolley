/** Prefer MP3 for music (Safari); OGG for SFX. */
const MUSIC_FORMAT_ORDER = ["mp3", "ogg", "wav"];
const SFX_FORMAT_ORDER = ["ogg", "mp3", "wav"];

/**
 * @param {AudioContext} ctx
 * @param {Partial<Record<string, string>>} urls
 * @param {string[]} [formatOrder]
 * @returns {Promise<AudioBuffer|null>}
 */
export async function decodeAsset(ctx, urls, formatOrder = SFX_FORMAT_ORDER) {
  for (const ext of formatOrder) {
    const url = urls[ext];
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      /* try next format */
    }
  }
  return null;
}
