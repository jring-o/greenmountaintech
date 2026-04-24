type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
  child(ctx: Record<string, unknown>): Logger;
}

function isDebugEnabled(): boolean {
  const raw = process.env.DEBUG;
  return raw === '1' || raw === 'true';
}

function emit(
  level: LogLevel,
  msg: string,
  ctx: Record<string, unknown>,
  extra?: Record<string, unknown>,
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
    ...extra,
  };
  const line = JSON.stringify(entry);

  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    default:
      console.info(line);
      break;
  }
}

function createLogger(ctx: Record<string, unknown> = {}): Logger {
  return {
    debug(msg: string, extra?: Record<string, unknown>) {
      if (!isDebugEnabled()) return;
      emit('debug', msg, ctx, extra);
    },
    info(msg: string, extra?: Record<string, unknown>) {
      emit('info', msg, ctx, extra);
    },
    warn(msg: string, extra?: Record<string, unknown>) {
      emit('warn', msg, ctx, extra);
    },
    error(msg: string, extra?: Record<string, unknown>) {
      emit('error', msg, ctx, extra);
    },
    child(childCtx: Record<string, unknown>): Logger {
      return createLogger({ ...ctx, ...childCtx });
    },
  };
}

export const log = createLogger();
