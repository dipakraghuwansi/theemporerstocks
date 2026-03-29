import fs from 'fs';
import path from 'path';
import { ResearchManifest } from '@/lib/research/types';
import { hydrateResearchManifestFromMongoIfNeeded, persistResearchManifestToMongo } from '@/lib/mongoBackedCache';

const RESEARCH_MANIFEST_PATH = path.join(process.cwd(), 'research_manifest.json');

export function readResearchManifest() {
  hydrateResearchManifestFromMongoIfNeeded('day').catch((error) => {
    console.error('Failed to hydrate research manifest from Mongo', error);
  });
  if (!fs.existsSync(RESEARCH_MANIFEST_PATH)) return null;

  try {
    return JSON.parse(fs.readFileSync(RESEARCH_MANIFEST_PATH, 'utf8')) as ResearchManifest;
  } catch {
    return null;
  }
}

export function writeResearchManifest(manifest: ResearchManifest) {
  fs.writeFileSync(RESEARCH_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  persistResearchManifestToMongo(manifest).catch((error) => {
    console.error('Failed to persist research manifest to Mongo', error);
  });
  return RESEARCH_MANIFEST_PATH;
}
