import { Simulation as SourceSimulation } from "../src/simulationLink.ts";
import { runBehavioralEventRegressionTest } from "./runBehavioralEventRegressionTest.ts";

async function main(): Promise<void> {
  const Simulation = process.argv.includes("--package")
    ? (await import("@tscircuit/eecircuit-engine")).Simulation
    : SourceSimulation;
  await runBehavioralEventRegressionTest(() => new Simulation({ ngBehavior: "psa" }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
