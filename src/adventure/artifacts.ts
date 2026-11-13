// Artifacts: treasures Rapunzel keeps between runs, shown in the slots beside the board. Each one has a power
// she can trigger, and it recharges as she plays. Their numbers are in tuning.ts.
import { TUNING } from './tuning';
import hornSvg from '../../art/goldenhorn.svg?raw';

export type ArtifactId = keyof typeof TUNING.artifacts;

/** An artifact Rapunzel owns. `charge` counts toward its next use; it's ready once it reaches `rechargeWords`. */
export interface OwnedArtifact {
  id: ArtifactId;
  charge: number;
}

// Drop the XML declaration and comments so the drawing can be inlined into the page.
const inline = (svg: string) => svg.replace(/<\?xml[^>]*\?>|<!--[\s\S]*?-->/g, '').trim();

export const ARTIFACTS: Record<ArtifactId, { name: string; icon: string; text: () => string }> = {
  goldenHorn: {
    name: 'Golden Troll Horn',
    icon: inline(hornSvg),
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
