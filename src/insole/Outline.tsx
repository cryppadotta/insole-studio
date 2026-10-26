import { useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  clampParams,
  cloneParams,
  outlineAt,
  outlinePoints,
  PARAM_LIMITS,
} from "./model";
import type { InsoleParams, MetPad } from "./model";
import DensityOverlay from "./DensityOverlay";

type Feature = "outline" | "arch" | "heel" | "met";
type Handle =
  "length" | "width" | "heelWidth" | "archWidth" | "arch" | "pad" | "rotation";
type Point = { x: number; y: number };
type Props = {
  params: InsoleParams;
  side: "left" | "right";
  onChange: (params: InsoleParams) => void;
  selected: Feature;
  onSelect?: (feature: Feature) => void;
  selectedPadId?: string;
  onSelectPad?: (id: string) => void;
  densityMode?: boolean;
  selectedDensityZoneId?: string;
  onSelectDensityZone?: (id: string) => void;
};

const HEEL_Y = 340;
const FOREFOOT_T = 0.72;
const HEEL_T = 0.15;
const WAIST_T = 0.43;
const featureForHandle: Record<Handle, Feature> = {
  length: "outline",
  width: "outline",
  heelWidth: "heel",
  archWidth: "outline",
  arch: "arch",
  pad: "met",
  rotation: "met",
};
const labelForHandle: Record<Handle, string> = {
  length: "Overall length",
  width: "Forefoot width",
  heelWidth: "Heel width",
  archWidth: "Midfoot width",
  arch: "Arch position",
  pad: "Metatarsal pad position",
  rotation: "Metatarsal pad rotation",
};

export default function InsoleOutline({
  params,
  side,
  onChange,
  selected,
  onSelect,
  selectedPadId,
  onSelectPad,
  densityMode = false,
  selectedDensityZoneId,
  onSelectDensityZone,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    handle: Handle;
    padId?: string;
    pointerId: number;
    params: InsoleParams;
    start: Point;
    origin: Point;
  } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const id = useId().replace(/:/g, "");
  const mirror = side === "right" ? 1 : -1;
  const sx = (x: number) => x * mirror;
  const sy = (y: number) => HEEL_Y - y;
  const forefoot = outlineAt(params, FOREFOOT_T);
  const heel = outlineAt(params, HEEL_T);
  const waist = outlineAt(params, WAIST_T);
  const toe = outlineAt(params, 1);
  const path =
    outlinePoints(params, side, 120)
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${sy(point.y).toFixed(2)}`,
      )
      .join(" ") + " Z";
  const top = sy(params.length);
  const widthDimY = top - 31;
  const lengthDimX = -Math.max(77, params.width / 2 + 28);
  // A fixed working frame while dragging keeps the length landmark under the pointer.
  const frameLength = Math.max(
    330,
    dragRef.current?.params.length ?? params.length,
  );
  const frameWidth = Math.max(
    224,
    (dragRef.current?.params.width ?? params.width) + 100,
  );
  const frameTop = Math.min(-35, HEEL_Y - frameLength - 55);
  const handles: Record<Exclude<Handle, "pad" | "rotation">, Point> = {
    length: { x: sx((toe.left + toe.right) / 2), y: top },
    width: { x: sx(forefoot.right), y: sy(params.length * FOREFOOT_T) },
    heelWidth: { x: sx(heel.right), y: sy(params.length * HEEL_T) },
    archWidth: { x: sx(waist.left), y: sy(params.length * WAIST_T) },
    arch: {
      x: sx(params.archOffset),
      y: sy(params.archPosition * params.length),
    },
  };
  const padCenter = (pad: MetPad): Point => ({
    x: sx(pad.offset),
    y: sy(pad.position * params.length),
  });
  const padRotationPoint = (pad: MetPad): Point => {
    const angle = (pad.rotation * Math.PI) / 180;
    const radius = pad.length / 2 + 12;
    return {
      x: sx(pad.offset - Math.sin(angle) * radius),
      y: sy(pad.position * params.length + Math.cos(angle) * radius),
    };
  };

  function localPoint(event: PointerEvent<SVGElement>) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  }

  function select(handle: Handle, padId?: string) {
    onSelect?.(featureForHandle[handle]);
    if (padId) onSelectPad?.(padId);
  }

  function moveHandle(
    handle: Handle,
    point: Point,
    base: InsoleParams,
    padId?: string,
  ) {
    const x = point.x * mirror;
    const y = HEEL_Y - point.y;
    const next = cloneParams(base);
    if (handle === "length") next.length = Math.round(y);
    if (
      handle === "width" ||
      handle === "heelWidth" ||
      handle === "archWidth"
    ) {
      const station =
        handle === "width"
          ? FOREFOOT_T
          : handle === "heelWidth"
            ? HEEL_T
            : WAIST_T;
      const edge = handle === "archWidth" ? "left" : "right";
      let [low, high] = PARAM_LIMITS[handle];
      for (let i = 0; i < 14; i++) {
        const mid = (low + high) / 2;
        const value = outlineAt({ ...base, [handle]: mid }, station)[edge];
        if (value < x === (edge === "right")) low = mid;
        else high = mid;
      }
      next[handle] = Math.round((low + high) / 2);
    }
    if (handle === "arch") {
      next.archOffset = Math.round(x * 2) / 2;
      next.archPosition = Math.round((y / base.length) * 1000) / 1000;
    }
    if (handle === "pad" || handle === "rotation") {
      const pad = next.pads.find((item) => item.id === padId);
      if (!pad) return;
      if (handle === "pad") {
        pad.offset = Math.round(x * 2) / 2;
        pad.position = Math.round((y / base.length) * 1000) / 1000;
      } else {
        const angle =
          (Math.atan2(y - pad.position * base.length, x - pad.offset) * 180) /
            Math.PI -
          90;
        pad.rotation = Math.round(((angle + 540) % 360) - 180);
      }
    }
    onChange(clampParams(next));
  }

  function startDrag(
    event: PointerEvent<SVGGElement>,
    handle: Handle,
    pad?: MetPad,
  ) {
    if (event.button !== 0) return;
    const point = localPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin =
      handle === "rotation" && pad
        ? point
        : handle === "pad" && pad
          ? padCenter(pad)
          : handles[handle as keyof typeof handles];
    dragRef.current = {
      handle,
      padId: pad?.id,
      pointerId: event.pointerId,
      params: cloneParams(params),
      start: point,
      origin,
    };
    setActive(`${handle}:${pad?.id ?? ""}`);
    select(handle, pad?.id);
  }

  function drag(event: PointerEvent<SVGSVGElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = localPoint(event);
    if (!point) return;
    moveHandle(
      current.handle,
      current.handle === "rotation"
        ? point
        : {
            x: current.origin.x + point.x - current.start.x,
            y: current.origin.y + point.y - current.start.y,
          },
      current.params,
      current.padId,
    );
  }

  function endDrag(event: PointerEvent<SVGElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setActive(null);
  }

  function keyboardMove(
    event: KeyboardEvent<SVGGElement>,
    handle: Handle,
    pad?: MetPad,
  ) {
    if (
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    event.preventDefault();
    const amount = event.shiftKey ? 5 : 1;
    if (handle === "rotation" && pad) {
      const next = cloneParams(params);
      const target = next.pads.find((item) => item.id === pad.id);
      if (target)
        target.rotation =
          ((target.rotation +
            (event.key === "ArrowUp" || event.key === "ArrowRight" ? 5 : -5) *
              amount +
            540) %
            360) -
          180;
      onChange(clampParams(next));
    } else {
      const dx =
        event.key === "ArrowRight"
          ? amount
          : event.key === "ArrowLeft"
            ? -amount
            : 0;
      const dy =
        event.key === "ArrowDown"
          ? amount
          : event.key === "ArrowUp"
            ? -amount
            : 0;
      const point =
        handle === "pad" && pad
          ? padCenter(pad)
          : handles[handle as keyof typeof handles];
      const scalarHorizontal =
        handle === "width" || handle === "heelWidth" || handle === "archWidth";
      moveHandle(
        handle,
        {
          x:
            point.x +
            (scalarHorizontal && dx === 0 ? -dy * Math.sign(point.x) : dx),
          y: point.y + (handle === "length" && dy === 0 ? -dx : dy),
        },
        params,
        pad?.id,
      );
    }
    select(handle, pad?.id);
  }

  const landmark = (handle: Handle, point: Point, pad?: MetPad) => {
    const position = handle === "arch" || handle === "pad";
    const rotation = handle === "rotation";
    const shown =
      handle === "arch"
        ? selected === "arch"
        : pad
          ? selected === "met" && pad.id === selectedPadId
          : true;
    const scalar = !position && !rotation;
    const value = scalar
      ? params[handle as "length" | "width" | "heelWidth" | "archWidth"]
      : rotation
        ? pad?.rotation
        : undefined;
    const bounds = scalar
      ? PARAM_LIMITS[handle as "length" | "width" | "heelWidth" | "archWidth"]
      : [-180, 180];
    const label = pad
      ? `${pad.name} ${rotation ? "rotation" : "position"}`
      : labelForHandle[handle];
    return (
      <g
        key={`${handle}:${pad?.id ?? ""}`}
        className="outline-landmark"
        transform={`translate(${point.x} ${point.y})`}
        tabIndex={0}
        role={scalar || rotation ? "slider" : "button"}
        aria-label={label}
        aria-valuenow={scalar || rotation ? value : undefined}
        aria-valuemin={scalar || rotation ? bounds[0] : undefined}
        aria-valuemax={scalar || rotation ? bounds[1] : undefined}
        aria-valuetext={
          rotation
            ? `${value} degrees`
            : scalar
              ? `${value} millimeters`
              : undefined
        }
        aria-orientation={
          scalar ? (handle === "length" ? "vertical" : "horizontal") : undefined
        }
        onPointerDown={(event) => startDrag(event, handle, pad)}
        onKeyDown={(event) => keyboardMove(event, handle, pad)}
        onFocus={() => select(handle, pad?.id)}
        opacity={shown ? 1 : 0.5}
      >
        <title>
          {label} ·{" "}
          {rotation
            ? `${value}° · Drag or use arrows to rotate`
            : position
              ? "Drag or use arrow keys to move in two dimensions"
              : `${value} mm · Drag or use arrow keys`}
        </title>
        <circle r="10" fill="transparent" />
        <circle
          className="landmark-ring"
          r="7"
          fill="#dc8d58"
          fillOpacity="0.15"
          stroke="#dc8d58"
          strokeWidth="0.5"
          style={
            active === `${handle}:${pad?.id ?? ""}` ? { opacity: 1 } : undefined
          }
        />
        <circle
          className="landmark-core"
          r={position || rotation ? 2.7 : 3.3}
          fill={shown ? "#dc8d58" : "#e8f0e8"}
          stroke="#fff9f0"
          strokeWidth="1.5"
        />
        {position ? (
          <path
            d="M-1.3,0 H1.3 M0,-1.3 V1.3"
            fill="none"
            stroke={shown ? "#fff9f0" : "#b88052"}
            strokeWidth="0.6"
            pointerEvents="none"
          />
        ) : null}
        {rotation ? (
          <path
            d="M-1.3,.7 A1.5,1.5 0 1 1 1,-1 M1,-1 V-2 M1,-1 H0"
            fill="none"
            stroke="#fff9f0"
            strokeWidth="0.55"
            pointerEvents="none"
          />
        ) : null}
      </g>
    );
  };

  return (
    <div className="insole-outline">
      <svg
        ref={svgRef}
        viewBox={`${-frameWidth / 2} ${frameTop} ${frameWidth} ${376 - frameTop}`}
        width="100%"
        height="100%"
        aria-labelledby={`${id}-title ${id}-description`}
        onPointerMove={drag}
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
        <title id={`${id}-title`}>
          {side === "right" ? "Right" : "Left"} insole outline editor
        </title>
        <desc id={`${id}-description`}>
          Drag orange landmarks to change length and widths. Drag the arch and
          any pad to position them in two dimensions. The outer handle rotates
          the selected pad. Focus a landmark and use arrow keys; hold Shift for
          larger adjustments.
        </desc>
        <defs>
          <pattern
            id={`${id}-grid`}
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="0" cy="0" r="0.48" fill="#b6c4bc" opacity="0.48" />
          </pattern>
          <clipPath id={`${id}-clip`}>
            <path d={path} />
          </clipPath>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e7f0e9" />
            <stop offset="1" stopColor="#d5e7de" />
          </linearGradient>
        </defs>
        <style>{`.insole-outline .outline-landmark { outline: none; cursor: grab; } .insole-outline .outline-landmark:active { cursor: grabbing; } .insole-outline .outline-landmark .landmark-ring { opacity: 0; transition: opacity 120ms; } .insole-outline .outline-landmark:hover .landmark-ring, .insole-outline .outline-landmark:focus-visible .landmark-ring { opacity: 1; } .insole-outline .outline-landmark:focus-visible .landmark-core { stroke: #283d34; stroke-width: 2; } .insole-outline .feature-region { cursor: pointer; }`}</style>
        <rect
          x={-frameWidth / 2 + 2}
          y={frameTop + 2}
          width={frameWidth - 4}
          height={372 - frameTop}
          fill={`url(#${id}-grid)`}
        />
        <g fill="none" stroke="#aeb9b1" strokeWidth="0.65">
          <path
            d={`M${lengthDimX - 3},${top} H-5 M${lengthDimX - 3},${HEEL_Y} H-5 M${lengthDimX},${top} V${HEEL_Y}`}
          />
          <path
            d={`M${lengthDimX - 3},${top + 3} l6,-6 M${lengthDimX - 3},${HEEL_Y + 3} l6,-6`}
          />
          <path
            d={`M${-params.width / 2},${widthDimY - 3} V${sy(params.length * FOREFOOT_T) - 6} M${params.width / 2},${widthDimY - 3} V${sy(params.length * FOREFOOT_T) - 6}`}
            strokeDasharray="2 3"
          />
          <path
            d={`M${-params.width / 2},${widthDimY} H${params.width / 2} M${-params.width / 2 - 3},${widthDimY + 3} l6,-6 M${params.width / 2 - 3},${widthDimY + 3} l6,-6`}
          />
        </g>
        <g fill="#7e8a81" fontSize="7" fontFamily="inherit" letterSpacing="0.6">
          <text
            x={lengthDimX - 9}
            y={(top + HEEL_Y) / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${lengthDimX - 9} ${(top + HEEL_Y) / 2})`}
          >
            {params.length} mm
          </text>
          <text x="0" y={widthDimY - 8} textAnchor="middle">
            {params.width} mm
          </text>
          <text
            x="0"
            y={top - 13}
            textAnchor="middle"
            fontSize="5.7"
            letterSpacing="1.6"
          >
            TOE
          </text>
          <text
            x="0"
            y="358"
            textAnchor="middle"
            fontSize="5.7"
            letterSpacing="1.6"
          >
            HEEL
          </text>
          <text
            x={-params.width / 2 - 13}
            y="241"
            textAnchor="middle"
            transform={`rotate(-90 ${-params.width / 2 - 13} 241)`}
            fontSize="5.5"
            letterSpacing="1.2"
          >
            {side === "right" ? "MEDIAL" : "LATERAL"}
          </text>
          <text
            x={params.width / 2 + 17}
            y="241"
            textAnchor="middle"
            transform={`rotate(90 ${params.width / 2 + 17} 241)`}
            fontSize="5.5"
            letterSpacing="1.2"
          >
            {side === "right" ? "LATERAL" : "MEDIAL"}
          </text>
        </g>
        <path
          d={path}
          fill={`url(#${id}-fill)`}
          stroke="#3a806d"
          strokeWidth={selected === "outline" ? 1.3 : 0.9}
          className="feature-region"
          onClick={() => {
            if (!densityMode) onSelect?.("outline");
          }}
        />
        <g clipPath={`url(#${id}-clip)`}>
          {densityMode && (
            <DensityOverlay
              params={params}
              side={side}
              onChange={onChange}
              selectedZoneId={selectedDensityZoneId}
              onSelectZone={onSelectDensityZone}
            />
          )}
          <g style={{ display: densityMode ? "none" : undefined }}>
            <path
              d={`M0,${top + 5} V${HEEL_Y}`}
              stroke="#79a28d"
              strokeWidth="0.6"
              strokeDasharray="3 4"
              opacity="0.45"
            />
            <g
              transform={`translate(${sx(params.archOffset)} ${sy(params.archPosition * params.length)}) rotate(${-mirror * params.archRotation})`}
              className="outline-landmark"
              role="button"
              tabIndex={0}
              aria-label="Move arch support"
              onPointerDown={(event) => startDrag(event, "arch")}
              onKeyDown={(event) => keyboardMove(event, "arch")}
              onFocus={() => select("arch")}
            >
              <ellipse
                rx={params.archSpan / 2}
                ry={params.archLength / 2}
                fill={selected === "arch" ? "#77b59a" : "#a0c4ad"}
                fillOpacity={selected === "arch" ? 0.29 : 0.18}
                stroke="#78a88e"
                strokeWidth="0.7"
                strokeDasharray="2.4 2.4"
              />
              {[0.38, 0.68].map((scale) => (
                <ellipse
                  key={scale}
                  rx={(params.archSpan / 2) * scale}
                  ry={(params.archLength / 2) * scale}
                  fill="none"
                  stroke="#78a88e"
                  strokeWidth="0.7"
                  opacity={selected === "arch" ? 0.8 : 0.36}
                  pointerEvents="none"
                />
              ))}
            </g>
            {[0, 1, 2].map((index) => (
              <path
                key={index}
                d={`M${sx(heel.left + 3 + index * 5)},${sy(params.length * 0.24)} C${sx(heel.left + 4 + index * 4)},${HEEL_Y - 10 - index * 3} ${sx(heel.right - 4 - index * 4)},${HEEL_Y - 10 - index * 3} ${sx(heel.right - 3 - index * 5)},${sy(params.length * 0.24)}`}
                fill="none"
                stroke="#7aa38a"
                strokeWidth="0.65"
                opacity={selected === "heel" ? 0.85 : 0.3}
                className="feature-region"
                onClick={() => onSelect?.("heel")}
              />
            ))}
            {params.pads.map((pad, index) => {
              const chosen = selected === "met" && selectedPadId === pad.id;
              return (
                <g
                  key={pad.id}
                  transform={`translate(${sx(pad.offset)} ${sy(pad.position * params.length)}) rotate(${-mirror * pad.rotation})`}
                  className="outline-landmark"
                  role="button"
                  tabIndex={0}
                  aria-label={`Move ${pad.name}${pad.enabled ? "" : " (disabled)"}`}
                  onPointerDown={(event) => startDrag(event, "pad", pad)}
                  onKeyDown={(event) => keyboardMove(event, "pad", pad)}
                  onFocus={() => select("pad", pad.id)}
                >
                  <title>
                    {pad.name} · {pad.enabled ? "Drag to move" : "Disabled"}
                  </title>
                  <ellipse
                    rx={pad.width / 2}
                    ry={pad.length / 2}
                    fill={
                      pad.enabled ? (chosen ? "#e1b38b" : "#accab4") : "none"
                    }
                    fillOpacity={chosen ? 0.4 : 0.3}
                    stroke={
                      chosen ? "#bd8256" : pad.enabled ? "#83a88b" : "#a6aaa1"
                    }
                    strokeWidth={chosen ? 1.1 : 0.75}
                    strokeDasharray={pad.enabled ? "2.4 2.4" : "1 4"}
                  />
                  {[0.42, 0.7].map((scale) => (
                    <ellipse
                      key={scale}
                      rx={(pad.width / 2) * scale}
                      ry={(pad.length / 2) * scale}
                      fill="none"
                      stroke={chosen ? "#bd8256" : "#83a88b"}
                      opacity={pad.enabled ? 0.38 : 0.13}
                      strokeWidth="0.6"
                      pointerEvents="none"
                    />
                  ))}
                  <text
                    x="0"
                    y="-5"
                    textAnchor="middle"
                    fontSize="5.5"
                    fill={chosen ? "#9a613d" : "#6c8c76"}
                    pointerEvents="none"
                    transform={`rotate(${mirror * pad.rotation})`}
                  >
                    {index + 1}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
        <g style={{ display: densityMode ? "none" : undefined }}>
          {(Object.keys(handles) as (keyof typeof handles)[]).map((handle) =>
            landmark(handle, handles[handle]),
          )}
          {params.pads.map((pad) => landmark("pad", padCenter(pad), pad))}
          {params.pads
            .filter((pad) => selected === "met" && pad.id === selectedPadId)
            .map((pad) => {
              const center = padCenter(pad);
              const rotor = padRotationPoint(pad);
              return (
                <g key={`rotor:${pad.id}`}>
                  <path
                    d={`M${center.x},${center.y} L${rotor.x},${rotor.y}`}
                    stroke="#c68c60"
                    strokeWidth="0.65"
                    strokeDasharray="2 2"
                    pointerEvents="none"
                  />
                  {landmark("rotation", rotor, pad)}
                </g>
              );
            })}
        </g>
      </svg>
    </div>
  );
}
