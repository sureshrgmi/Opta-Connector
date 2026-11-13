export const PITCH_VIEWBOX = { width: 1000, height: 560 } as const;
export const STATSBOMB_PITCH = { x: 70, y: 58, width: 860, height: 444 } as const;

export function StatsBombPitch() {
  const pitch = STATSBOMB_PITCH;
  return (
    <g>
      <rect x={pitch.x} y={pitch.y} width={pitch.width} height={pitch.height} rx="4" fill="#167668" />
      {Array.from({ length: 6 }, (_, index) => (
        <rect
          key={index}
          x={pitch.x + index * (pitch.width / 6)}
          y={pitch.y}
          width={pitch.width / 12}
          height={pitch.height}
          fill="#ffffff"
          fillOpacity=".0392"
        />
      ))}
      <g fill="none" stroke="#dce5ec" strokeOpacity=".7" strokeWidth="2">
        <rect x={pitch.x + 10} y={pitch.y + 10} width={pitch.width - 20} height={pitch.height - 20} />
        <line
          x1={pitch.x + pitch.width / 2}
          y1={pitch.y + 10}
          x2={pitch.x + pitch.width / 2}
          y2={pitch.y + pitch.height - 10}
        />
        <circle
          cx={pitch.x + pitch.width / 2}
          cy={pitch.y + pitch.height / 2}
          r={pitch.height * 9.15 / 80}
        />
        <rect
          x={pitch.x + 10}
          y={pitch.y + pitch.height * .225}
          width={pitch.width * .1375}
          height={pitch.height * .55}
        />
        <rect
          x={pitch.x + pitch.width - 10 - pitch.width * .1375}
          y={pitch.y + pitch.height * .225}
          width={pitch.width * .1375}
          height={pitch.height * .55}
        />
      </g>
    </g>
  );
}
