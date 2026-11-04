import { describe, expect, it } from 'vitest';
import {
  contentTypeFor,
  isMidi,
  isMidiFile,
  isZip,
  kindOfFile,
  MUSIC_ACCEPT,
} from '../src/files.ts';

describe('MIDI files', () => {
  it('are music, with a MIDI content type, and can be picked in the upload dialogs', () => {
    expect(kindOfFile('Nocturne.mid')).toBe('music');
    expect(kindOfFile('Nocturne.MIDI')).toBe('music');
    expect(contentTypeFor('a.mid')).toBe('audio/midi');
    expect(contentTypeFor('a.midi')).toBe('audio/midi');
    expect(MUSIC_ACCEPT.split(',')).toEqual(expect.arrayContaining(['.mid', '.midi']));
  });

  it('are told apart by name and by their header', () => {
    expect(isMidiFile('a.mid')).toBe(true);
    expect(isMidiFile('a.mscz')).toBe(false);
    expect(isMidi(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0]))).toBe(true);
    expect(isMidi(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
    expect(isZip(new Uint8Array([0x4d, 0x54, 0x68, 0x64]))).toBe(false);
  });
});
