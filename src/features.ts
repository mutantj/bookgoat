// Feature flags: switch a feature off without removing its code. Defaults and env vars are in
// vite.config.ts; a feature that's off is left out of the build entirely.
declare const __FEATURE_ADVENTURE__: boolean;

export const FEATURES = {
  /** Adventure mode (preview): Rapunzel battles enemies on a 4×4 board. */
  adventure: __FEATURE_ADVENTURE__,
};
