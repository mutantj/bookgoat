// Artifacts: treasures Rapunzel keeps between runs, shown in the slots beside the board. Each one has a power
// she can trigger, and it recharges as she plays. Their numbers are in tuning.ts.
import { TUNING } from './tuning';

export type ArtifactId = keyof typeof TUNING.artifacts;

/** An artifact Rapunzel owns. `charge` counts toward its next use; it's ready once it reaches `rechargeWords`. */
export interface OwnedArtifact {
  id: ArtifactId;
  charge: number;
}

const hornSvg = `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="horn-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1a8"/><stop offset="0.5" stop-color="#f2b632"/><stop offset="1" stop-color="#b8790f"/></linearGradient></defs><path d="M6 40 C10 22 22 10 40 6 C36 12 34 16 33 20 C24 22 16 30 12 42 Z" fill="url(#horn-gold)" stroke="#7a4c06" stroke-width="2" stroke-linejoin="round"/><path d="M14 33 l5 3 M19 26 l5 3 M25 20 l4 3" stroke="#7a4c06" stroke-width="1.6" stroke-linecap="round"/></svg>`;

export const ARTIFACTS: Record<ArtifactId, { name: string; icon: string; text: () => string }> = {
  goldenHorn: {
    name: 'Golden Troll Horn',
    icon: hornSvg,
    text: () => {
      const h = TUNING.artifacts.goldenHorn;
      return `Tap before attacking: your next word does ×${h.multiplier} damage. Recharges after ${h.rechargeWords} words of ${h.rechargeLength}+ letters.`;
    },
  },
};

export const fullCharge = (id: ArtifactId) => TUNING.artifacts[id].rechargeWords;
export const isReady = (a: OwnedArtifact) => a.charge >= fullCharge(a.id);

/** A word was played: long enough words charge every artifact that isn't ready yet. */
export function chargeAfterWord(owned: OwnedArtifact[], length: number): OwnedArtifact[] {
  return owned.map((a) => (length >= TUNING.artifacts[a.id].rechargeLength && !isReady(a) ? { ...a, charge: a.charge + 1 } : a));
}
