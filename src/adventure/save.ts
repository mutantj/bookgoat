// Adventure's saved state on this device: the run in progress, and the artifacts Rapunzel keeps between runs.
import type { Board } from './rules';
import type { ArtifactId, OwnedArtifact } from './artifacts';

const RUN_KEY = 'bookgoat.adventure.run.v1';
const ARTIFACTS_KEY = 'bookgoat.adventure.artifacts.v1';

/** Where the run is: the battle, and how Rapunzel started it (so a retry can start it the same way). */
export interface RunSave {
  /** Index into STAGES (missing in saves from before there was more than one). */
  stage?: number;
  battle: number;
  startHp: number;
  startArtifacts: OwnedArtifact[];
  /** The battle as it stands, if it's under way. Without it, the battle starts fresh. */
  live?: {
    heroHp: number;
    enemyHp: number;
    enemyTurns: number;
    board: Board;
    step: number;
    refills: string[];
    /** The artifact switched on for the next word. */
    armed: ArtifactId | null;
  };
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: Adventure still plays, it just won't resume */
  }
}

export const loadRun = () => read<RunSave>(RUN_KEY);
export const saveRun = (run: RunSave | null) => write(RUN_KEY, run);
export const loadArtifacts = () => read<OwnedArtifact[]>(ARTIFACTS_KEY) ?? [];
export const saveArtifacts = (owned: OwnedArtifact[]) => write(ARTIFACTS_KEY, owned);
