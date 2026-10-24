import { STAMP_GLYPHS } from '@pcaa/shared';
import { ZoomControl } from '../score/ZoomControl.tsx';
import {
  COLOURS,
  HIGHLIGHTS,
  STAMP_LABELS,
  TOOL_LABELS,
  type SizeName,
  type Tool,
  type ToolState,
} from './tools.ts';
import { strings, tips } from '../strings.ts';

interface Props {
  tools: ToolState;
  onChange: (patch: Partial<ToolState>) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelected: (() => void) | null;
  zoom: number;
  onZoom: (zoom: number) => void;
  extra?: React.ReactNode;
}

const TOOLS: Tool[] = [
  'select',
  'pen',
  'highlighter',
  'eraser',
  'text',
  'line',
  'arrow',
  'rect',
  'ellipse',
  'stamp',
];
const SIZE_NAMES: SizeName[] = ['S', 'M', 'L'];

export function Toolbar(props: Props) {
  const { tools, onChange } = props;
  const swatches = tools.tool === 'highlighter' ? HIGHLIGHTS : COLOURS;
  const activeColour = tools.tool === 'highlighter' ? tools.highlightColour : tools.colour;

  return (
    <div className="toolbar-wrap">
      <div className="toolbar" role="toolbar" aria-label={tips.drawings.toolbar}>
        <div className="tool-group">
          {TOOLS.map((tool) => (
            <button
              key={tool}
              type="button"
              className="btn small icon tool-btn"
              aria-pressed={tools.tool === tool}
              aria-label={TOOL_LABELS[tool].label}
              title={tips.drawings.tool(TOOL_LABELS[tool].label, TOOL_LABELS[tool].key)}
              data-tool={tool}
              onClick={() => {
                onChange({ tool });
              }}
            >
              {TOOL_LABELS[tool].icon}
            </button>
          ))}
          <span className="divider" />
          {swatches.map((colour) => (
            <button
              key={colour}
              type="button"
              className="swatch"
              style={{ background: colour }}
              aria-label={tips.drawings.colour(colour)}
              aria-pressed={activeColour === colour}
              onClick={() => {
                onChange(tools.tool === 'highlighter' ? { highlightColour: colour } : { colour });
              }}
            />
          ))}
          <span className="divider" />
          {SIZE_NAMES.map((size) => (
            <button
              key={size}
              type="button"
              className="btn small icon"
              aria-pressed={tools.size === size}
              aria-label={tips.drawings.size(size)}
              onClick={() => {
                onChange({ size });
              }}
            >
              {size}
            </button>
          ))}
        </div>
        <div className="tool-group">
          <button
            type="button"
            className="btn small"
            disabled={!props.canUndo}
            onClick={props.onUndo}
            title={tips.drawings.undo}
          >
            {strings.drawings.undo}
          </button>
          <button
            type="button"
            className="btn small"
            disabled={!props.canRedo}
            onClick={props.onRedo}
            title={tips.drawings.redo}
          >
            {strings.drawings.redo}
          </button>
          {props.onDeleteSelected && (
            <button
              type="button"
              className="btn small coral"
              onClick={props.onDeleteSelected}
              title={tips.drawings.delete}
            >
              {strings.common.delete}
            </button>
          )}
          <span className="divider" />
          <ZoomControl zoom={props.zoom} onZoom={props.onZoom} />
          {props.extra}
        </div>
      </div>
      {tools.tool === 'stamp' && (
        <div className="toolbar stamp-picker" aria-label={tips.drawings.stamps}>
          {STAMP_GLYPHS.map((glyph) => (
            <button
              key={glyph}
              type="button"
              className="btn small"
              aria-pressed={tools.glyph === glyph}
              title={STAMP_LABELS[glyph]}
              aria-label={STAMP_LABELS[glyph]}
              onClick={() => {
                onChange({ glyph });
              }}
            >
              {glyph}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
