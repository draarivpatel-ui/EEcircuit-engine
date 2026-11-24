import { bsimTrans } from "../src/circuits.ts";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runSimulationRegressionTest } from "./runSimulationRegressionTest.ts";

async function main(): Promise<void> {
    const version = process.argv[2];
    const { Simulation } = await import("@tscircuit/eecircuit-engine");

    await runSimulationRegressionTest(() => new Simulation(), bsimTrans, version);
    execFileSync(process.execPath, [
        ...process.execArgv,
        fileURLToPath(new URL("./test-behavioral-events.ts", import.meta.url)),
        "--package",
    ], { stdio: "inherit", timeout: 180_000 });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
