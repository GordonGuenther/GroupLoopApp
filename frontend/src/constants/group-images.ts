/** Placeholder in the SVGs below, replaced with the group's color. */
export const PRIMARY = '{{primary}}';

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#fff"/>${body}</svg>`;

/** Built-in group images, stored in a group as `default:<n>`. Black, white and `PRIMARY` only. */
export const DEFAULT_GROUP_IMAGES: Record<string, string> = {
  // Ball
  'default:1': svg(`
    <circle cx="128" cy="128" r="72" fill="${PRIMARY}" stroke="#000" stroke-width="8"/>
    <polygon points="128,98 156,118 145,150 111,150 100,118" fill="#000"/>
    <path d="M128 98V60M156 118l34-12M145 150l20 32M111 150l-20 32M100 118l-34-12" stroke="#000" stroke-width="8" stroke-linecap="round"/>`),
  // Music
  'default:2': svg(`
    <path d="M104 172V76l80-18v96" fill="none" stroke="#000" stroke-width="12" stroke-linejoin="round"/>
    <ellipse cx="88" cy="174" rx="24" ry="18" fill="${PRIMARY}" stroke="#000" stroke-width="8"/>
    <ellipse cx="168" cy="156" rx="24" ry="18" fill="${PRIMARY}" stroke="#000" stroke-width="8"/>`),
  // Mountains
  'default:3': svg(`
    <circle cx="190" cy="68" r="20" fill="none" stroke="#000" stroke-width="8"/>
    <polygon points="24,204 104,84 184,204" fill="${PRIMARY}" stroke="#000" stroke-width="8" stroke-linejoin="round"/>
    <polygon points="132,204 176,136 232,204" fill="#000"/>
    <polygon points="104,84 124,114 112,108 98,120 88,108" fill="#fff" stroke="#000" stroke-width="6" stroke-linejoin="round"/>`),
  // Book
  'default:4': svg(`
    <path d="M128 76c-24-14-56-16-84-10v124c28-6 60-4 84 10 24-14 56-16 84-10V66c-28-6-60-4-84 10z" fill="${PRIMARY}" stroke="#000" stroke-width="8" stroke-linejoin="round"/>
    <path d="M128 76v124" stroke="#000" stroke-width="8"/>
    <path d="M66 100h40M66 124h40M66 148h40M150 100h40M150 124h40M150 148h40" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`),
  // Coffee
  'default:5': svg(`
    <path d="M64 100h108v56a40 40 0 0 1-40 40h-28a40 40 0 0 1-40-40z" fill="${PRIMARY}" stroke="#000" stroke-width="8"/>
    <path d="M172 116h12a20 20 0 0 1 0 40h-14" fill="none" stroke="#000" stroke-width="10"/>
    <path d="M96 56c-8 10 8 18 0 28M122 56c-8 10 8 18 0 28M148 56c-8 10 8 18 0 28" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round"/>`),
  // Games
  'default:6': svg(`
    <rect x="40" y="88" width="176" height="96" rx="48" fill="${PRIMARY}" stroke="#000" stroke-width="8"/>
    <path d="M92 116v40M72 136h40" stroke="#000" stroke-width="10" stroke-linecap="round"/>
    <circle cx="164" cy="124" r="10" fill="#fff" stroke="#000" stroke-width="6"/>
    <circle cx="186" cy="148" r="10" fill="#000"/>`),
  // Bike
  'default:7': svg(`
    <circle cx="76" cy="160" r="36" fill="none" stroke="#000" stroke-width="10"/>
    <circle cx="180" cy="160" r="36" fill="none" stroke="#000" stroke-width="10"/>
    <path d="M76 160l36-60h52l16 60M112 100l24 60h-60M164 100l-4-16h-20" fill="none" stroke="${PRIMARY}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>`),
  // Camping
  'default:8': svg(`
    <circle cx="60" cy="64" r="14" fill="none" stroke="#000" stroke-width="6"/>
    <polygon points="128,56 212,196 44,196" fill="${PRIMARY}" stroke="#000" stroke-width="8" stroke-linejoin="round"/>
    <polygon points="128,120 156,196 100,196" fill="#000"/>
    <path d="M24 196h208" stroke="#000" stroke-width="10" stroke-linecap="round"/>`),
  // Pizza
  'default:9': svg(`
    <path d="M128 208L52 72a160 160 0 0 1 152 0z" fill="#fff" stroke="#000" stroke-width="8" stroke-linejoin="round"/>
    <path d="M52 72a160 160 0 0 1 152 0" fill="none" stroke="#000" stroke-width="18" stroke-linecap="round"/>
    <circle cx="110" cy="100" r="12" fill="${PRIMARY}"/>
    <circle cx="148" cy="96" r="12" fill="${PRIMARY}"/>
    <circle cx="128" cy="140" r="12" fill="${PRIMARY}"/>`),
  // Art
  'default:10': svg(`
    <path d="M128 48c-48 0-84 36-84 80s36 80 76 80c14 0 18-10 12-20s-2-24 14-24h24c26 0 38-18 38-40 0-44-36-76-80-76z" fill="#fff" stroke="#000" stroke-width="8"/>
    <circle cx="92" cy="112" r="12" fill="${PRIMARY}"/>
    <circle cx="120" cy="80" r="12" fill="#000"/>
    <circle cx="160" cy="84" r="12" fill="${PRIMARY}"/>
    <circle cx="92" cy="152" r="12" fill="#000"/>`),
  // Home
  'default:11': svg(`
    <polygon points="128,52 216,124 40,124" fill="${PRIMARY}" stroke="#000" stroke-width="8" stroke-linejoin="round"/>
    <rect x="64" y="124" width="128" height="80" fill="#fff" stroke="#000" stroke-width="8"/>
    <rect x="112" y="152" width="32" height="52" fill="${PRIMARY}" stroke="#000" stroke-width="6"/>
    <path d="M128 100c-6-10-22-6-18 6 3 8 18 16 18 16s15-8 18-16c4-12-12-16-18-6z" fill="#fff"/>`),
  // Sports
  'default:12': svg(`
    <rect x="44" y="104" width="24" height="48" rx="6" fill="#000"/>
    <rect x="188" y="104" width="24" height="48" rx="6" fill="#000"/>
    <rect x="68" y="88" width="28" height="80" rx="8" fill="${PRIMARY}" stroke="#000" stroke-width="6"/>
    <rect x="160" y="88" width="28" height="80" rx="8" fill="${PRIMARY}" stroke="#000" stroke-width="6"/>
    <rect x="96" y="120" width="64" height="16" fill="#000"/>`),
};
