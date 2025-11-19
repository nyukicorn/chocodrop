import { THREE_CDN_BASE } from '../utils/three-deps.js';

const STORAGE_KEY = 'chocodrop:htmlSandboxPolicy';
const DEFAULT_MAX_EXECUTION_MS = 12000;
const DEFAULT_IDLE_EXPORT_MS = 1500;
const DEFAULT_MAX_REQUESTS = 12;

const DEFAULT_HOSTS = (() => {
  const origins = new Set([
    'self',
    'blob:',
    'data:'
  ]);
  try {
    const threeOrigin = new URL(THREE_CDN_BASE).origin;
    origins.add(threeOrigin);
  } catch (_) {
    // ignore
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    origins.add(window.location.origin);
  }
  origins.add('https://nyukicorn.github.io');
  return Array.from(origins);
})();

export const DEFAULT_HTML_SANDBOX_POLICY = Object.freeze({
  hosts: DEFAULT_HOSTS,
  maxExecutionMs: DEFAULT_MAX_EXECUTION_MS,
  autoExportIdleMs: DEFAULT_IDLE_EXPORT_MS,
  maxNetworkRequests: DEFAULT_MAX_REQUESTS
});

export function normalizeHtmlSandboxPolicy(candidate = {}) {
  const hosts = Array.isArray(candidate.hosts) ? candidate.hosts : DEFAULT_HTML_SANDBOX_POLICY.hosts;
  const normalizedHosts = Array.from(
    new Set(
      hosts
        .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
        .map(entry => (entry === 'self' || entry.endsWith(':') ? entry : entry.replace(/\/+$/, '')))
    )
  );

  return {
    hosts: normalizedHosts.length ? normalizedHosts : DEFAULT_HTML_SANDBOX_POLICY.hosts,
    maxExecutionMs: clampNumber(candidate.maxExecutionMs, 2000, 30000, DEFAULT_HTML_SANDBOX_POLICY.maxExecutionMs),
    autoExportIdleMs: clampNumber(candidate.autoExportIdleMs, 250, 8000, DEFAULT_HTML_SANDBOX_POLICY.autoExportIdleMs),
    maxNetworkRequests: clampNumber(candidate.maxNetworkRequests, 1, 64, DEFAULT_HTML_SANDBOX_POLICY.maxNetworkRequests)
  };
}

export function loadHtmlSandboxPolicy() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_HTML_SANDBOX_POLICY;
    }
    const parsed = JSON.parse(raw);
    return normalizeHtmlSandboxPolicy(parsed);
  } catch (error) {
    console.warn('Failed to load HTML sandbox policy, using defaults.', error);
    return DEFAULT_HTML_SANDBOX_POLICY;
  }
}

export function saveHtmlSandboxPolicy(policy) {
  try {
    const normalized = normalizeHtmlSandboxPolicy(policy);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (error) {
    console.warn('Failed to persist HTML sandbox policy.', error);
    return normalizeHtmlSandboxPolicy(policy);
  }
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (Number.isFinite(num)) {
    return Math.min(Math.max(num, min), max);
  }
  return fallback;
}
