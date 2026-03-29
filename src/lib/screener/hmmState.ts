import fs from 'fs';
import path from 'path';
import {
  hydrateHmmRegimeStateFromMongoIfNeeded,
  persistHmmRegimeStateToMongo,
  seedHmmRegimeMongoFromFileIfNeeded,
} from '@/lib/mongoBackedCache';

const HMM_STATE_PATH = path.join(process.cwd(), 'hmm_regime_state.json');

export type PersistedHmmRegimeState = {
  updatedAt: string;
  returns: number[];
  observedStates: Array<'trend' | 'risk-off' | 'rebound' | 'mixed'>;
};

seedHmmRegimeMongoFromFileIfNeeded().catch((error) => {
  console.error('Failed to seed HMM regime state into Mongo', error);
});
hydrateHmmRegimeStateFromMongoIfNeeded().catch((error) => {
  console.error('Failed to hydrate HMM regime state from Mongo', error);
});

function ensureStateFile() {
  if (!fs.existsSync(HMM_STATE_PATH)) {
    fs.writeFileSync(HMM_STATE_PATH, '{}', 'utf8');
  }
}

export function readPersistedHmmRegimeState(): PersistedHmmRegimeState | null {
  ensureStateFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(HMM_STATE_PATH, 'utf8')) as Partial<PersistedHmmRegimeState>;
    if (!Array.isArray(parsed.returns) || !Array.isArray(parsed.observedStates)) {
      return null;
    }
    return {
      updatedAt: parsed.updatedAt || new Date(0).toISOString(),
      returns: parsed.returns.filter((value): value is number => Number.isFinite(value)).slice(-240),
      observedStates: parsed.observedStates
        .filter((value): value is PersistedHmmRegimeState['observedStates'][number] =>
          value === 'trend' || value === 'risk-off' || value === 'rebound' || value === 'mixed'
        )
        .slice(-240),
    };
  } catch {
    return null;
  }
}

export function writePersistedHmmRegimeState(state: PersistedHmmRegimeState) {
  fs.writeFileSync(HMM_STATE_PATH, JSON.stringify(state), 'utf8');
  persistHmmRegimeStateToMongo(state).catch((error) => {
    console.error('Failed to persist HMM regime state to Mongo', error);
  });
}
