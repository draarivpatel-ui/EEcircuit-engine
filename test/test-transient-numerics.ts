import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Simulation } from "../src/simulationLink.ts";
import { runSimulation } from "./runSimulationRegressionTest.ts";

async function main(): Promise<void> {
    const sim = new Simulation();
    const createSimulation = () => sim;

    // Repeat on one module to exercise removal of the internal branch equation.
    for (let repeat = 0; repeat < 2; repeat++) {
        const result = await runSimulation(createSimulation, `Floating capacitor precision
V1 supply 0 2.8
Ra supply a 100Meg
Rb b 0 1Gig
C1 a b 100n IC=0
.save all @C1[i]
.options method=${repeat === 0 ? "trap" : "gear"}
.tran 1p 100p UIC
.end
`);
        assert(result.dataType === "real");
        assert.equal(result.numVariables, 6, "Keep the companion equation internal");
        const seconds = result.data.find((vector) => vector.type === "time")?.values;
        const aVolts = result.data.find((vector) => vector.name === "v(a)")?.values;
        const bVolts = result.data.find((vector) => vector.name === "v(b)")?.values;
        const capacitorAmps = result.data.find((vector) => vector.name === "i(@c1[i])")?.values;
        assert(seconds && aVolts && bVolts && capacitorAmps);
        assert.equal(seconds.at(-1), 1e-10);
        for (let index = 0; index < seconds.length; index++) {
            const capacitorVolts = -2.8 * Math.expm1(-seconds[index] / 110);
            const expectedA = 2.8 - (2.8 - capacitorVolts) / 11;
            const expectedB = (2.8 - capacitorVolts) * 10 / 11;
            assert(Math.abs(aVolts[index] - expectedA) < 1e-8);
            assert(Math.abs(bVolts[index] - expectedB) < 1e-8);
            const expectedAmps = 2.8 / 1.1e9 * Math.exp(-seconds[index] / 110);
            assert(Math.abs(capacitorAmps[index] - expectedAmps) < 1e-18);
            assert(Math.abs(capacitorAmps[index] - bVolts[index] / 1e9) < 1e-18);
        }
    }

    await runSimulation(createSimulation, `Capacitor current after transient completion
V1 supply 0 2.8
Ra supply a 100Meg
Rb b 0 1Gig
C1 a b 100n IC=0
.save V(b)
.tran 1p 100p UIC
.control
run
set numdgt=17
print @c1[i]
.endc
.end
`);
    const printedCurrent = sim.getInfo().match(/@c1\[i\]\s*=\s*([\deE.+-]+)/i)?.[1];
    assert(printedCurrent !== undefined);
    assert(Math.abs(Number(printedCurrent) - 2.8 / 1.1e9 * Math.exp(-1e-10 / 110)) < 1e-18);

    for (const method of ["trap", "gear"]) {
        const result = await runSimulation(createSimulation, `Floating capacitor RC response
V1 supply 0 2.8
Ra supply a 1k
Rb b 0 2k
C1 a b 1n IC=0 m=2
.save V(b) @C1[i]
.options method=${method}
.tran 10n 15u UIC
.end
`);
        assert(result.dataType === "real");
        const seconds = result.data.find((vector) => vector.type === "time")?.values;
        const bVolts = result.data.find((vector) => vector.name === "v(b)")?.values;
        const capacitorAmps = result.data.find((vector) => vector.name === "i(@c1[i])")?.values;
        assert(seconds && bVolts && capacitorAmps);
        assert(Math.abs(seconds[seconds.length - 1] - 15e-6) < 1e-18);
        for (let index = 0; index < seconds.length; index++) {
            const expected = 2.8 * 2 / 3 * Math.exp(-seconds[index] / 6e-6);
            assert(Math.abs(bVolts[index] - expected) < 1e-4);
            assert(Math.abs(capacitorAmps[index] - expected / 2000) < 1e-7);
        }
    }

    const result = await runSimulation(createSimulation, `Floating capacitor AC response
V1 supply 0 DC 2.8 AC 1
Ra supply a 1k
Rb b 0 2k
C1 a b 1n m=2
.save V(b)
.ac dec 10 1k 100k
.end
`);
    assert(result.dataType === "complex");
    const frequencies = result.data.find((vector) => vector.type === "frequency")?.values;
    const bVolts = result.data.find((vector) => vector.name === "v(b)")?.values;
    assert(frequencies && bVolts);
    for (let index = 0; index < frequencies.length; index++) {
        const reactance = 1 / (2 * Math.PI * frequencies[index].real * 2e-9);
        const denominator = 3000 ** 2 + reactance ** 2;
        assert(Math.abs(bVolts[index].real - 6e6 / denominator) < 1e-10);
        assert(Math.abs(bVolts[index].img - 2000 * reactance / denominator) < 1e-10);
    }

    const switchResult = await runSimulation(createSimulation, `Linear resistance switch feedback
V1 supply 0 1
R1 supply out 1k
A1 out 0 %gd(out 0) smooth
.model smooth pswitch(r_on=100 r_off=1k cntl_on=.5 cntl_off=.2 log=false)
.save V(out)
.tran 1u 2u
.end
`);
    assert(switchResult.dataType === "real");
    const outputVolts = switchResult.data.find((vector) => vector.name === "v(out)")?.values;
    assert(outputVolts);
    // (1 - V) / 1000 = V / (1600 - 3000 V).
    const expected = (5600 - Math.sqrt(5600 ** 2 - 4 * 3000 * 1600)) / 6000;
    assert(outputVolts.every((volts) => Math.abs(volts - expected) < 1e-6));

    const linearResult = await runSimulation(createSimulation, `Linear controlled-current network precision
Gaa a 0 a 0 4194304
Gab a 0 b 0 12
Gba b 0 a 0 3221225472
Gbb b 0 b 0 1048576
Ia 0 a 8388614
Ib 0 b 6442975232
.tran 1n 2n
.end
`);
    assert(linearResult.dataType === "real");
    // The two KCL equations have the exact solution a=2 V, b=0.5 V.
    for (const [name, volts] of [["v(a)", 2], ["v(b)", .5]] as const) {
        const actual = linearResult.data.find((vector) => vector.name === name)?.values.at(-1);
        assert(actual !== undefined);
        assert(Math.abs(actual - volts) < 1e-14, `${name}: expected ${volts}, received ${actual}`);
    }

    const startup = await readFile(new URL("./fixtures/lmzm33602-startup.cir", import.meta.url), "utf8");
    for (const [step, options] of [["500n", ""], ["250n", ""], ["1u", ".options reltol=1e-4"]]) {
        const netlist = startup.replace(/^\.tran[^\n]*/im, `.tran 1u 1m 0 ${step}`)
            .replace(/^\.end\s*$/im, `${options}\n.end`);
        const startupSim = new Simulation({ ngBehavior: "psa" });
        const startupResult = await runSimulation(() => startupSim, netlist);
        assert(startupResult.dataType === "real");
        const end = startupResult.data.find((vector) => vector.type === "time")?.values.at(-1);
        assert.equal(end, .001, `LMZM33602 startup did not finish with maximum step ${step} ${options}`);
        assert(!startupSim.getError().some((line) => /timestep too small|aborted/i.test(line)));
    }
    console.log("Transient numerical regressions passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
