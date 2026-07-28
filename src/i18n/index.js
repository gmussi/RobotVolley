/**
 * Lightweight in-game i18n — canvas UI resolves strings through t() each frame,
 * so changing language in Settings takes effect immediately.
 */
import { getItem, setItem } from "../platform/save.js";
import en from "./locales/en.js";
import de from "./locales/de.js";
import es from "./locales/es.js";
import ptBR from "./locales/pt-BR.js";
import ru from "./locales/ru.js";
import fr from "./locales/fr.js";
import it from "./locales/it.js";
import pl from "./locales/pl.js";
import ja from "./locales/ja.js";
import zhHans from "./locales/zh-Hans.js";

const SAVE_KEY = "robotvolley_locale";

/** Steam-common set for a successful indie sports game. */
export const LOCALES = [
  { code: "en", catalog: en },
  { code: "de", catalog: de },
  { code: "es", catalog: es },
  { code: "pt-BR", catalog: ptBR },
  { code: "ru", catalog: ru },
  { code: "fr", catalog: fr },
  { code: "it", catalog: it },
  { code: "pl", catalog: pl },
  { code: "ja", catalog: ja },
  { code: "zh-Hans", catalog: zhHans },
];

const byCode = Object.fromEntries(LOCALES.map((l) => [l.code, l]));

function detectLocale() {
  const saved = getItem(SAVE_KEY);
  if (saved && byCode[saved]) return saved;

  const nav = (typeof navigator !== "undefined" && (navigator.languages || [navigator.language])) || [];
  for (const raw of nav) {
    if (!raw) continue;
    const tag = String(raw);
    if (byCode[tag]) return tag;
    const lower = tag.toLowerCase();
    if (lower.startsWith("pt-br") || lower === "pt_br") return "pt-BR";
    if (lower.startsWith("zh")) return "zh-Hans";
    const base = tag.split("-")[0];
    if (base === "pt") return "pt-BR";
    if (byCode[base]) return base;
  }
  return "en";
}

export let locale = detectLocale();

const listeners = new Set();

function applyDocumentLang(code) {
  try {
    if (typeof document !== "undefined") {
      document.documentElement.lang = code === "zh-Hans" ? "zh-Hans" : code;
    }
  } catch {
    /* ignore */
  }
}

applyDocumentLang(locale);

/** Translate a key. Falls back to English, then the key itself. */
export function t(key, vars = {}) {
  const primary = byCode[locale]?.catalog;
  const str = primary?.[key] ?? en[key] ?? key;
  if (!vars || typeof str !== "string") return str;
  return str.replace(/\{(\w+)\}/g, (_, name) => (
    vars[name] != null ? String(vars[name]) : `{${name}}`
  ));
}

export function getLocale() {
  return locale;
}

export function getLocaleNativeName(code = locale) {
  return byCode[code]?.catalog?.["lang.name"] ?? code;
}

export function setLocale(code) {
  if (!byCode[code] || code === locale) return false;
  locale = code;
  setItem(SAVE_KEY, code);
  applyDocumentLang(code);
  for (const fn of listeners) {
    try { fn(code); } catch { /* ignore listener errors */ }
  }
  return true;
}

/** Cycle to the next/previous supported locale. */
export function cycleLocale(delta = 1) {
  const idx = LOCALES.findIndex((l) => l.code === locale);
  const next = LOCALES[(idx + delta + LOCALES.length) % LOCALES.length];
  setLocale(next.code);
  return next.code;
}

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Localized countdown for leaderboard reset timers. */
export function formatLocalizedCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return t("time.zero");
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return t("time.dh", { d, h });
  if (h > 0) return t("time.hm", { h, m });
  return t("time.ms", { m, s: s % 60 });
}
