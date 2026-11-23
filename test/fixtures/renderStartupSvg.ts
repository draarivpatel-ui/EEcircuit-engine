export function renderStartupSvg({
  timeSeconds,
  outputVolts,
  errorMessage,
}: {
  timeSeconds: number[];
  outputVolts: number[];
  errorMessage: string;
}): string {
  const lastTimeMs = timeSeconds[timeSeconds.length - 1] * 1000;
  let statusColor = "#166534";
  if (lastTimeMs < 1) statusColor = "#b91c1c";
  const sampleStride = Math.ceil(timeSeconds.length / 800);
  const points = timeSeconds.flatMap((seconds, index) => {
    if (index % sampleStride !== 0 && index !== timeSeconds.length - 1) return [];
    const x = 80 + seconds * 840000;
    const y = 360 - (outputVolts[index] + 0.05) * 600;
    return [`${x.toFixed(2)},${y.toFixed(2)}`];
  }).join(" ");
  const voltageTicks = [0, 0.1, 0.2, 0.3, 0.4].map((volts) => {
    const y = 360 - (volts + 0.05) * 600;
    return `<line x1="80" y1="${y}" x2="920" y2="${y}" stroke="#e5e7eb"/><text x="65" y="${y + 5}" text-anchor="end">${volts.toFixed(1)}</text>`;
  }).join("");
  const timeTicks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((milliseconds) => {
    const x = 80 + milliseconds * 840;
    return `<line x1="${x}" y1="90" x2="${x}" y2="360" stroke="#e5e7eb"/><text x="${x}" y="385" text-anchor="middle">${milliseconds.toFixed(1)}</text>`;
  }).join("");
  const escapedError = errorMessage.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500" viewBox="0 0 1000 500">
<rect width="1000" height="500" fill="white"/>
<g font-family="sans-serif" font-size="15" fill="#1f2937">
<text x="500" y="30" text-anchor="middle" font-size="21">LMZM33602 startup</text>
<text x="500" y="58" text-anchor="middle">24 V input ramp · 12 V target · 24 Ω load</text>
${voltageTicks}${timeTicks}
<polyline points="${points}" fill="none" stroke="#2563eb" stroke-width="2"/>
<text x="500" y="415" text-anchor="middle">Time (ms)</text>
<text transform="translate(25 225) rotate(-90)" text-anchor="middle">Output (V)</text>
<text x="500" y="452" text-anchor="middle" fill="${statusColor}">Reached ${lastTimeMs.toFixed(6)} ms of the requested 1.000000 ms</text>
<text x="500" y="480" text-anchor="middle" fill="#b91c1c">${escapedError}</text>
</g></svg>\n`;
}
