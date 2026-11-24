import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import looksSame from "looks-same";
import { Simulation } from "../src/simulationLink.ts";
import { renderBehavioralStepSvg } from "./fixtures/renderBehavioralStepSvg.ts";
import { ensureFileFetch } from "./runSimulationRegressionTest.ts";

async function main(): Promise<void> {
  ensureFileFetch();
  const sim = new Simulation({ ngBehavior: "psa" });
  await sim.start();
  sim.setNetList(await readFile(new URL("./fixtures/behavioral-current-step.cir", import.meta.url), "utf8"));
  const result = await sim.runSim();
  assert(result.dataType === "real", "Expected a real transient result");
  const timeSeconds = result.data.find((vector) => vector.type === "time")?.values;
  const outputVolts = result.data.find((vector) => vector.name === "v(output)")?.values;
  assert(timeSeconds && outputVolts, "Expected capacitor time and voltage vectors");
  const errorMessage = sim.getError().find((message) => /timestep too small/i.test(message)) ?? "";
  const svg = renderBehavioralStepSvg({ timeSeconds, outputVolts, errorMessage: errorMessage.split(";")[0] });
  const snapshotUrl = new URL("./fixtures/behavioral-current-step.expected.svg", import.meta.url);
  if (process.env.UPDATE_SNAPSHOTS === "1") await writeFile(snapshotUrl, svg);
  const expectedSvg = await readFile(snapshotUrl, "utf8");
  const comparison = await looksSame(Buffer.from(svg), Buffer.from(expectedSvg));
  assert(comparison.equal, "Behavioral current step SVG mismatch; regenerate with UPDATE_SNAPSHOTS=1");
  console.log("Behavioral current step SVG regression passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
