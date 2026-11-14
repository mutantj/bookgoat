// Artifacts: treasures Rapunzel keeps between runs, shown in the slots beside the board. Each one has a power she
// can trigger. Some recharge during a fight from long words; others are full again at the start of every battle.
// Their numbers are in tuning.ts.
import { TUNING } from './tuning';
import hornSvg from '../../art/goldenhorn.svg?raw';
import shieldSvg from '../../art/shield.svg?raw';
import hammerSvg from '../../art/hammer.svg?raw';

export type ArtifactId = keyof typeof TUNING.artifacts;

/** An artifact Rapunzel owns. `charge` counts toward its next use; it's ready once it reaches fullCharge(). */
export interface OwnedArtifact {
  id: ArtifactId;
  charge: number;
}

/** An artifact's numbers, whatever kind it is. */
type Spec = { charge: 'words' | 'battle'; multiplier?: number; rechargeLength?: number; rechargeWords?: number; block?: number };
export const spec = (id: ArtifactId) => TUNING.artifacts[id] as Spec;

// Drop the XML declaration and comments so the drawing can be inlined into the page.
const inline = (svg: string) => svg.replace(/<\?xml[^>]*\?>|<!--[\s\S]*?-->/g, '').trim();

const perBattle = () => 'Charged at the start of every battle.';

/** What each artifact looks like, what it does (`power`) and how it powers up again (`charging`). */
export const ARTIFACTS: Record<ArtifactId, { name: string; icon: string; power: () => string; charging: () => string }> = {
  goldenHorn: {
    name: 'Golden Troll Horn',
    icon: inline(hornSvg),
    power: () => `Tap it before attacking: your next word does ×${spec('goldenHorn').multiplier} damage.`,
    charging: () => `Recharges after ${spec('goldenHorn').rechargeWords} words of ${spec('goldenHorn').rechargeLength}+ letters.`,
  },
  shield: {
    name: 'Swamp Shield',
    icon: inline(shieldSvg),
    power: () => `Tap it to raise it: the enemy's next hit does ${spec('shield').block} less damage.`,
    charging: perBattle,
  },
  hammer: {
    name: 'Stone Hammer',
    icon: inline(hammerSvg),
    power: () => "Tap it, then tap a tile: the tile breaks and a new one drops in. It doesn't use your turn, and gems are safe from it.",
    charging: perBattle,
  },
};

/** Both lines together, for hover text and screen readers. */
export const describe = (id: ArtifactId) => `${ARTIFACTS[id].power()} ${ARTIFACTS[id].charging()}`;

export const fullCharge = (id: ArtifactId) => (spec(id).charge === 'words' ? (spec(id).rechargeWords ?? 1) : 1);
export const isReady = (a: OwnedArtifact) => a.charge >= fullCharge(a.id);

/** A word was played: long enough words charge every word-charged artifact that isn't ready yet. */
export function chargeAfterWord(owned: OwnedArtifact[], length: number): OwnedArtifact[] {
  return owned.map((a) => {
    const s = spec(a.id);
    return s.charge === 'words' && length >= (s.rechargeLength ?? 0) && !isReady(a) ? { ...a, charge: a.charge + 1 } : a;
  });
}

/** A battle is starting: artifacts charged per battle are full again. */
export const chargeForBattle = (owned: OwnedArtifact[]): OwnedArtifact[] =>
  owned.map((a) => (spec(a.id).charge === 'battle' ? { ...a, charge: fullCharge(a.id) } : a));

/** How much of a hit the raised shield stops. */
export const shieldBlock = (hit: number) => Math.min(hit, spec('shield').block ?? 0);
