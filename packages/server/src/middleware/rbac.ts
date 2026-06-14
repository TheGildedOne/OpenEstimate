import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthUser } from './auth';

/**
 * Role-Based Access Control middleware factory.
 *
 * Returns a Fastify preHandler that allows the request to proceed only when
 * req.user.role is included in the `allowedRoles` list.
 *
 * Must be used after the `authenticate` middleware (which populates req.user).
 *
 * Usage:
 *   { preHandler: [authenticate, requireRole('admin')] }
 *   { preHandler: [authenticate, requireRole('admin', 'estimator')] }
 */
export function requireRole(
  ...allowedRoles: Array<AuthUser['role'] | string>
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function rbacGuard(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = request.user;

    if (!user) {
      // Shouldn't happen if authenticate ran first, but guard anyway.
      return reply.status(401).send({
        error: 'Not authenticated',
        code: 'UNAUTHORIZED',
      });
    }

    if (!allowedRoles.includes(user.role)) {
      return reply.status(403).send({
        error: `Requires one of the following roles: ${allowedRoles.join(', ')}`,
        code: 'FORBIDDEN',
      });
    }
  };
}

/**
 * Convenience guard: only admins may proceed.
 */
export const requireAdmin = requireRole('admin');

/**
 * Convenience guard: admins and estimators may proceed (viewers cannot).
 */
export const requireEstimatorOrAbove = requireRole('admin', 'estimator');
