import { useRef, type PointerEvent, type KeyboardEvent } from "react";
import type { InsoleParams } from "./model";
import { getDensityRegions, type DensityZone } from "./density";
import { densityPatternLabel } from "./RegionMaterialControls";

export const densityColor = (infill: number) =>
  `hsl(${190 - infill * 1.5} 42% 62%)`;
export default function DensityOverlay({
  params: p,
  side,
  selectedZoneId,
  onSelectZone,
  onChange,
}: {
  params: InsoleParams;
  side: "left" | "right";
  selectedZoneId?: string;
  onSelectZone?: (id: string) => void;
  onChange: (p: InsoleParams) => void;
}) {
  const mirror = side === "left" ? -1 : 1;
  const drag = useRef<{
    id: string;
    pointerId: number;
    point: { x: number; y: number };
    zone: DensityZone;
  } | null>(null);
  const local = (e: PointerEvent<SVGGElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    return point.matrixTransform(matrix.inverse());
  };
  const update = (zone: DensityZone) =>
    onChange({
      ...p,
      density: {
        ...p.density,
        zones: p.density.zones.map((z) => (z.id === zone.id ? zone : z)),
      },
    });
  const key = (e: KeyboardEvent<SVGGElement>, zone: DensityZone) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
      return;
    e.preventDefault();
    const amount = e.shiftKey ? 5 : 1;
    update({
      ...zone,
      offset:
        zone.offset +
        (e.key === "ArrowRight"
          ? amount * mirror
          : e.key === "ArrowLeft"
            ? -amount * mirror
            : 0),
      position:
        zone.position +
        (e.key === "ArrowUp"
          ? amount / p.length
          : e.key === "ArrowDown"
            ? -amount / p.length
            : 0),
    });
  };
  return (
    <g className="sole-density-plan">
      {getDensityRegions(p).map((region, index) => {
        const zone =
          region.source === "zone"
            ? p.density.zones.find((z) => z.id === region.sourceId)
            : undefined;
        const selected = zone?.id === selectedZoneId;
        return (
          <g
            key={region.id}
            transform={`translate(${region.offset * mirror} ${340 - region.position * p.length}) rotate(${-mirror * region.rotation})`}
            role={zone ? "button" : undefined}
            aria-label={zone ? `Move density region ${zone.name}` : undefined}
            tabIndex={zone ? 0 : undefined}
            style={{ cursor: zone ? "grab" : "default", outline: "none" }}
            onFocus={() => {
              if (zone) onSelectZone?.(zone.id);
            }}
            onKeyDown={(e) => {
              if (zone) key(e, zone);
            }}
            onPointerDown={(e) => {
              if (!zone || e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              const point = local(e);
              if (!point) return;
              e.currentTarget.focus();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                id: zone.id,
                pointerId: e.pointerId,
                point,
                zone: { ...zone },
              };
              onSelectZone?.(zone.id);
            }}
            onPointerMove={(e) => {
              const current = drag.current;
              if (
                !current ||
                current.id !== zone?.id ||
                current.pointerId !== e.pointerId
              )
                return;
              const point = local(e);
              if (!point) return;
              update({
                ...current.zone,
                offset:
                  Math.round(
                    (current.zone.offset +
                      (point.x - current.point.x) * mirror) *
                      2,
                  ) / 2,
                position:
                  Math.round(
                    (current.zone.position -
                      (point.y - current.point.y) / p.length) *
                      1000,
                  ) / 1000,
              });
            }}
            onPointerUp={(e) => {
              if (drag.current?.pointerId === e.pointerId) drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
          >
            <title>
              {region.name} · {region.infill}%{" "}
              {densityPatternLabel(region.pattern)} · {region.temperature}°C
              target · {region.scope} · priority {index + 1}
            </title>
            {region.shape === "ellipse" ? (
              <ellipse
                rx={region.width / 2}
                ry={region.length / 2}
                fill={densityColor(region.infill)}
                fillOpacity={selected ? 0.56 : 0.3}
                stroke={selected ? "#c3834e" : densityColor(region.infill)}
                strokeWidth={selected ? 1.7 : 1}
                strokeDasharray={selected ? "none" : "2 2"}
              />
            ) : (
              <rect
                x={-region.width / 2}
                y={-region.length / 2}
                width={region.width}
                height={region.length}
                fill={densityColor(region.infill)}
                fillOpacity={selected ? 0.56 : 0.3}
                stroke={selected ? "#c3834e" : densityColor(region.infill)}
                strokeWidth={selected ? 1.7 : 1}
                strokeDasharray={selected ? "none" : "2 2"}
              />
            )}
            <g
              transform={`rotate(${mirror * region.rotation})`}
              pointerEvents="none"
            >
              <text y="-5" textAnchor="middle" fontSize="6" fill="#35544a">
                {region.infill}% · {densityPatternLabel(region.pattern)}
              </text>
              <text y="8" textAnchor="middle" fontSize="5" fill="#35544a">
                {region.temperature}°C target
              </text>
              {zone && (
                <>
                  <circle
                    r={selected ? 3.2 : 2}
                    fill={selected ? "#d18c5a" : "#fafbf5"}
                    stroke="#c28b5c"
                    strokeWidth=".7"
                  />
                  <path d="M-5 0H5M0-5V5" stroke="#a77647" strokeWidth=".4" />
                </>
              )}
            </g>
          </g>
        );
      })}
    </g>
  );
}
