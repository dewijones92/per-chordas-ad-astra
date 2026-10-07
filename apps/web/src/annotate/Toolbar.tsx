import { STAMP_GLYPHS } from '@pcaa/shared';
import {
  COLOURS,
  HIGHLIGHTS,
  STAMP_LABELS,
  TOOL_LABELS,
  type SizeName,
  type Tool,
  type ToolState,
} from './tools.ts';

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
      <div className="toolbar" role="toolbar" aria-label="Annotation tools">
        <div className="tool-group">
          {TOOLS.map((tool) => (
            <button
              key={tool}
              type="button"
              className="btn small icon tool-btn"
              aria-pressed={tools.tool === tool}
              aria-label={TOOL_LABELS[tool].label}
              title={`${TOOL_LABELS[tool].label} (${TOOL_LABELS[tool].key})`}
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
              aria-label={`Colour ${colour}`}
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
              aria-label={`Size ${size}`}
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
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            type="button"
            className="btn small"
            disabled={!props.canRedo}
            onClick={props.onRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↷ Redo
          </button>
          {props.onDeleteSelected && (
            <button
              type="button"
              className="btn small coral"
              onClick={props.onDeleteSelected}
              title="Delete (Del)"
            >
              Delete
            </button>
          )}
          <span className="divider" />
          <button
            type="button"
            className="btn small icon"
            aria-label="Zoom out"
            onClick={() => {
              props.onZoom(Math.max(0.4, props.zoom - 0.1));
            }}
          >
            −
          </button>
          <span className="muted zoom-label">{Math.round(props.zoom * 100)}%</span>
          <button
            type="button"
            className="btn small icon"
            aria-label="Zoom in"
            onClick={() => {
              props.onZoom(Math.min(2.5, props.zoom + 0.1));
            }}
          >
            +
          </button>
          {props.extra}
        </div>
      </div>
      {tools.tool === 'stamp' && (
        <div className="toolbar stamp-picker" aria-label="Stamps">
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
