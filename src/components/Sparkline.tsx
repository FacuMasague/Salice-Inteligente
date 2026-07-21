interface SparklineProps {
    values: number[];
    color?: string;
    width?: number;
    height?: number;
}
export function Sparkline({ values, color = "#d4882a", width = 100, height = 32 }: SparklineProps) {
    if (!values.length)
        return <span className="muted">No history</span>;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const points = values.map((value, index) => {
        const x = 3 + index / Math.max(1, values.length - 1) * (width - 6);
        const y = height - 4 - (value - min) / range * (height - 9);
        return `${x},${y}`;
    }).join(" ");
    return (<svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-label={`Tendencia: ${values.join(", ")}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={points.split(" ").at(-1)?.split(",")[0]} cy={points.split(" ").at(-1)?.split(",")[1]} r="3" fill={color}/>
    </svg>);
}
