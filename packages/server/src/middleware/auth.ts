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

// Two-pronged type augmentation:
// 1. FastifyJWT.user resolves @fastify/jwt's conditional UserType to AuthUser
// 2. FastifyRequest.user gives TypeScript a concrete (non-conditional) type so
//    preHandler overload resolution can structurally compare FastifyRequest
//    instances without hitting deferred conditional type evaluation failures.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: AuthUser;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
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
