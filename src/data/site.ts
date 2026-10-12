// Site-wide copy.
// Typographic quotes and apostrophes throughout (’ “ ”).

export const site = {
  name: "candygoogy",
  url: "https://candygoogy.dev",
  email: "hello@candygoogy.dev",
  github: "https://github.com/candygoogy",
  x: "https://x.com/candygoogy",
  discord: "https://discord.com/users/699600164180066376",
  telegram: "https://t.me/candygoogy",
  source: "https://github.com/candygoogy/candygoogy.dev",
  description:
    "I build software and websites. Fettle, a free check-up for Windows PCs, is the one I’m proudest of.",
};

export const hero = {
  headline: "I keep computers running, and build the tools I wish existed.",
  line: "I’m an IT technician by day. On my own time I build software and websites, and Fettle is the one I’m proudest of.",
  indexTitle: "What I’ve built",
};

export const about = {
  background:
    "Most of what I’ve built started as a fix for a problem I had myself: something gets in my way, and I build the thing that moves it. A few started because a friend asked.",
  away: "Off the clock I read, get lost in anything to do with aeronautics, or just take it easy, and there’s usually a side project open somewhere.",
};

export interface WorkItem {
  when: string;
  // Machine-readable start for <time>, e.g. "2026-02".
  datetime?: string;
  title: string;
  // For jobs: the employer, shown after "at" with its logo chip.
  org?: keyof typeof orgs;
  detail?: string;
}

// Employer logos, small and in their own colors; the name is always shown
// next to them. Sources: Siel Eolie's own site (sieleolie.com, icon-192.png,
// downscaled); Gaijin Entertainment's official site (gaijinent.com,
// /i/gaijin/logo.svg, unmodified; white, so it sits on a dark chip).
// url is where each employer's chip links.
export const orgs = {
  siel: { name: "Siel Eolie", url: "https://www.sieleolie.com/" },
  gaijin: { name: "Gaijin Entertainment", url: "https://gaijin.net/" },
} as const;

export const work: WorkItem[] = [
  {
    when: "Feb 2026 to now",
    datetime: "2026-02",
    title: "IT Technician",
    org: "siel",
    detail:
      "IT infrastructure, rack builds and cabling, diagnostics, and the firm’s PCs.",
  },
  {
    when: "Mar 2024 to Dec 2025",
    datetime: "2024-03",
    title: "QA Tester",
    org: "gaijin",
    detail: "Freelance and remote. Tested builds and reported bugs.",
  },
  {
    when: "University",
    title: "Bachelor’s degree in computer engineering",
    detail: "Three-year university degree.",
  },
  {
    when: "School",
    title: "Technical diploma",
    detail: "Information technology.",
  },
];

export const skills: { group: string; items: string }[] = [
  {
    group: "Systems",
    items: "Windows Server, Active Directory, Linux, Docker, PowerShell",
  },
  {
    group: "Networks",
    items: "MikroTik, Omada, VLANs, managed switching, WireGuard, Tailscale",
  },
  {
    group: "Code",
    items:
      "Rust, Python, Slint, TypeScript, Svelte, React, Vite, Tailwind, Astro, Cloudflare Workers, Claude Code, Codex",
  },
  {
    group: "Hands-on",
    items:
      "Electrical work, building and tuning PCs, structured cabling, racks",
  },
];

// The contact sentence, set as a statement (the question) and its answer.
export const contact = {
  question: "Have a project, a broken PC story, or a question about Fettle?",
  lead: "Write to me. I read everything and reply, though not always right away.",
};
