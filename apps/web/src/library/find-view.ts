import { chooseImportFiles, SCORE_EXTENSIONS, type FoundFile, type FoundScore } from '@pcaa/shared';
import { strings } from '../strings.ts';

export function isScoreFile(file: FoundFile): boolean {
  return (SCORE_EXTENSIONS as readonly string[]).includes(file.ext);
}

export function formatChip(file: FoundFile): string {
  return isScoreFile(file)
    ? strings.find.scoreFormat(file.label)
    : strings.find.musicFormat(file.label);
}

export function byline(result: FoundScore): string {
  return [result.composer, result.instrument, result.detail]
    .filter((part) => part !== '')
    .join(' · ');
}

export function importSummary(result: FoundScore): string {
  const { score, music } = chooseImportFiles(result.files);
  return [score, music]
    .filter((file): file is FoundFile => file !== null)
    .map(formatChip)
    .join(' + ');
}

export function musicToCheck(result: FoundScore): FoundFile | null {
  return chooseImportFiles(result.files).music;
}
