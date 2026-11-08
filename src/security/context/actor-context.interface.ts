/** Values injected by the trusted Gateway after stripping client-supplied copies.
 *  SECURITY: This context is only trusted when request comes through the API Gateway.
 *  The service must be deployed behind Kong (or equivalent) which strips X-User-* headers
 *  from client requests and re-injects them after JWT validation.
 *  In local development, the local-auth-proxy provides compatible headers.
 */
export interface ActorContext {
  userId: string;
  roles: string[];
  permissions: string[];
  /** Shop IDs this seller is associated with */
  shopScope: string[];
}

export const ACTOR_KEY = 'actor';
