export const strings = {
  common: {
    play: '▶️ Play',
    pause: '⏸️ Pause',
    retry: '🔄 Retry',
    speed: '🐢 Speed',
    loading: '⏳ Loading…',
  },
  metronome: {
    start: '▶️ Start',
    stop: '⏹️ Stop',
    tap: '👆 Tap',
    beats: '🥁 Beats',
    accent: '💥 Accent 1',
    trainer: '🏋️ Speed trainer',
  },
  looper: {
    loadingWaveform: '⏳ Loading waveform…',
    empty: '🎧 Add a backing track (MP3, M4A, OGG, WAV or FLAC) to slow it down and loop sections.',
    markStart: '🅰️ Set loop start',
    markEnd: '🅱️ Set loop end',
    save: '💾 Save loop',
    clear: '🧹 Clear',
    loadFailed: (error: string) => `❌ Saved loops could not be loaded: ${error}`,
    notSaved: (error: string) => `⚠️ Loops not saved: ${error}`,
    saved: (name: string) => `🔁 ${name}`,
    namePrompt: '🏷️ Name this loop',
  },
  timer: {
    practise: '▶️ Practise',
    resume: '▶️ Resume',
    done: '✅ Done',
    topTempo: '🎯 Top clean tempo (bpm, optional)',
    note: '📝 Note',
    log: '💾 Log',
    keepGoing: '💪 Keep going',
    discard: '🗑️ Discard',
  },
  log: {
    title: '📝 Practice log',
    streak: '🔥 Day streak',
    week: '⏱️ Minutes this week',
    sessions: '📚 Sessions logged',
    lastFourWeeks: '📅 Last four weeks',
    recent: '🕘 Recent sessions',
    empty: '📭 Nothing logged yet. Open a piece and press Practise.',
    bpm: (bpm: number) => `🎯 ${String(bpm)} bpm`,
  },
  nav: {
    library: '📚 Library',
    log: '📝 Practice log',
    tools: '⏱️ Metronome & tuner',
    metronomeRunning: (bpm: number) => `⏱️ ${String(bpm)} bpm ■`,
    finding: '⏳ Finding your place…',
    lost: '🌌 Lost in space',
    backToLibrary: '⬅️ Back to the library',
  },
  tools: {
    title: '🧰 Tools',
    metronome: '⏱️ Metronome',
    tuner: '🎤 Tuner',
    metronomeHint: '💡 Space starts and stops it on a score page; + and − nudge the tempo.',
  },
  tuner: {
    start: '🎤 Start tuner',
    stop: '⏹️ Stop listening',
    reading: (cents: number, hz: string) =>
      `🎯 ${cents > 0 ? '+' : ''}${cents.toFixed(1)} cents · ${hz} Hz`,
    playString: '🎸 Play a string',
    notListening: '🔇 Not listening',
    tuning: '🎼 Tuning',
  },
  drawings: {
    loadFailed: '❌ Could not load the drawings, so drawing is paused to protect them:',
    notSaved: '⚠️ Drawings not saved yet:',
    loading: '⏳ Loading drawings…',
    undo: '↩️ Undo',
    redo: '↪️ Redo',
    delete: '🗑️ Delete',
  },
  score: {
    openFailed: '❌ Could not open this PDF:',
    opening: '⏳ Opening score…',
  },
  practiceChart: {
    empty: '📈 Log a session with a tempo to see your progress here.',
    target: (bpm: number) => `🎯 ${String(bpm)}`,
  },
  loop: {
    switch: '🔁 Loop',
  },
  notation: {
    draw: '✏️ Draw',
    done: '✅ Done',
    drawFailed: '❌ Could not draw the notation:',
    drawing: '⏳ Drawing the notation…',
    barsDiffer:
      '⚠️ The drawing layer is off for this file: the notation and the music disagree on its bars.',
  },
} as const;

export const tips = {
  metronome: {
    panel: 'Metronome',
    slower: 'Slower',
    faster: 'Faster',
    tempo: 'Tempo',
    subdivision: 'Subdivision',
    tap: 'Tap at least twice',
    quarter: 'Quarter notes',
    eighth: 'Eighth notes',
    triplet: 'Triplets',
    sixteenth: 'Sixteenth notes',
  },
  looper: {
    panel: 'Slow-down looper',
    mark: 'Mark the loop start here, then press again at the end',
    deleteLoop: (name: string) => `Delete loop ${name}`,
  },
  timer: {
    panel: 'Practice timer',
    note: 'What went well? What next?',
  },
  log: {
    perDay: 'Minutes practised per day',
    day: (day: string, minutes: number) => `${day}: ${String(Math.round(minutes))} min`,
  },
  nav: {
    brand: 'Per chordas ad astra: library',
    stopMetronome: 'Stop metronome',
  },
  tuner: {
    panel: 'Tuner',
    strings: 'Strings',
  },
  tools: {
    select: 'Select & move',
    pen: 'Pen',
    highlighter: 'Highlighter',
    eraser: 'Eraser',
    text: 'Text',
    line: 'Line',
    arrow: 'Arrow',
    rect: 'Box',
    ellipse: 'Circle',
    stamp: 'Stamp',
  },
  drawings: {
    toolbar: 'Annotation tools',
    tool: (label: string, key: string) => `${label} (${key})`,
    colour: (colour: string) => `Colour ${colour}`,
    size: (size: string) => `Size ${size}`,
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Shift+Z)',
    delete: 'Delete (Del)',
    stamps: 'Stamps',
    textPlaceholder: 'Type a note… (Ctrl+Enter to finish)',
  },
  zoom: {
    out: 'Zoom out',
    in: 'Zoom in',
  },
  practiceChart: {
    summary: (first: number, last: number) =>
      `Best tempo rose from ${String(first)} to ${String(last)} bpm`,
    point: (day: string, bpm: number) => `${day}: ${String(bpm)} bpm`,
  },
  playAlong: {
    barStrip: 'Bars: click to jump, drag across bars to loop them',
  },
  loop: {
    switch: 'Loop on or off; switching it off keeps the loop for later',
  },
  notation: {
    draw: 'Draw on the notation (pauses playback)',
    zoom: 'Zoom the notation (Ctrl+scroll or pinch over it)',
  },
} as const;

export const names = {
  app: { first: 'per chordas', second: 'ad astra' },
} as const;

export const units = {
  bpm: 'bpm',
  plusBpm: '+bpm',
  everyBars: 'every bars',
  upTo: 'up to',
} as const;
