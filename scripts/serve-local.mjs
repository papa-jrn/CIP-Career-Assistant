import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const nodeCommand = isWindows ? "node.exe" : "node";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const spawnCommand = isWindows && command === npmCommand ? "cmd.exe" : command;
    const spawnArgs =
      isWindows && command === npmCommand
        ? ["/d", "/s", "/c", command, ...args]
        : args;
    const child = spawn(spawnCommand, spawnArgs, {
      stdio: "inherit",
      shell: false,
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

process.env.ASTRO_TELEMETRY_DISABLED ??= "1";
// Bind "localhost" (not 127.0.0.1): PUBLIC_SITE_URL is http://localhost:4321 and
// Astro's checkOrigin only accepts POSTs whose Origin matches that exact origin.
// Serving under the same hostname removes the two-address lottery.
process.env.HOST ??= "localhost";
process.env.PORT ??= "4321";

await run(npmCommand, ["run", "build"]);
await run(nodeCommand, ["./dist/server/entry.mjs"], {
  env: process.env,
});
