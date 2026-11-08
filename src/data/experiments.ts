// The words around the experiments (each one's own words are in
// src/content/experiments/).
const intro = "Small tools that run in your browser.";
// The lede's first sentence also gives the licence, once for every row.
const opener = "Small tools that run in your browser, open source under MIT.";
const policy = "All but Mail check are blocked from connecting anywhere.";

export const experiments = {
  title: "Experiments",
  // The page's lede. With the day of the oldest check (scripts/experiments-
  // csp.mjs) when every tool's live security policy reads as expected (none,
  // and mail's DNS lookup or none); just the first sentence when one
  // doesn't, or wasn't checked.
  lede: (day?: string) =>
    day ? `${opener} ${policy} Checked ${day}.` : opener,
  // The page's description and the terminal card: like the lede, the
  // policy sentence only when the check holds, but without a date.
  description: (day?: string) => (day ? `${intro} ${policy}` : intro),
  // The social card (public/og-experiments.png) is a committed image that
  // can't follow the check, so it and its alt text make no claim.
  intro,
};
