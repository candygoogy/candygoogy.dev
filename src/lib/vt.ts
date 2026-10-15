import { featuredProject } from "../data/site";

// The View Transition names are per project (two of the same name would
// cancel the transition). The featured project keeps the plain names; any
// other project's elements carry data-vt, which ProjectNames styles.
export const vtAttr = (id: string) =>
  id === featuredProject ? {} : { "data-vt": id };

// The band heading's id: one band per page, named for its project.
export const bandTitleId = (id: string) =>
  id === featuredProject ? "band-title" : `band-title-${id}`;
