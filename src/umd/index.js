/**
 * ChocoDrop UMD Bundle
 * Browser-compatible script tag version
 */

// Import all client components
import { ChocoDropClient, ChocoDroClient, LiveCommandClient } from '../client/LiveCommandClient.js';
import { SceneManager } from '../client/SceneManager.js';
import { CommandUI } from '../client/CommandUI.js';
import { createChocoDrop, createChocoDro, createLiveCommand } from '../client/bootstrap.js';

// Export everything for UMD
export {
  ChocoDropClient,
  ChocoDroClient,
  LiveCommandClient,
  SceneManager,
  CommandUI,
  createChocoDrop,
  createChocoDro,
  createLiveCommand
};

// Default export for convenience
export default {
  ChocoDropClient,
  ChocoDroClient,
  LiveCommandClient,
  SceneManager,
  CommandUI,
  createChocoDrop,
  createChocoDro,
  createLiveCommand
};