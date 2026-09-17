/**
 * The presentation cookie's name, on its own.
 *
 * Middleware runs on the edge runtime and cannot import anything that reaches
 * Prisma, so the name lives here where both sides can have it without dragging
 * the service along.
 */
export const PRESENTATION_COOKIE = 'gdhq_presentation'
