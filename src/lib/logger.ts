type LogLevel = 'log' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: any;
  timestamp: string;
  error?: Error;
}

const isDev = import.meta.env.DEV;

function formatLog(entry: LogEntry): string {
  const { level, message, timestamp } = entry;
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
}

function createLogger() {
  const logs: LogEntry[] = [];
  const maxLogs = 100;

  const addLog = (level: LogLevel, message: string, data?: any, error?: Error) => {
    const entry: LogEntry = {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
      error,
    };

    logs.push(entry);
    if (logs.length > maxLogs) logs.shift();

    const formatted = formatLog(entry);
    if (isDev) {
      if (level === 'error' && error) {
        console.error(formatted, { data, error });
      } else if (level === 'warn') {
        console.warn(formatted, data);
      } else if (level === 'info') {
        console.info(formatted, data);
      } else {
        console.log(formatted, data);
      }
    }
  };

  return {
    log: (message: string, data?: any) => addLog('log', message, data),
    info: (message: string, data?: any) => addLog('info', message, data),
    warn: (message: string, data?: any) => addLog('warn', message, data),
    error: (message: string, error?: Error) => addLog('error', message, undefined, error),
    getLogs: () => [...logs],
    clearLogs: () => logs.length = 0,
  };
}

export const logger = createLogger();
