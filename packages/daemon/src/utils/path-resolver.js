/**
 * Path Resolution Utilities
 * Handles environment variables, home directory shortcuts, and path resolution
 */
import path from 'path';
import os from 'os';

const WINDOWS_ENV_PATTERN = /%([^%]+)%/g;
const POSIX_ENV_PATTERN = /\$([A-Za-z_][A-Za-z0-9_]*)|\$\{([^}]+)\}/g;

/**
 * Expand ~ and ~/ to user home directory
 * @param {string} targetPath - Path that may contain ~ shortcut
 * @returns {string} Expanded path
 */
export function expandHomeShortcut(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    return targetPath;
  }

  if (targetPath === '~') {
    return os.homedir();
  }

  if (targetPath.startsWith('~/') || targetPath.startsWith('~\\')) {
    return path.join(os.homedir(), targetPath.slice(2));
  }

  return targetPath;
}

/**
 * Expand environment variables in path
 * Supports both Unix ($VAR, ${VAR}) and Windows (%VAR%) formats
 * @param {string} targetPath - Path that may contain environment variables
 * @returns {string} Path with expanded environment variables
 */
export function expandEnvironmentVariables(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    return targetPath;
  }

  // POSIX-style environment variables ($VAR or ${VAR})
  let expanded = targetPath.replace(POSIX_ENV_PATTERN, (match, varName, varNameAlt) => {
    const envValue = process.env[varName || varNameAlt];
    return envValue !== undefined ? envValue : match;
  });

  // Windows-style environment variables (%VAR%)
  if (process.platform === 'win32') {
    expanded = expanded.replace(WINDOWS_ENV_PATTERN, (match, varName) => {
      const envValue = process.env[varName];
      return envValue !== undefined ? envValue : match;
    });
  }

  return expanded;
}

/**
 * Resolve config path with home directory and environment variable expansion
 * @param {string} rawPath - Raw path from configuration
 * @returns {string} Fully resolved absolute path
 */
export function resolveConfigPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    return rawPath;
  }

  let resolved = expandHomeShortcut(rawPath.trim());
  resolved = expandEnvironmentVariables(resolved);

  // Convert to absolute path if relative
  if (!path.isAbsolute(resolved)) {
    resolved = path.resolve(process.cwd(), resolved);
  }

  return resolved;
}
