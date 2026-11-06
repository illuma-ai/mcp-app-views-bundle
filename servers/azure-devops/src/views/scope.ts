/** The project and team scope of a view or form call (pure, shared by the server and the tests). */

/**
 * The project and team a form call works in: the ones the call names (plain names only), else the server
 * defaults; a named project without a team gets "<project> Team". The views resolve the scope the same way.
 */
export function resolveScope(args: { project?: string; team?: string }, config: { project: string; team: string }): { project: string; team: string } {
  const ok = (v: unknown): v is string => typeof v === "string" && /^[\w][\w .-]{0,63}$/.test(v.trim());
  const project = ok(args.project) ? args.project.trim() : config.project;
  const team = ok(args.team) ? args.team.trim() : project === config.project ? config.team : `${project} Team`;
  return { project, team };
}
