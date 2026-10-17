// The words around the experiments (each one's own words are in
// src/content/experiments/).
const intro = "Small tools that run in your browser.";
const policy = "All but Mail check are blocked from connecting anywhere.";

export const experiments = {
  title: "Experiments",
  // The page's lede. With the day of the oldest check (scripts/experiments-
  // csp.mjs) when every tool's live security policy reads as expected (none,
  // and mail's DNS lookup or none); just the first sentence when one
  // doesn't, or wasn't checked.
  lede: (day?: string) => (day ? `${intro} ${policy} Checked ${day}.` : intro),
  // The page's description and the terminal card: like the lede, the
  // policy sentence only when the check holds, but without a date.
  description: (day?: string) => (day ? `${intro} ${policy}` : intro),
  // The social card (public/og-experiments.png) is a committed image that
  // can't follow the check, so it and its alt text make no claim.
  intro,
  credit: "Open source, MIT.",
};
