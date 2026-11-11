import type { HealthService } from '../services/health-service';
import type { Context } from 'hono';

export class HealthController {
  constructor(private readonly health: HealthService) {}

  live = (c: Context): Response => c.json({ ok: true });

  ready = async (c: Context): Promise<Response> => {
    const report = await this.health.ready();
    return c.json(report, report.ok ? 200 : 503);
  };
}
