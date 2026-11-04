import { strings, tips } from '../strings.ts';
import { useHelp } from '../ui/Help.tsx';
import type { FileCheck } from './file-check.ts';

export function FileCheckLine({ check }: { check: FileCheck }) {
  const help = useHelp(tips.fileCheck.title, 'file-check', strings.fileCheck.help);
  const f = check.fingers;
  const guitar = f.guitarLeft + f.guitarRight + f.string;
  const facts = [
    strings.fileCheck.declared[check.declared],
    strings.fileCheck.layout[check.layout],
    f.piano + guitar === 0
      ? strings.fileCheck.noFingers
      : guitar === 0
        ? strings.fileCheck.pianoFingers(f.piano)
        : f.piano === 0
          ? strings.fileCheck.guitarFingers(guitar)
          : strings.fileCheck.bothFingers(f.piano, guitar),
  ];
  return (
    <>
      <span
        className="playalong-field file-check"
        title={tips.fileCheck.title}
        data-testid="file-check"
        data-verdict={check.verdict}
      >
        <span className="playalong-label">{strings.fileCheck.label}</span>
        <span>{strings.fileCheck.verdict[check.verdict]}</span>
        <span className="muted small-print">{facts.join(' · ')}</span>
        {help.button}
      </span>
      {help.text}
    </>
  );
}
