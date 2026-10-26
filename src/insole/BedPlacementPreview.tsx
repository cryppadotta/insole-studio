import { outlinePoints, type InsoleParams } from "./model";
import { MK4S_BED, type BedPlacement } from "./placement";

export default function BedPlacementPreview({
  params,
  side,
  placement,
}: {
  params: InsoleParams;
  side: "left" | "right";
  placement: BedPlacement;
}) {
  const radians = (placement.rotationDegrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const path =
    outlinePoints(params, side, 192)
      .map(({ x, y }, index) => {
        const px = x * cosine - y * sine + placement.translation.x;
        const py =
          MK4S_BED.depth - (x * sine + y * cosine + placement.translation.y);
        return `${index ? "L" : "M"}${px.toFixed(3)},${py.toFixed(3)}`;
      })
      .join(" ") + " Z";
  const footName = side === "right" ? "Right" : "Left";
  return (
    <figure className={`sole-bed-preview ${placement.fits ? "" : "outside"}`}>
      <svg
        viewBox="-3 -3 256 216"
        role="img"
        aria-label={`${footName} insole on the MK4/MK4S bed, rotated ${placement.rotationDegrees.toFixed(1)} degrees at 100 percent scale. ${placement.fits ? "Fits the selected edge clearance." : "Does not fit the selected edge clearance."}`}
      >
        <rect width="250" height="210" rx="2" fill="#edf2e7" stroke="#bcccb2" />
        <path
          d="M50 0V210M100 0V210M150 0V210M200 0V210M0 42H250M0 84H250M0 126H250M0 168H250"
          stroke="#d7e1cf"
          strokeWidth="0.6"
        />
        <rect
          x={placement.requiredClearance}
          y={placement.requiredClearance}
          width={MK4S_BED.width - placement.requiredClearance * 2}
          height={MK4S_BED.depth - placement.requiredClearance * 2}
          fill="none"
          stroke="#a2b494"
          strokeWidth="0.7"
          strokeDasharray="3 3"
        />
        <path
          d={path}
          fill={placement.fits ? "#c7dfd2" : "#ecd2b5"}
          stroke={placement.fits ? "#507b62" : "#af7643"}
          strokeWidth="1.2"
        />
      </svg>
      <figcaption>
        <strong>{footName} insole</strong>
        <span>
          {placement.rotationDegrees.toFixed(1)}° rotation · 100% scale
        </span>
        <span>
          {placement.size.width.toFixed(1)} × {placement.size.depth.toFixed(1)}{" "}
          mm
        </span>
        <small>
          {placement.fits
            ? `${Math.max(0, placement.clearance).toFixed(1)} mm minimum edge clearance`
            : "Outside the selected clearance"}
        </small>
      </figcaption>
    </figure>
  );
}
