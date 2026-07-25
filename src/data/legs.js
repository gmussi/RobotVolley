/** Robot leg loadouts — `normal` is the standard part; the rest are accessories. */

export const LEG_TYPES = {
  normal: { label: "Robot", description: "Normal jump" },
  power: { label: "Power", description: "Jump higher" },
  rocket: {
    label: "Rocket",
    description: "Many small jumps — tap repeatedly, like Flappy Bird",
  },
};

export const LEG_TYPE_IDS = Object.keys(LEG_TYPES);
