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
  // Over the hero index, a shortlist of the featured projects.
  featuredTitle: "A few things I’ve built",
  // Over every project, in the terminal card (card.txt).
  indexTitle: "What I’ve built",
};

export const about = {
  background:
    "Most of what I’ve built started as a fix for a problem I had myself: something gets in my way, and I build the thing that moves it. A few started because a friend asked.",
  away: "Off the clock I read, get lost in anything to do with aeronautics, or just take it easy, and there’s usually a side project open somewhere.",
};

// The career timeline (About). Consecutive items with the same employer
// form one group under its logo chip; items without one form Education.
export interface WorkItem {
  // The dates as shown, e.g. "Mar 2024 to Dec 2025", or "Feb 2026 to now"
  // for the job going on now.
  when?: string;
  // Machine-readable start for <time>, e.g. "2026-02" (schools: the year
  // alone); its year heads the group.
  datetime?: string;
  // The kind of job, e.g. "Full-time".
  type?: string;
  title: string;
  org?: keyof typeof orgs;
  // The job going on now: its dot is filled with ink.
  current?: boolean;
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
    type: "Full-time",
    title: "IT Technician",
    org: "siel",
    current: true,
    detail:
      "IT infrastructure, rack builds and cabling, diagnostics, and the firm’s PCs.",
  },
  {
    when: "Mar 2024 to Dec 2025",
    datetime: "2024-03",
    type: "Freelance",
    title: "QA Tester",
    org: "gaijin",
    detail: "Remote. Pre-release builds, regression passes, and bug reports.",
  },
  {
    when: "2020 to 2024",
    datetime: "2020",
    title: "Bachelor’s degree in computer engineering",
  },
  {
    when: "2015 to 2020",
    datetime: "2015",
    title: "Technical diploma in information technology",
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

// The product that has the home page's band, the unprefixed View
// Transition names, and the first place in every list. Other products
// have a page of their own and a row in "More things I’ve made".
export const featuredProject = "fettle";
