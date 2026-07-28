/**
 * Player-facing item model — what the lottery hands out.
 *
 * Two categories:
 *   ACCESSORY — replaces one body slot's standard part, art and gameplay both.
 *               A robot carries AT MOST ONE. Equipping a new accessory reverts
 *               the previous accessory's slot back to its standard part, so a
 *               head accessory followed by a leg accessory leaves a standard
 *               head and accessorised legs.
 *   WEAPON    — changes the attack only. Never replaces a body part visually,
 *               and is carried independently of the accessory.
 *
 * Labels/descriptions come from the per-slot spec modules so the item list and
 * the physics can't drift apart. Adding an accessory for a new slot is a matter
 * of adding an entry here plus its spec in the matching module.
 */
import { HEAD_TYPES } from "./heads.js";
import { LEG_TYPES } from "./legs.js";
import { ARM_TYPES } from "./arms.js";
import { t } from "../i18n/index.js";

/** Slot key each accessory occupies -> the robot field it drives. */
export const SLOT_FIELD = {
  head: "headType",
  torso: "torsoType",
  legs: "legType",
};

/** What a slot falls back to when no accessory occupies it. */
export const STANDARD_PART = {
  head: "standard",
  torso: "standard",
  legs: "normal",
};

/**
 * The starter weapon. Every robot carries a weapon from the opening whistle —
 * this one — so the weapon slot is never empty and it sits in the lottery pool
 * like any other, which means a later roll can hand it back.
 */
export const BARE_HANDS = "hand";
export const DEFAULT_WEAPON = BARE_HANDS;

export const ACCESSORIES = {
  drill: { label: "Drill Head", slot: "head", description: HEAD_TYPES.drill.description },
  magnet: { label: "Magnet Head", slot: "head", description: HEAD_TYPES.magnet.description },
  power: { label: "Power Legs", slot: "legs", description: LEG_TYPES.power.description },
  rocket: { label: "Rocket Legs", slot: "legs", description: LEG_TYPES.rocket.description },
  // The tank is one machine, so it takes the torso as well as the legs. The
  // legs slot leads because that is where its art and its stats live.
  tank: {
    label: "Tank Body",
    slots: ["legs", "torso"],
    description: LEG_TYPES.tank.description,
  },
};

/**
 * Body slots an accessory occupies. Most replace a single part; the tank
 * replaces the whole lower body, so entries may declare `slots` instead.
 */
export function accessorySlots(id) {
  const entry = ACCESSORIES[id];
  if (!entry) return [];
  return entry.slots ?? [entry.slot];
}

export const WEAPONS = {
  hand: { label: "Energy Orb", description: ARM_TYPES.hand.description },
  axe: { label: "Axe", description: ARM_TYPES.axe.description },
  ninjaStar: { label: "Ninja Star", description: ARM_TYPES.ninjaStar.description },
  portalGun: { label: "Portal Gun", description: ARM_TYPES.portalGun.description },
};

export const ACCESSORY_IDS = Object.keys(ACCESSORIES);
export const WEAPON_IDS = Object.keys(WEAPONS);

/**
 * Which drawPartPreview() slot renders this item's icon. Accessories preview as
 * the part they replace; weapons preview as their own prop art.
 *
 * Weapons use "weaponType" rather than "armType" on purpose: an armType preview
 * of the starter falls back to the bare arm sprite, since on court the starter
 * is drawn as no held prop at all. The weapon slot wants the orb icon instead.
 */
export function itemPreviewSlot(kind, id) {
  if (kind === "weapon") return "weaponType";
  return SLOT_FIELD[accessorySlots(id)[0]] ?? "headType";
}

export function itemLabel(kind, id) {
  if (!id) return t("item.none");
  const key = `item.${id}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return (kind === "weapon" ? WEAPONS : ACCESSORIES)[id]?.label ?? id;
}

export function itemDescription(kind, id) {
  if (!id) return "";
  const key = `item.desc.${id}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return (kind === "weapon" ? WEAPONS : ACCESSORIES)[id]?.description ?? "";
}
