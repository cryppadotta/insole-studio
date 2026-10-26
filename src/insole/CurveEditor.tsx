import { useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { supportProfile } from "./model";

type CurveValues = { plateau: number; curve1: number; curve2: number };
type Control = keyof CurveValues;
type Props = CurveValues & {
  onChange: (value: CurveValues) => void;
  label?: string;
};
const LEFT = 24;
const TOP = 17;
const WIDTH = 238;
const HEIGHT = 100;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const labels: Record<Control, string> = {
  plateau: "Flat top radius",
  curve1: "Inner slope",
  curve2: "Outer slope",
};

/** The graph and the printed support use the same radial falloff function. */
export default function CurveEditor({
  plateau,
  curve1,
  curve2,
  onChange,
  label = "Support slope",
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ control: Control; pointerId: number } | null>(null);
  const [active, setActive] = useState<Control | null>(null);
  const id = useId().replace(/:/g, "");
  const values: CurveValues = { plateau, curve1, curve2 };
  const x = (radius: number) => LEFT + radius * WIDTH;
  const y = (height: number) => TOP + (1 - height) * HEIGHT;
  const points = {
    plateau: { x: x(plateau), y: y(1) },
    curve1: { x: x(plateau + (1 - plateau) / 3), y: y(curve1) },
    curve2: { x: x(plateau + ((1 - plateau) * 2) / 3), y: y(curve2) },
  };
  const path = Array.from({ length: 101 }, (_, index) => {
    const radius = index / 100;
    return `${index === 0 ? "M" : "L"}${x(radius).toFixed(2)},${y(supportProfile(radius, plateau, curve1, curve2)).toFixed(2)}`;
  }).join(" ");

  function move(event: PointerEvent<SVGElement>, control: Control) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    const value =
      control === "plateau"
        ? clamp((local.x - LEFT) / WIDTH, 0, 0.9)
        : clamp(1 - (local.y - TOP) / HEIGHT, 0, 1);
    onChange({ ...values, [control]: Math.round(value * 100) / 100 });
  }

  function startDrag(event: PointerEvent<SVGGElement>, control: Control) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { control, pointerId: event.pointerId };
    setActive(control);
  }

  function endDrag(event: PointerEvent<SVGElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setActive(null);
  }

  function keyboardMove(event: KeyboardEvent<SVGGElement>, control: Control) {
    if (
      ![
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    const max = control === "plateau" ? 0.9 : 1;
    const step = event.shiftKey ? 0.1 : 0.01;
    const direction =
      event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1;
    const value =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? max
          : clamp(values[control] + direction * step, 0, max);
    onChange({ ...values, [control]: Math.round(value * 100) / 100 });
  }

  return (
    <div
      className="insole-curve-editor"
      style={{
        border: "1px solid #dbe1d8",
        borderRadius: 7,
        background: "#f5f6f0",
        padding: "11px 10px 7px",
        margin: "10px 0 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          padding: "0 3px",
          color: "#66746b",
          fontSize: 10,
        }}
      >
        <span
          style={{
            letterSpacing: ".06em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <span>Drag the orange points</span>
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 286 146"
        width="100%"
        role="group"
        aria-labelledby={`${id}-title ${id}-description`}
        onPointerMove={(event) => {
          const current = dragRef.current;
          if (current && event.pointerId === current.pointerId)
            move(event, current.control);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        style={{
          display: "block",
          overflow: "visible",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <title id={`${id}-title`}>{label} curve editor</title>
        <desc id={`${id}-description`}>
          The line shows support height from its center to its edge. Drag the
          first point horizontally for a broader flat top. Drag the middle and
          outer points vertically to reshape the slope. Focus a point and use
          arrow keys for one percent, or Shift and arrows for ten percent.
        </desc>
        <style>{`.insole-curve-editor .curve-control { outline: none; cursor: ns-resize; } .insole-curve-editor .curve-control[data-control="plateau"] { cursor: ew-resize; } .insole-curve-editor .curve-focus-ring { opacity: 0; } .insole-curve-editor .curve-control:hover .curve-focus-ring, .insole-curve-editor .curve-control:focus-visible .curve-focus-ring { opacity: 1; }`}</style>
        <g stroke="#d7dfd6" strokeWidth="0.65" fill="none">
          {[0, 0.25, 0.5, 0.75, 1].map((value) => (
            <path
              key={`v${value}`}
              d={`M${x(value)},${TOP} V${TOP + HEIGHT}`}
            />
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((value) => (
            <path
              key={`h${value}`}
              d={`M${LEFT},${y(value)} H${LEFT + WIDTH}`}
            />
          ))}
        </g>
        <path
          d={`${path} L${x(1)},${y(0)} L${x(0)},${y(0)} Z`}
          fill="#4e8d77"
          fillOpacity="0.09"
        />
        <path
          d={path}
          fill="none"
          stroke="#43836e"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={`M${points.plateau.x},${points.plateau.y} L${points.curve1.x},${points.curve1.y} L${points.curve2.x},${points.curve2.y} L${x(1)},${y(0)}`}
          fill="none"
          stroke="#c58a62"
          strokeWidth="0.8"
          strokeDasharray="3 3"
          opacity="0.6"
        />
        <g fill="#89928a" fontSize="8" fontFamily="inherit">
          <text x={LEFT - 7} y={TOP + 3} textAnchor="end">
            100
          </text>
          <text x={LEFT - 7} y={y(0) + 3} textAnchor="end">
            0
          </text>
          <text x={LEFT} y="134">
            CENTER
          </text>
          <text x={LEFT + WIDTH} y="134" textAnchor="end">
            EDGE
          </text>
          <text x={LEFT + WIDTH / 2} y="134" textAnchor="middle">
            RADIUS
          </text>
        </g>
        {(Object.keys(points) as Control[]).map((control, index) => {
          const point = points[control];
          return (
            <g
              key={control}
              className="curve-control"
              data-control={control}
              transform={`translate(${point.x} ${point.y})`}
              role="slider"
              tabIndex={0}
              aria-label={`${label}: ${labels[control]}`}
              aria-valuenow={Math.round(values[control] * 100)}
              aria-valuemin={0}
              aria-valuemax={control === "plateau" ? 90 : 100}
              aria-valuetext={`${Math.round(values[control] * 100)} percent`}
              aria-orientation={
                control === "plateau" ? "horizontal" : "vertical"
              }
              onPointerDown={(event) => startDrag(event, control)}
              onKeyDown={(event) => keyboardMove(event, control)}
            >
              <title>
                {labels[control]} · {Math.round(values[control] * 100)}% · Drag
                or use arrow keys
              </title>
              <circle r="11" fill="transparent" />
              <circle
                className="curve-focus-ring"
                r="8"
                fill="#dc8d58"
                fillOpacity="0.17"
                stroke="#bd8256"
                strokeWidth="0.7"
                style={active === control ? { opacity: 1 } : undefined}
              />
              <circle
                r="4.2"
                fill="#d58b59"
                stroke="#fffaf0"
                strokeWidth="1.5"
              />
              <text
                x="0"
                y="1.8"
                textAnchor="middle"
                fill="#fffaf0"
                fontSize="5.4"
                fontFamily="inherit"
                fontWeight="600"
                pointerEvents="none"
              >
                {index + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 4,
          padding: "0 3px",
          color: "#7b857b",
          fontSize: 9,
        }}
      >
        <span>1 · Flat top {Math.round(plateau * 100)}%</span>
        <span>2 · Inner {Math.round(curve1 * 100)}%</span>
        <span>3 · Outer {Math.round(curve2 * 100)}%</span>
      </div>
    </div>
  );
}
