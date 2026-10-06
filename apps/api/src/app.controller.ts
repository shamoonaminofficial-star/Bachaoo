import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  health() {
    return {
      status: 'ok',
      service: 'bachatly-api',
      version: 'v1',
      time: new Date().toISOString(),
    };
  }

  /**
   * Phase 13 — lightweight liveness probe for load balancers / uptime
   * monitors. No auth, no DB/Redis queries: just process uptime.
   * Serves at /api/v1/healthz (global prefix + URI versioning).
   */
  @Public()
  @Get('healthz')
  healthz() {
    return { status: 'ok', uptimeSec: Math.floor(process.uptime()) };
  }
}
