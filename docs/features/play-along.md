---
title: Play-along (MuseScore, MusicXML and MIDI, falling notes, transpose, loop)
status: shipped
updated: 2026-11-09
---

# Play-along

Dewi, 24 Oct 2026: open MuseScore files in the app, transpose them, and watch the notes fall onto a
keyboard from above, like the bird's-eye piano videos.

- **Files**: `.mscz`/`.mscx` from MuseScore 1 (and the 0.9 versions before it), 2, 3, 4 and 5, MusicXML `.mxl`/`.musicxml`, and Standard MIDI files
  `.mid`/`.midi` (see **MIDI files** below). Start a new piece
  straight from one (**+ New piece**, then the MuseScore / MusicXML / MIDI field: the title and composer fill in
  from the file if still empty, and the piece opens in Play-along), or add one to an existing piece from its
  **🎹 Play-along** section. Stored untouched under `pieces/<slug>/music/`. The title and composer come from
  the file's metadata, or from MuseScore's title frame (first line only, so "Arranged by…" is left out).
- **MuseScore 1 files** (9 Nov 2026, after a popular musescore.com download of Beethoven's "Tempest" sonata, saved
  by MuseScore 1.3 in 2013, failed with "This MuseScore file has no score in it"): `music/mscx-114.ts` rewrites an
  old file into the layout the MuseScore reader already reads, so there is still one reader. Bar lengths come from
  the file's time signature list (so a pickup bar is as short as written), key signatures from their old number
  code (and C major when the first bar has none), clefs from each staff's clef list, the tempo from the tempo list,
  first and second endings from the score-wide list, title and composer from the title frame's HTML, fingering
  from the note's text, and two-note tremolos play as two halves. A note's own `<tick>` places it, so a second
  voice that starts partway through a bar lands where written. The oldest files (MuseScore 0.9) write pitches as
  attributes and lengths in ticks; those are read too. Drums are left out, as everywhere.
- **Multi-measure rests** (9 Nov 2026): a score saved with multi-measure rests showing (MuseScore 3–5) also holds a
  combined "rest for N bars" bar; it is skipped, so the bars after it play on time.
- **MIDI files** (4 Nov 2026, so Chopin's Nocturne Op. 9 No. 1 can be learned from the free Mutopia
  edition, which exists only as LilyPond, MIDI and PDF): our own small Standard MIDI File reader
  (`music/midi.ts`, ADR 0014), format 0 and 1; SMPTE timing and format 2 are refused with a message saying so.
  Each track becomes a staff (a format 0 file is split by channel; the percussion channel is left out). When
  exactly two staves have notes, they become one piano part with two staves, the one with the higher average
  pitch first and on the right, so the hand split and 🔎 File check work as for a grand staff; the part is
  called "Piano" unless both tracks share a name. Bars come from the time signatures (4/4 until one is given),
  tempo and key from their meta events, the title from a track that has no notes (a placeholder such as
  "Track 0" is ignored, and then the file name is used). The General MIDI program names the instrument for the
  file check: 0–7 piano, 24–31 guitar, anything else is "other". Each note keeps its own velocity. A MIDI file has
  no engraving, so there is no 🎼 Notation strip, no stave to draw on and 💾 MusicXML is disabled; 💾 MIDI still exports, and ✏️ Draw still draws on the falling notes.
- **Views** (top of the piece page, only when the piece has a music file): **📄 Score** (the PDF),
  **📄🎹 Both** (PDF on the left, falling notes on the right) and **🎹 Notes** (falling notes only). A piece
  with music but no PDF opens in Notes. The view is remembered per piece, on every device.
- **Notation** (🎼, on by default): the score drawn from the file itself, one line scrolling above the
  falling notes, with the notes being played coloured and the current bar kept in view. Click a bar to
  jump there. Transposing redraws it in the new key, the same key the key line shows (ADR 0015). MuseScore
  files are converted to MusicXML for this; MusicXML files are drawn as they are.
- **Notation zoom** (🔍 −/+ in the strip's corner, or `Ctrl`+scroll / pinch over it): 40–250%, about 11 bars
  across at 100% and about 4 at 250%; the strip grows taller to fit. Remembered per music file on every device.
- **✏️ Draw** on the notation: pauses, gives the strip most of the pane (the settings rows hide until ✅ Done, so
  the strip stays big in the narrow side-by-side view), shows the same drawing toolbar and
  keys as on PDFs (pen, highlighter, eraser, text, shapes, stamps, undo/redo) and raises the zoom to at least
  150%. Scroll sideways to any bar and draw; **✅ Done** shrinks it back, and the marks scroll with the music
  while you play. Marks are pinned to bars, so they stay on the right notes when you transpose or zoom.
  Saved per music file in the data repo (ADR 0016).
- **✏️ Draw on the falling notes** (4 Nov 2026, ADR 0027): the same ✏️ Draw mode, toolbar and keys also draw on the
  falling notes, so a mark can be put where the music will be: a circle round a chord, a word over a bar, an arrow
  to a jump. Press where you want to draw (the stave or the falling notes) and the keys and ↩️ Undo follow that
  surface. Marks fall with the music, so to reach the bar you want scroll the notes with the mouse wheel (and
  `Ctrl`+wheel to zoom them) or click the bar strip; a drag draws instead of scrubbing. Each mark is pinned to a written pitch and a bar: it
  stays on its notes through a transposition, a different 🔭 look-ahead, a speed change and a different keyboard
  size, and shows on every pass of a repeated bar. Pen width, text and stamps keep their size on screen. The marks
  show outside Draw mode too, and do not take clicks: a click on a note still picks it for fingering. Marks are
  drawn only, never played. Saved per music file, apart from the stave's, in the data repo; the notes area gets
  half the pane in Draw mode when the stave is showing. MIDI files can be drawn on too.
- **Falling notes**: notes fall onto a keyboard fitted to the piece in whole octaves (at least three), or
  all 88 keys. Sounding keys light up in their part's colour: right hand violet, left hand teal, other
  parts coral, blue, amber. Bar lines carry their numbers. Drag or scroll the notes to move through the
  piece.
- **🔎 File check**: a line under 🙋 I play on says whether the file was written for piano (✅), guitar (🎸) or is not
  clearly piano (⚠️), from the three clues a file carries: the instrument it names, its layout (one part on two joined
  staves, single staves, guitar tab) and its fingering marks by kind; ❓ explains. Piano fingering in the file shows
  as red numbers on the stave and on the falling notes ([ADR 0021](../adr/0021-fingering.md)).
- **✋ Your fingering**: click a falling note, or a note on the stave, and press 1–5 (Backspace clears, Esc lets go).
  It shows as a red number on the falling note and on the stave, replaces the file's own mark on both, follows a
  transposition and the Split-for-piano grand staff, and is saved to GitHub for everyone who opens the piece (if a save
  fails the number goes back to the last saved one). Draw mode lets go of the picked note and does not read 1–5 or
  Delete as fingering. A picked
  note is outlined on the falling notes and drawn red on the stave. Clicking a note on the stave also moves to its bar;
  clicking the bar anywhere else moves to the bar and lets go of the note; in Draw mode the stave belongs to drawing.
  Clicking just beside a hollow note head still picks it. A grace note cannot be picked on the stave
  ([ADR 0021](../adr/0021-fingering.md)).
- **🤖 Suggested fingering** (on by default): grey finger numbers worked out by the app where neither the file nor you
  has given one; red always wins. Untick to hide them; remembered per file ([ADR 0021](../adr/0021-fingering.md)).
  A ❓ beside it says how to put your own number over a grey one (click a falling note, press 1–5).
- **🔭 Look ahead** (Dewi, 4 Nov 2026: "zoom out and see quite a lot"): how many seconds the falling notes show, from
  1 to 20 (3 to start), by − / + on the play bar or Ctrl + scroll over the falling notes, which leaves the PDF's zoom
  alone. Note names stay 12 px however far you zoom out: on a note too thin to hold one, the name sits just above it,
  and where two would overlap in one key the later one is left out rather than drawn on top. Finger numbers are
  placed before names, so a name gives way to a finger and turning names on never hides one; the finger of the
  picked note is always shown (Dewi, 7 Nov 2026: "I can't change finger numbers when the note names are on").
- **More room**: drag the bar under the stave (or focus it and use ↑ ↓) to give the stave or the falling notes more
  height; double-click it to go back to automatic. **🔼 Fewer controls** folds away the settings rows, keeping play,
  bars, look ahead and speed. In the Both view at laptop size the settings rows can push the falling notes below the
  screen, so this is the switch to reach for there. Look ahead, the stave height and folded controls are remembered
  per file, per person.
- **Together lines** (Dewi, 7 Nov 2026: "when the hands are far apart I can't see if they align in time"): where
  notes in different hands (or parts) start at the same moment, a dark dotted line joins them across the gap, at the
  moment they start. No line means one hand comes first. A hidden hand draws none, a chord in one hand needs none,
  and hands already touching are left alone.
- **Note names**: a toggle prints each note's letter on it, spelled for the key it now sounds in (flats in
  flat keys, sharps in sharp keys), following any transposition. Remembered per file.
- **Parts**: each staff can be hidden (👁, still heard) or muted (🔊, still shown) on its own, to practise one
  hand while the other plays.
- **🖐️ Hands: ✨ Auto / 🎼 As written / 🖐️ Split for piano** (ADR 0018): As written uses the file's own staves (a
  piano score's treble is the right hand, bass the left). Split for piano works out which hand plays each note, so a
  guitar score played on piano never asks one hand to sit inside the other (Gran Vals bar 17); the lanes become 🫱
  Right hand and 🫲 Left hand, each with its own hide and mute, and switching does not stop the music. ✨ Auto (the
  default) picks Split for piano when you play the piece on piano and the file has no piano staves, and says what it
  chose and why beside the buttons. Every button has hover text and ❓ opens a plain explanation; the same goes for
  🙋 I play on (✨ Auto / 🎹 Piano / 🎸 Guitar). Remembered per file.
- **👐 I play: 🎧 Nothing / 👐 Both / 🖐️ Right / 🤚 Left** (Dewi, 4 Nov 2026), in the Hands row when the lanes include a
  hand. Choose the hand you play: it goes quiet but stays on screen to follow, and the app plays the other hand for
  you; Both silences both, Nothing lets the app play everything. It is a shortcut for each hand's 👁 and 🔊 and reads
  ⚙️ Custom when you change those yourself; remembered per file with them, separately for By part and By hand
  ([ADR 0018](../adr/0018-piano-hands-for-guitar-scores.md)). Hover text on each button and ❓ explain.
- **🎸 Chord names** (off to start with, remembered per file): each new harmony of the left hand is named (G, Am, D7,
  C/E, Bdim, Gsus4) on a sticker at the left edge of the falling notes where it starts, one chord a bar (a waltz bass
  and two chords read as one), spelled for the key it now sounds in. Bars that are not a chord show nothing
  ([ADR 0023](../adr/0023-chord-names.md)).
- **🖐️ Show hands** (on to start with, remembered per file, piano only): two see-through hands drawn over the
  keyboard at the bottom of the falling notes, right hand violet and left hand teal, with the finger numbers on the
  fingertips. They glide to each new position (a shift, a jump, the thumb passing under) shortly before the notes
  arrive, a pressing finger dips and lights up, a stretched chord spreads the fingers, and a hand with nothing to
  play fades until its next note. The fingers are exactly the numbers on the falling notes (yours in red, the
  file's, then the 🤖 suggestion, which is still used for the hands when its grey numbers are switched off). The
  notes land on the fingertips and nothing is drawn above the keys ([ADR 0029](../adr/0029-hands-over-the-keyboard.md)).
- **✂️ Thin octaves** (by hand only, on to start with): where the tune is written in octaves, as guitar music
  often is, the lower copy is left out (not drawn, not played, not on the grand staff), so in Gran Vals bars 18–21
  the right hand plays the tune and the left hand bass then chords instead of the right hand stretching an octave
  over the chords. Untick it to see and play every written note. Remembered per file (ADR 0018).
- **🔔 Ringing tails**: each note is drawn as a short strike (0.2 s) with a thin, paler tail for as long as it
  rings, and its key lights only for the strike, so a guitar's let-ring notes no longer look like keys to hold
  down (catch them with the pedal). With tails on, the hand split counts a key as released after its strike,
  which frees the hands further. Remembered per file.
- **🎹 Wait for me** (button in the top bar, remembered per file; ADR 0024): the falling notes stop exactly at each
  note or chord of yours until you play it, then carry on from there. Play on a **MIDI keyboard** (every connected
  one is heard, plugging one in later works, the bar names them; it says so plainly if the browser has no MIDI or
  permission was refused), by **clicking the keys** at the bottom of the falling notes, or on the **computer
  keyboard**: A W S E D F T G Y H U J are C to B from middle C, Z and X move an octave (K stays play and pause, M the
  metronome). The letter keys go where you last clicked: in ✏️ Draw mode, or after a click on the PDF in the Both
  view, they pick drawing tools instead, and the bar says so; a click on the play-along or Play gives them back to
  the piano (4 Nov 2026). The keys to press are outlined in coral,
  the keys you press are yellow with a dot, and they sound with the piano. A chord needs all its keys, in any
  order, pressed together or still held. A wrong key is counted and the music still waits. Your notes are the
  lanes you can see, or only the muted ones if you have muted a hand to play it yourself; a hidden hand is left to
  the app, and ✂️ thinned-out octave notes are not asked for. Count-in, 🔁 loops (each pass waits again), speed and
  transpose all work (the keys asked for are the ones that sound after transposing). The bar shows a running
  `✅ first time · ❌ wrong · ⏳ waited` line; at the end, or when you pause, a card gives the result and 🔄 Start again.
- **Stepping while paused**: `,` / `.`, a bar click or a scrub while paused moves the 📍 Bar readout, the bar
  strip and the notation with the notes (they used to wait until Play).
- **Sound**: a sampled grand piano (Salamander, CC BY 3.0, credited in the section), 30 notes in minor
  thirds at three loudnesses, about 3 MB, loaded on the first Play. Dynamics in the file set the loudness.
- **Local time signatures** (one staff showing, say, 18/16 stretched over another's 3/4, as in Goldberg
  variation 26) play at the real bar length, with the stretched staff's notes scaled.
- **Play order**: repeats, first and second endings, D.C., D.S., al Fine, al Coda and section breaks are
  played as MuseScore plays them (checked against MuseScore's own repeat tests, ADR 0014).
- **Transpose**: − / + by semitone (±24). Shows the written key and the key it now sounds in, minor where
  the file says so, and for transposing up, the capo fret that keeps the written shapes on guitar (only when **🙋 I play
  on** is 🎸 Guitar; 🎹 Piano hides it). Its ✨ Auto picks Guitar when a part's name says guitar and Piano
  otherwise, and your choice is remembered per file with the other play-along settings. The key is saved
  in `piece.json`, so it opens in your key everywhere; the commit says `Transpose <file> to +2`.
- **Export**: 💾 MusicXML and 💾 MIDI download the piece in the key it is transposed to, named like
  `Gran Vals (+2).musicxml`. MusicXML is respelled for the new key (every key signature, key changes included, moves
  by the same interval, folded into seven sharps or flats, and each note is spelled in the key in force; the same
  rule as the key line and the notation; printed accidentals are left for the notation program to redo), so
  it opens in MuseScore or any notation program; MuseScore files go through our own converter first. MIDI
  is a type-1 file with a track per staff, repeats played out, written at the piece's first tempo with the
  timings from the performance (so a tempo change later on is kept in the timing but not as a tempo event),
  and with the key (transposed) and a time signature for every bar length, so the app's own reader gets the
  same notes, bars, tempo and key back. Nothing is uploaded; it is built in the browser.
- **Loop**: drag across bars on the **bar strip** above the notes, drag up or down the **bar edge** (the narrow
  column of bar numbers down the left of the falling notes, Dewi 7 Nov 2026: "select to loop any range I select"),
  or use From here / To here. Both snap to whole bars, the yellow band follows the drag, and letting go turns the
  loop on. Click a bar on either to jump to it, Shift+click on the strip to stretch the loop. The keyboard starts to
  the right of the bar edge, so the lowest notes can still be clicked for fingering; dragging the notes themselves
  still scrolls. **Speed up each loop** adds a chosen step every time
  round (0.5–20%, 5% to start with) until a chosen speed (100% to start with), both typed in beside the switch; the change happens exactly at the loop point, so no note is cut. **🔁 Loop** switches the loop off
  and on without losing it: off, the music plays straight through and the bars stay marked (paler) on the strip;
  setting a loop (From/To here, a drag, a hard bit) switches it back on. Speed runs from 5% to 200% in half-percent
  steps: drag the wide slider, use − / + or `[` / `]` (half a percent each), or type an exact number and press
  Enter (the box applies on Enter or when you leave it, so typing 50 never plays at 5% on the way). Speed, the
  speed-up step and stop, the loop and the switch are remembered per file, on every device.
- **Count-in and click**: 🥁 Count-in (on by default) plays one bar of clicks at the playing speed
  before the music starts (after a pickup, the next full bar's beats); Click puts a metronome click on
  every beat while it plays, accented on the first. Compound time counts dotted beats (6/8 in two). With Click or
  Drums on, **🎶 Per beat** sets how many clicks or hi-hat hits fall in each beat, with the metronome's own note
  buttons (♩ one, ♫ eighths, 3 triplets, ♬ sixteenths; in 6/8 ♫ is three a dotted beat and ♬ six) plus **✨ Auto**
  (the default), which adds hits as you slow down so they are never more than about 0.6 s apart: one a beat at full
  speed, eighths around half speed, sixteenths slower still (Dewi, 7 Nov 2026: "so when I slow the piece down there
  is less silence between each hit"). It is remembered per file; a ticked 🎶 Half-beats from before reads as ♫. The
  click is the metronome's own sound (`metronome/click.ts`). **🥁 Drums** (off by default, remembered per file)
  plays the beat as drums instead of the click, on its own or with Click, and names the groove it plays beside the
  tick box (💃 Waltz, with the same name as the metronome's Groove menu, which is separate): the groove follows each
  bar's meter (three beats waltz, 6/8 in eighths, otherwise rock/pop; a pickup takes the next bar's, as its last beats), Per beat sets only the hat density (the
  off-beat kick and 6/8's last-eighth open hat play at every setting, each at its own place in the beat), and the
  count-in
  becomes side sticks and a hat, the first beat louder ([ADR 0022](../adr/0022-drum-beats.md); the sounds and
  patterns are the metronome's, `drums/`). Pausing during the count-in silences the clicks
  already scheduled, and a seek, speed or loop change during it keeps the music waiting for the count-in to
  end.
- **Hard bits** (📌): with a loop set, **Save loop as hard bit** names it (default "Bars 12–16"). Saved
  hard bits are chips: click one to loop it, ✕ to forget it. Each remembers the **best speed** a whole pass
  has been played at: a pass counts only when it ran from the loop's start to its end with no jump, speed
  change or loop change inside it, so pausing near the end and speeding up does not count. With "speed up
  each loop" it climbs pass by pass. If the saved list fails to load, the panel says so with **Try again**
  and offers no save until it has loaded, so a new hard bit cannot replace the ones it could not see. Stored per music file in
  `hard-bits.json` in the data repo, saved one file at a time; commits read "Mark hard bit 'The run'" and
  "Hard bit 'The run' up to 75%".
- **Practice log**: play-along time logs itself (see the practice log feature).
- **Keys**: Space or K play/pause, in the Notes and Both views, even after clicking a tick box, the slider or a
  button, or typing a speed in the % box (which takes the typed speed); holding Space plays once; `[` `]` slower/faster, `,` `.` previous/next bar. Every shortcut is listed under ⌨️ Keys in the top bar
  ([ADR 0020](../adr/0020-one-shortcut-table.md)).

Files: `apps/web/src/music/*` (`mscx.ts`, `musicxml.ts` and `load.ts` read files into one model;
`unroll.ts` decides the play order; `performance.ts` turns bars into seconds; `transport.ts` schedules;
`player.ts` plays samples; `falling.ts` draws; `PlayAlong.tsx`, `BarStrip.tsx`), `tools/build-piano-samples.sh`,
`apps/web/public/piano/`, `DataRepo.addMusic`.

Tests: `apps/web/test/music-parse.test.ts` (one waltz in six encodings gives identical notes),
`midi.test.ts` (the MIDI reader), `music-play.test.ts`, `music-corpus.test.ts` (opt-in, real files and
MuseScore's repeat orders, and the Nocturne MIDI), `apps/server/test/data-repo.test.ts`,
`e2e/play-along.spec.ts`, `e2e/midi.spec.ts`.

Known gaps: a MIDI file's hand split is decided by the app, as for guitar scores, because MIDI does not say
which hand plays what beyond its track order; MIDI has no notation, key spelling or ties, so notes that were tied
in the source arrive as one long note or as two notes, as the file wrote them; lyrics, articulations and dynamics marks are not in the notation yet; ottava
lines, swing, pedal and grace-note timing are approximate; two of MuseScore's 69 repeat cases (a jump into
an ending that has its own repeats) differ.
