import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * JWT auth middleware – verifies the Bearer access token from the
 * Authorization header and attaches the decoded payload to req.user.
 *
 * Usage:
 *   fastify.addHook('preHandler', authenticate)
 *   // or per-route:
 *   { preHandler: [authenticate] }
 */

export interface AuthUser {
  id: number;
  email: string;
  role: 'admin' | 'estimator' | 'viewer';
  name: string;
}

// Extend @fastify/jwt so TypeScript knows the shape of request.user.
// Only declare `user` (not `payload`) so SignPayloadType stays broad and
// jwt.sign() continues to accept generic objects from DB queries.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: AuthUser;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: 'Missing or malformed Authorization header',
      code: 'UNAUTHORIZED',
    });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    // fastify.jwt.verify decodes and verifies the token using the plugin secret.
    // The payload shape is what we put in at sign time.
    const payload = request.server.jwt.verify<AuthUser>(token);
    request.user = payload;
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.message === 'jwt expired'
        ? 'Access token has expired'
        : 'Invalid access token';

    return reply.status(401).send({
      error: message,
      code: 'UNAUTHORIZED',
    });
  }
}
