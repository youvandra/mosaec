import { Hono } from 'hono';

export function createApp(): Hono {
  return new Hono();
}
