import { AsyncLocalStorage } from "async_hooks";

/** Per-request identity: the signed-in user's Azure DevOps access token. */
export interface RequestContext {
  accessToken: string;
}

/**
 * SCALE: state lives only in the request's async scope, never in module
 * variables, so any replica can serve any request and concurrent users cannot
 * see each other's tokens.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Returns the current user's token or throws when called outside an authenticated request. */
export function getRequestToken(): string {
  const store = requestContext.getStore();
  if (!store) throw new Error("No authenticated request context: sign in required");
  return store.accessToken;
}
