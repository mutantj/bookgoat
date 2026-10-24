import {
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

export interface ClassicState {
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

export class ClassicGame {
  state: ClassicState;
  private rng: Rng;
  private factory: TileFactory;

  constructor(
    private dict: Dictionary,
    private bonusWords: string[],
    seedOrState: number | ClassicState = Date.now() >>> 0,
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
    return { word, length, points: scoreTiles(tiles), valid };
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
    const bonusHit = !s.bonusFound && word === s.bonusWord;
    const bonusPoints = bonusHit ? RULES.bonusWordPoints(s.level) : 0;
    if (bonusHit) s.bonusFound = true;

    s.score += points + bonusPoints;
    s.levelPoints += points + bonusPoints;
    s.wordsPlayed++;
    s.history.unshift({ word, points: points + bonusPoints });
    s.history.length = Math.min(s.history.length, 12);
    if (word.length > s.longestWord.length) s.longestWord = word;
    if (!s.bestWord || points > s.bestWord.points) s.bestWord = { word, points };

    // Fire burns down first (only tiles that existed before this word), then the word is eaten.
    const burnedTileIds: number[] = [];
    let gameOver = false;
    const usedIds = new Set(tiles.map((t) => t.id));
    const burnResult = this.burnStep(usedIds);
    burnedTileIds.push(...burnResult.burned);
    gameOver = burnResult.gameOver;

    const created = removeAndRefill(this.board, this.positionsOf(usedIds), this.factory);

    // Long words leave a gem behind; short words risk a new fire.
    let gemEarned = RULES.gemForLength(length);
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
      spawnedBurning,
      gameOver,
    };
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
      t.fresh = true;
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
   * Each burning tile (not used this turn, not brand new) burns the tile beneath it and drops a row.
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
        if (t.fresh) {
          t.fresh = false;
          continue;
        }
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
    t.fresh = true;
    return [t.id];
  }
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
