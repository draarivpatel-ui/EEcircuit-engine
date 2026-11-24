export function renderBehavioralStepSvg({
  timeSeconds,
  outputVolts,
  errorMessage,
}: {
  timeSeconds: number[];
  outputVolts: number[];
  errorMessage: string;
}): string {
  const actualPoints = timeSeconds.flatMap((seconds, index) => {
    if (seconds < 42.33e-6 || seconds > 42.45e-6) return [];
    return [`${(seconds * 1e6).toFixed(9)},${outputVolts[index].toFixed(9)}`];
  }).join(" ");
  const expectedPoints = Array.from({ length: 501 }, (_, index) => {
    const seconds = 42.33e-6 + index * 0.12e-6 / 500;
    const onSeconds = 42.338e-6 + 0.5e-12;
    const offSeconds = 42.338e-6 + 1e-12 + 100e-9 + 0.5e-12;
    const pulseSeconds = Math.max(0, Math.min(seconds, offSeconds) - onSeconds);
    const volts = -5e9 * Math.expm1(-pulseSeconds) * Math.exp(-Math.max(0, seconds - offSeconds));
    return `${(seconds * 1e6).toFixed(9)},${volts.toFixed(9)}`;
  }).join(" ");
  const lastTimeSeconds = timeSeconds[timeSeconds.length - 1];
  const statusColor = lastTimeSeconds >= 50e-6 - 1e-14 ? "#166534" : "#b91c1c";
  const escapedError = errorMessage.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500" viewBox="0 0 1000 500">
<rect width="1000" height="500" fill="white"/>
<g font-family="sans-serif" font-size="15" fill="#1f2937">
<text x="500" y="30" text-anchor="middle" font-size="21">Behavioral current step</text>
<text x="500" y="58" text-anchor="middle">5 A pulse · 1 nF capacitor · 1 GΩ load</text>
<rect x="80" y="90" width="840" height="270" fill="none" stroke="#d1d5db"/>
<svg x="80" y="90" width="840" height="270" viewBox="42.33 0 0.12 550" preserveAspectRatio="none">
<g transform="translate(0 550) scale(1 -1)">
<polyline points="${expectedPoints}" fill="none" stroke="#6b7280" stroke-dasharray="6 4" stroke-width="2" vector-effect="non-scaling-stroke"/>
<polyline points="${actualPoints}" fill="none" stroke="#2563eb" stroke-width="2" vector-effect="non-scaling-stroke"/>
</g></svg>
<text x="65" y="365" text-anchor="end">0</text><text x="65" y="119" text-anchor="end">500</text>
<text x="80" y="385" text-anchor="middle">42.33</text><text x="500" y="385" text-anchor="middle">42.39</text><text x="920" y="385" text-anchor="middle">42.45</text>
<text x="500" y="415" text-anchor="middle">Time (µs) · blue: engine · dashed: closed form</text>
<text transform="translate(25 225) rotate(-90)" text-anchor="middle">Output (V)</text>
<text x="500" y="452" text-anchor="middle" fill="${statusColor}">Reached ${(lastTimeSeconds * 1e6).toFixed(3)} µs of the requested 50.000 µs</text>
<text x="500" y="480" text-anchor="middle" fill="#b91c1c">${escapedError}</text>
</g></svg>\n`;
}
