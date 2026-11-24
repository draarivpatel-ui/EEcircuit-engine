import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Simulation } from "../src/simulationLink.ts";
import { ensureFileFetch } from "./runSimulationRegressionTest.ts";

export type BehavioralSimulation = Pick<Simulation, "start" | "setNetList" | "runSim" | "getError">;

type Pulse = {
  currentAmps: number;
  resistanceOhms: number;
  capacitanceFarads: number;
  onSeconds: number;
  offSeconds: number;
  referenceVolts?: number;
};

function pulseVoltage(seconds: number, pulse: Pulse): number {
  const tauSeconds = pulse.resistanceOhms * pulse.capacitanceFarads;
  const activeSeconds = Math.max(0, Math.min(seconds, pulse.offSeconds) - pulse.onSeconds);
  const decaySeconds = Math.max(0, seconds - pulse.offSeconds);
  return (pulse.referenceVolts ?? 0) - pulse.currentAmps * pulse.resistanceOhms *
    Math.expm1(-activeSeconds / tauSeconds) * Math.exp(-decaySeconds / tauSeconds);
}

function appendSpiceOptions(netList: string, spiceOptions: string): string {
  return netList.replace(/^\.end\s*$/im, `.options ${spiceOptions}\n.end`);
}

async function runTransient(
  { netList, stopSeconds }: { netList: string; stopSeconds: number },
  sim: BehavioralSimulation
): Promise<{ timeSeconds: number[]; outputVolts: number[] }> {
  sim.setNetList(netList);
  const result = await sim.runSim();
  assert(result.dataType === "real", "Expected a real transient result");
  const timeSeconds = result.data.find((vector) => vector.type === "time")?.values;
  const outputVolts = result.data.find((vector) => vector.name === "v(output)" || vector.name === "v(out)")?.values;
  assert(timeSeconds && outputVolts, "Expected time and output voltage vectors");
  assert(Math.abs(timeSeconds.at(-1)! - stopSeconds) < 1e-12, "Transient did not reach its requested stop time");
  assert(outputVolts.every(Number.isFinite), "Transient contains a non-finite voltage");
  assert(!sim.getError().some((line) => /too small|aborted|fatal/i.test(line)), "Transient reported a simulation failure");
  return { timeSeconds, outputVolts };
}

function assertPulseVoltage(
  { timeSeconds, outputVolts }: { timeSeconds: number[]; outputVolts: number[] },
  { pulse, maximumErrorVolts }: { pulse: Pulse; maximumErrorVolts: number }
): void {
  for (let i = 0; i < timeSeconds.length; i++) {
    const expectedVolts = pulseVoltage(timeSeconds[i], pulse);
    assert(Math.abs(outputVolts[i] - expectedVolts) < maximumErrorVolts,
      `Capacitor voltage disagrees with the closed form at ${timeSeconds[i]} s: ${outputVolts[i]} vs ${expectedVolts}`);
  }
}

export async function runBehavioralEventRegressionTest(createSimulation: () => BehavioralSimulation): Promise<void> {
  ensureFileFetch();
  const sim = createSimulation();
  await sim.start();
  const original = await readFile(new URL("./fixtures/behavioral-current-step.cir", import.meta.url), "utf8");
  const pulse: Pulse = {
    currentAmps: 5,
    resistanceOhms: 1e9,
    capacitanceFarads: 1e-9,
    onSeconds: 42.338e-6 + 0.5e-12,
    offSeconds: 42.338e-6 + 1e-12 + 100e-9 + 0.5e-12,
  };
  const comparisons = [
    "V(control) > .5 ? 5 : 0",
    "V(control) >= .5 ? 5 : 0",
    "V(control) < .5 ? 0 : 5",
    "V(control) <= .5 ? 0 : 5",
  ];
  for (const method of ["trap", "gear"]) {
    for (const expression of comparisons) {
      const netList = appendSpiceOptions(original.replace(/^Bcurrent[^\n]*/m, `Bcurrent 0 output I={${expression}}`), `method=${method}`);
      const samples = await runTransient({ netList, stopSeconds: 50e-6 }, sim);
      assertPulseVoltage(samples, { pulse, maximumErrorVolts: 2e-6 });
    }
  }

  const negative = appendSpiceOptions(original.replace("? 5 : 0", "? -5 : 0"), "method=trap");
  assertPulseVoltage(await runTransient({ netList: negative, stopSeconds: 50e-6 }, sim), {
    pulse: { ...pulse, currentAmps: -5 }, maximumErrorVolts: 2e-6,
  });
  const floating = appendSpiceOptions(original
    .replace("C1 output 0 1n", "Vreference reference 0 3\nC1 output reference 1n")
    .replace("R1 output 0 1Gig", "R1 output reference 1Gig"), "method=trap");
  assertPulseVoltage(await runTransient({ netList: floating, stopSeconds: 50e-6 }, sim), {
    pulse: { ...pulse, referenceVolts: 3 }, maximumErrorVolts: 2e-6,
  });

  // The controlling capacitor follows an exponential, so linear interpolation
  // of a single crossing is insufficient to locate both switching times.
  const tauSeconds = 1e-6;
  const riseSeconds = 1e-12;
  const delaySeconds = 2e-6;
  const widthSeconds = 2e-6;
  const rampFactor = Math.expm1(riseSeconds / tauSeconds) / (riseSeconds / tauSeconds);
  const nonlinearPulse: Pulse = {
    currentAmps: 0.005, resistanceOhms: 1e9, capacitanceFarads: 1e-6,
    onSeconds: delaySeconds + tauSeconds * Math.log(2 * rampFactor),
    offSeconds: delaySeconds + tauSeconds * Math.log(2 * rampFactor * Math.expm1((riseSeconds + widthSeconds) / tauSeconds)),
  };
  const nonlinear = `Exponential control voltage
Vdrive drive 0 PULSE(0 1 2u 1p 1p 2u 10u)
Rcontrol drive control 1k
Ccontrol control 0 1n
Bcurrent 0 output I={V(control) > .5 ? .005 : 0}
C1 output 0 1u
R1 output 0 1Gig
.save V(output)
.options reltol=1e-5 vntol=1e-8 abstol=1e-14 chgtol=1e-16
.tran 10n 8u 0 2n
.end
`;
  for (const method of ["trap", "gear"]) {
    const samples = await runTransient({ netList: appendSpiceOptions(nonlinear, `method=${method}`), stopSeconds: 8e-6 }, sim);
    assertPulseVoltage(samples, { pulse: nonlinearPulse, maximumErrorVolts: 2e-7 });
  }

  sim.setNetList(`Conditional source AC gain
Vcontrol control 0 1
Vinput input 0 DC 0 AC 1
Bvoltage output 0 V={V(control) > .5 ? 2*V(input) : V(input)}
Rload output 0 1k
.save V(output)
.ac lin 1 1k 1k
.end
`);
  const ac = await sim.runSim();
  assert(ac.dataType === "complex", "Expected a complex AC result");
  const gain = ac.data.find((vector) => vector.name === "v(output)")?.values;
  assert(gain && gain.length > 0, "Expected conditional source AC voltage");
  assert(gain.every((voltage) => Math.abs(voltage.real - 2) < 1e-12 && Math.abs(voltage.img) < 1e-12), "Conditional source AC gain changed");

  const ti = await readFile(new URL("./fixtures/lmzm33602-startup.cir", import.meta.url), "utf8");
  await runTransient({
    netList: appendSpiceOptions(ti.replace(/^\.tran[^\n]*/im, ".tran 1u 1m 0 125n"),
      "method=trap reltol=1e-5 vntol=1e-8 abstol=1e-14 chgtol=1e-16"),
    stopSeconds: 1e-3,
  }, sim);
  console.log("Behavioral source event regressions passed, including strict TI startup and module reuse");
}
