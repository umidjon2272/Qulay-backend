import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AiAgentService } from './ai-agent.service';
import { AgentActionQueryDto } from './dto/agent-action-query.dto';
import { AgentChatDto, AgentConfirmationDto } from './dto/agent-chat.dto';

@Controller('ai/agent')
@UseGuards(JwtAuthGuard)
export class AiAgentController {
  constructor(private readonly agent: AiAgentService) {}

  @Get('status')
  status() { return this.agent.status(); }

  @Get('actions')
  listActions(@CurrentUser() user: AuthenticatedUser, @Query() query: AgentActionQueryDto) {
    return this.agent.listForUser(user.sub, query);
  }

  @Post('chat')
  chat(@CurrentUser() user: AuthenticatedUser, @Body() dto: AgentChatDto) { return this.agent.chat(user.sub, dto); }

  @Post('chat/stream')
  async stream(@CurrentUser() user: AuthenticatedUser, @Body() dto: AgentChatDto, @Req() req: Request, @Res() res: Response) {
    const startedAt = performance.now();
    let firstDeltaMs: number | null = null;
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const abort = new AbortController();
    req.once('aborted', () => abort.abort());
    res.once('close', () => { if (!res.writableEnded) abort.abort(); });
    const send = (value: unknown) => {
      if (firstDeltaMs === null && value && typeof value === 'object' && 'type' in value && value.type === 'delta') firstDeltaMs = Math.round(performance.now() - startedAt);
      if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(value)}\n`);
    };
    try {
      const result = await this.agent.chat(user.sub, dto, send, abort.signal);
      send({ type: 'complete', result: { ...result, timing: { firstDeltaMs, totalMs: Math.round(performance.now() - startedAt) } } });
    } catch (error) {
      if (!abort.signal.aborted) send({ type: 'error', message: error instanceof Error ? error.message : 'AI oqimida xatolik yuz berdi.' });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  @Post('actions/:id/confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: AgentConfirmationDto) {
    return this.agent.confirm(user.sub, id, dto.confirmed);
  }
}
