import fs from 'fs';
import path from 'path';
import { ResearchManifest } from '@/lib/research/types';

const RESEARCH_MANIFEST_PATH = path.join(process.cwd(), 'research_manifest.json');

export function readResearchManifest() {
  if (!fs.existsSync(RESEARCH_MANIFEST_PATH)) return null;

  try {
    return JSON.parse(fs.readFileSync(RESEARCH_MANIFEST_PATH, 'utf8')) as ResearchManifest;
  } catch {
    return null;
  }
}

export function writeResearchManifest(manifest: ResearchManifest) {
  fs.writeFileSync(RESEARCH_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  return RESEARCH_MANIFEST_PATH;
}
