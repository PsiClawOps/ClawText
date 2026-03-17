import fs from 'fs';
import os from 'os';
import path from 'path';

export interface ContextPressure {
  remainingPct: number;
  burnRate: number;
  projectedTurns: number;
  trend: 'growing' | 'stable' | 'shrinking';
  aggressiveness: number;
}

type PressureSample = {
  ts: number;
  usedTokens: number;
};

type PressureState = {
  samples: PressureSample[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class ContextPressureMonitor {
  private readonly stateFilePath: string;
  private readonly windowSize: number;
  private state: PressureState;

  constructor(stateFilePath?: string, windowSize = 5) {
    this.stateFilePath =
      stateFilePath ??
      path.join(
        os.homedir(),
        '.openclaw',
        'workspace',
        'state',
        'clawtext',
        'prod',
        'context-pressure.json',
      );
    this.windowSize = Math.max(2, windowSize);
    this.state = { samples: [] };
    this.load();
  }

  recordTurn(usedTokens: number, ts = Date.now()): void {
    this.state.samples.push({
      ts,
      usedTokens: Math.max(0, Math.floor(usedTokens)),
    });

    if (this.state.samples.length > this.windowSize) {
      this.state.samples = this.state.samples.slice(-this.windowSize);
    }
  }

  assess(contextWindowTokens: number, currentUsedTokens?: number): ContextPressure {
    const tokens = Math.max(1, Math.floor(contextWindowTokens));
    const latestUsed =
      currentUsedTokens !== undefined
        ? Math.max(0, Math.floor(currentUsedTokens))
        : this.state.samples[this.state.samples.length - 1]?.usedTokens ?? 0;

    const remainingTokens = Math.max(0, tokens - latestUsed);
    const remainingPct = clamp(remainingTokens / tokens, 0, 1);

    const burnRate = this.computeBurnRate();
    const projectedTurns = burnRate > 0 ? remainingTokens / burnRate : Number.POSITIVE_INFINITY;
    const trend = this.computeTrend();
    const aggressiveness = clamp(1 - projectedTurns / 20, 0, 1);

    return {
      remainingPct,
      burnRate,
      projectedTurns,
      trend,
      aggressiveness,
    };
  }

  save(): void {
    const dir = path.dirname(this.stateFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  load(): void {
    try {
      if (!fs.existsSync(this.stateFilePath)) return;
      const raw = fs.readFileSync(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PressureState>;
      if (!Array.isArray(parsed.samples)) return;

      this.state.samples = parsed.samples
        .filter((s) => s && Number.isFinite(s.ts) && Number.isFinite(s.usedTokens))
        .map((s) => ({ ts: Number(s.ts), usedTokens: Math.max(0, Math.floor(Number(s.usedTokens))) }))
        .slice(-this.windowSize);
    } catch {
      this.state = { samples: [] };
    }
  }

  private computeBurnRate(): number {
    if (this.state.samples.length < 2) return 0;

    const deltas: number[] = [];
    for (let i = 1; i < this.state.samples.length; i += 1) {
      const delta = this.state.samples[i].usedTokens - this.state.samples[i - 1].usedTokens;
      deltas.push(Math.max(0, delta));
    }

    if (deltas.length === 0) return 0;
    const sum = deltas.reduce((acc, value) => acc + value, 0);
    return sum / deltas.length;
  }

  private computeTrend(): 'growing' | 'stable' | 'shrinking' {
    if (this.state.samples.length < 2) return 'stable';

    const first = this.state.samples[0].usedTokens;
    const last = this.state.samples[this.state.samples.length - 1].usedTokens;

    if (last - first > 200) return 'growing';
    if (first - last > 200) return 'shrinking';
    return 'stable';
  }
}
