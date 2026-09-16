import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('business sales connector backfill', () => {
  it('enables existing connected WhatsApp and Instagram business connectors without touching Telegram', () => {
    const sql = readFileSync(join(process.cwd(), 'prisma/migrations/20260916193000_enable_existing_business_sales_agents/migration.sql'), 'utf8');
    expect(sql).toContain('UPDATE "WhatsAppConnection"');
    expect(sql).toContain('UPDATE "InstagramConnection"');
    expect(sql).toContain('"salesAgentEnabled" = TRUE');
    expect(sql).toContain("'CONNECTED'");
    expect(sql).toContain("'DEGRADED'");
    expect(sql).not.toContain('TelegramConnection');
  });
});
