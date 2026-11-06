import {
  hexDistance,
  isValidPath,
  newBoard,
  removeAndRefill,
  TileFactory,
  tileLength,
  wordFromPath,
  type Board,
  type Pos,
  type Tile,
} from './board';
import type { Dictionary } from './dictionary';
import { Rng } from './rng';
import { RULES, type GemKind } from './rules';

export interface GameState {
  board: Board;
  score: number;
  level: number;
  levelPoints: number;
  bonusWord: string;
  bonusFound: boolean;
  wordsPlayed: number;
  longestWord: string;
  bestWord: { word: string; points: number } | null;
  history: { word: string; points: number }[];
  gameOver: boolean;
  rngState: number;
  nextId: number;
}

export type RejectReason = 'too-short' | 'not-a-word' | 'bad-path' | 'game-over';

export interface TurnResult {
  ok: true;
  word: string;
  points: number;
  gemEarned: GemKind | null;
  bonusHit: boolean;
  bonusPoints: number;
  levelUp: boolean;
  newTileIds: number[];
  burnedTileIds: number[]; // tiles destroyed by fire this turn
  /** Tiles destroyed by gems in the word exploding (Blitz), and the points they added. */
  blastedTileIds: number[];
  blastPoints: number;
  spawnedBurning: number[];
  gameOver: boolean;
}

export interface Rejection {
  ok: false;
  reason: RejectReason;
  word: string;
}

export interface ScorePreview {
  word: string;
  length: number;
  points: number;
  valid: boolean;
}

/** Rule tweaks a mode can make on top of RULES. Not saved with the game. */
export interface GameOptions {
  /** Added to a word's length when deciding which gem it earns. */
  gemLengthBonus?: number;
  /** Only words this long or shorter can start a fire. */
  maxBurnLength?: number;
  /** Gems used in a word explode, destroying tiles this many steps away. Gems caught in a blast explode too. */
  gemBlastRadius?: Record<GemKind, number>;
}

export class Game {
  state: GameState;
  private rng: Rng;
  private factory: TileFactory;

  constructor(
    private dict: Dictionary,
    private bonusWords: string[],
    seedOrState: number | GameState = Date.now() >>> 0,
    private options: GameOptions = {},
  ) {
    if (typeof seedOrState === 'number') {
      this.rng = new Rng(seedOrState);
      this.factory = new TileFactory(this.rng);
      const board = newBoard(this.factory);
      this.state = {
        board,
        score: 0,
        level: 1,
        levelPoints: 0,
        bonusWord: '',
        bonusFound: false,
        wordsPlayed: 0,
        longestWord: '',
        bestWord: null,
        history: [],
        gameOver: false,
        rngState: 0,
        nextId: 0,
      };
      this.state.bonusWord = this.pickBonusWord();
      this.sync();
    } else {
      this.state = seedOrState;
      this.rng = new Rng(seedOrState.rngState);
      this.factory = new TileFactory(this.rng, seedOrState.nextId);
    }
  }

  get board() {
    return this.state.board;
  }
  get levelTarget() {
    return RULES.levelTarget(this.state.level);
  }

  private sync() {
    this.state.rngState = this.rng.state;
    this.state.nextId = this.factory.nextId;
  }

  private pickBonusWord(): string {
    const pool = this.bonusWords.filter((w) => w.length >= Math.min(5 + Math.floor(this.state.level / 4), 7));
    return pool.length ? this.rng.pick(pool) : this.rng.pick(this.bonusWords);
  }

  /** Score a path without changing anything — used for the live preview. */
  preview(path: Pos[]): ScorePreview {
    const word = wordFromPath(this.board, path);
    const tiles = path.map((p) => this.board[p.c][p.r]);
    const length = tiles.reduce((n, t) => n + tileLength(t), 0);
    const valid = length >= RULES.minWordLength && isValidPath(path) && this.dict.has(word);
    const blast = this.blastFrom(path);
    return { word, length, points: scoreTiles(tiles) + blastScore(blast.map((p) => this.board[p.c][p.r])), valid };
  }

  submit(path: Pos[]): TurnResult | Rejection {
    const word = wordFromPath(this.board, path);
    if (this.state.gameOver) return { ok: false, reason: 'game-over', word };
    if (!isValidPath(path)) return { ok: false, reason: 'bad-path', word };
    const tiles = path.map((p) => this.board[p.c][p.r]);
    const length = tiles.reduce((n, t) => n + tileLength(t), 0);
    if (length < RULES.minWordLength) return { ok: false, reason: 'too-short', word };
    if (!this.dict.has(word)) return { ok: false, reason: 'not-a-word', word };

    const s = this.state;
    const points = scoreTiles(tiles);
    const usedIds = new Set(tiles.map((t) => t.id));
    // Work out the blast before fire moves anything; fire never burns a tile the blast is taking.
    const blasted = this.blastFrom(path).map((p) => this.board[p.c][p.r]);
    const blastedIds = new Set(blasted.map((t) => t.id));
    const blastPoints = blastScore(blasted);
    const bonusHit = !s.bonusFound && word === s.bonusWord;
    const bonusPoints = bonusHit ? RULES.bonusWordPoints(s.level) : 0;
    if (bonusHit) s.bonusFound = true;

    s.score += points + bonusPoints + blastPoints;
    s.levelPoints += points + bonusPoints + blastPoints;
    s.wordsPlayed++;
    s.history.unshift({ word, points: points + bonusPoints + blastPoints });
    s.history.length = Math.min(s.history.length, 12);
    if (word.length > s.longestWord.length) s.longestWord = word;
    if (!s.bestWord || points > s.bestWord.points) s.bestWord = { word, points };

    // Fire burns down first (only tiles that existed before this word), then the word is eaten and any blast goes off.
    const gone = new Set([...usedIds, ...blastedIds]);
    const { burned: burnedTileIds, gameOver } = this.burnStep(gone);

    const created = removeAndRefill(this.board, this.positionsOf(gone), this.factory);

    // Long words leave a gem behind; short words risk a new fire.
    let gemEarned = RULES.gemForLength(length + (this.options.gemLengthBonus ?? 0));
    if (bonusHit && !gemEarned) gemEarned = 'green';
    const candidates = created.filter((t) => t.kind === 'normal');
    if (gemEarned && candidates.length) this.rng.pick(candidates).kind = gemEarned;

    const spawnedBurning = this.maybeSpawnBurning(length, created);

    let levelUp = false;
    if (s.levelPoints >= this.levelTarget) {
      s.levelPoints -= this.levelTarget;
      s.level++;
      s.bonusWord = this.pickBonusWord();
      s.bonusFound = false;
      levelUp = true;
    }

    s.gameOver = gameOver;
    this.sync();
    return {
      ok: true,
      word,
      points,
      gemEarned,
      bonusHit,
      bonusPoints,
      levelUp,
      newTileIds: created.map((t) => t.id),
      burnedTileIds,
      blastedTileIds: [...blastedIds],
      blastPoints,
      spawnedBurning,
      gameOver,
    };
  }

  /** Tiles destroyed when the gems in `path` explode, not counting the word's own tiles. Empty unless the mode has blasts. */
  private blastFrom(path: Pos[]): Pos[] {
    const radius = this.options.gemBlastRadius;
    if (!radius) return [];
    const inWord = (p: Pos) => path.some((q) => q.c === p.c && q.r === p.r);
    const all: Pos[] = [];
    this.board.forEach((col, c) => col.forEach((_, r) => all.push({ c, r })));
    const caught: Pos[] = [];
    const queue = path.filter((p) => this.board[p.c][p.r].kind in radius);
    while (queue.length) {
      const gem = queue.shift()!;
      const reach = radius[this.board[gem.c][gem.r].kind as GemKind];
      for (const p of all) {
        if (inWord(p) || caught.some((q) => q.c === p.c && q.r === p.r) || hexDistance(gem, p) > reach) continue;
        caught.push(p);
        if (this.board[p.c][p.r].kind in radius) queue.push(p); // chain reaction
      }
    }
    return caught;
  }

  /** Reshuffle every letter. Costs a turn and starts a fire. */
  scramble(): { burnedTileIds: number[]; spawnedBurning: number[]; gameOver: boolean } {
    if (this.state.gameOver) return { burnedTileIds: [], spawnedBurning: [], gameOver: true };
    const { burned, gameOver } = this.burnStep(new Set());
    for (const col of this.board) for (const t of col) if (t.kind !== 'burning') t.letter = this.factory.letter(this.board);
    const spawned: number[] = [];
    for (let i = 0; i < RULES.burn.scrambleAdds; i++) {
      const top = this.board.map((col) => col[0]).filter((t) => t.kind === 'normal');
      if (!top.length) break;
      const t = this.rng.pick(top);
      t.kind = 'burning';
      spawned.push(t.id);
    }
    this.state.gameOver = gameOver;
    this.sync();
    return { burnedTileIds: burned, spawnedBurning: spawned, gameOver };
  }

  /** How close the lowest fire is to the bottom: 0 = none, 1 = on the bottom row. */
  danger(): number {
    let lowest = -1;
    for (const col of this.board) col.forEach((t, r) => t.kind === 'burning' && (lowest = Math.max(lowest, r)));
    return lowest < 0 ? 0 : (lowest + 1) / RULES.rows;
  }

  private positionsOf(ids: Set<number>): Pos[] {
    const out: Pos[] = [];
    this.board.forEach((col, c) => col.forEach((t, r) => ids.has(t.id) && out.push({ c, r })));
    return out;
  }

  /**
   * Each burning tile not used this turn burns the tile beneath it and drops a row, starting with the next turn
   * after it appears.
   * A fire already on the bottom row with nothing left to burn ends the game.
   */
  private burnStep(usedIds: Set<number>): { burned: number[]; gameOver: boolean } {
    const burned: number[] = [];
    let gameOver = false;
    for (let c = 0; c < this.board.length; c++) {
      const col = this.board[c];
      // Walk bottom-up so a fire never burns twice in one turn.
      for (let r = col.length - 1; r >= 0; r--) {
        const t = col[r];
        if (t.kind !== 'burning' || usedIds.has(t.id)) continue;
        if (r === col.length - 1) {
          gameOver = true;
          continue;
        }
        const below = col[r + 1];
        if (usedIds.has(below.id)) continue; // that tile is being eaten anyway
        burned.push(below.id);
        col.splice(r + 1, 1);
        col.unshift(this.factory.make(this.board));
      }
    }
    return { burned, gameOver };
  }

  private maybeSpawnBurning(wordLength: number, created: Tile[]): number[] {
    if (wordLength > (this.options.maxBurnLength ?? Infinity)) return [];
    const base = RULES.burn.spawnChanceByLength[wordLength] ?? 0;
    if (base <= 0) return [];
    const onBoard = this.board.flat().filter((t) => t.kind === 'burning').length;
    if (onBoard >= RULES.burn.maxOnBoard(this.state.level)) return [];
    const chance = base + (this.state.level - 1) * RULES.burn.perLevel;
    if (this.rng.next() >= chance) return [];
    const candidates = created.filter((t) => t.kind === 'normal');
    if (!candidates.length) return [];
    const t = this.rng.pick(candidates);
    t.kind = 'burning';
    return [t.id];
  }
}

/** Each tile caught in a blast is worth its letter value. */
export function blastScore(tiles: Tile[]): number {
  return Math.round(tiles.reduce((sum, t) => sum + (RULES.letterValues[t.letter] ?? 1), 0) * RULES.pointScale);
}

/** Letter values × length bonus × gem multipliers. */
export function scoreTiles(tiles: Tile[]): number {
  let sum = 0;
  let mult = 1;
  let length = 0;
  for (const t of tiles) {
    sum += RULES.letterValues[t.letter] ?? 1;
    length += tileLength(t);
    if (t.kind === 'burning') mult *= RULES.burningTileBonus;
    else if (t.kind !== 'normal') mult *= RULES.gemMultiplier[t.kind];
  }
  if (length < RULES.minWordLength) return 0;
  return Math.round(sum * RULES.lengthMultiplier(length) * mult * RULES.pointScale);
}
