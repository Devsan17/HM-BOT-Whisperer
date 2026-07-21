const { spawn } = require("child_process");

const nextBin = require.resolve("next/dist/bin/next");
const nextArgs = process.argv.slice(2);
let child;

try {
  child = spawn(process.execPath, [nextBin, "dev", ...nextArgs], {
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });
} catch (error) {
  console.error("Unable to start the Next.js dev server from the wrapper.");
  console.error("Run `npx next dev` manually if this keeps happening.");
  console.error(error.message);
  process.exit(1);
}

let browserOpened = false;
let startupOutput = "";

function openBrowser(url) {
  if (browserOpened) {
    return;
  }

  browserOpened = true;

  let command;
  let args;

  if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  const opener = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });

  opener.on("error", () => {
    console.log(`Open the app manually: ${url}`);
  });

  opener.unref();
  console.log(`Opening app in your browser: ${url}`);
}

function inspectOutput(chunk, writer) {
  const text = chunk.toString();
  writer.write(text);

  if (browserOpened) {
    return;
  }

  startupOutput += text;

  const urlMatch =
    startupOutput.match(/(?:Local|Ready in .*?- Local):\s*(https?:\/\/[^\s]+)/i) ||
    startupOutput.match(/https?:\/\/localhost:\d+/i) ||
    startupOutput.match(/https?:\/\/127\.0\.0\.1:\d+/i);

  if (urlMatch) {
    openBrowser(Array.isArray(urlMatch) ? urlMatch[urlMatch.length - 1] : urlMatch[0]);
  }
}

child.stdout.on("data", (chunk) => inspectOutput(chunk, process.stdout));
child.stderr.on("data", (chunk) => inspectOutput(chunk, process.stderr));
child.on("error", (error) => {
  console.error("The dev server wrapper could not launch Next.js.");
  console.error("Run `npx next dev` manually if this keeps happening.");
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
