const LEVELS = ['debug', 'info', 'warn', 'error'];
const PREFIX = '[ChocoDrop]';

function createPrinter(level, context) {
  const fn = console[level] || console.log;
  return (...args) => fn(`${PREFIX}${context ? `:${context}` : ''}`, ...args);
}

export function createLogger(context = '') {
  const ctxLabel = context ? `:${context}` : '';
  const logger = {};
  LEVELS.forEach(level => {
    logger[level] = createPrinter(level, ctxLabel);
  });
  logger.child = childContext => createLogger(context ? `${context}/${childContext}` : childContext);
  return logger;
}

export const logger = createLogger('core');
