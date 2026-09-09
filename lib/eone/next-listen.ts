import type { Server } from "node:net";

export function stripPortFlags(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "-p" || arg === "--port") {
      i += 1;
      continue;
    }
    if (arg.startsWith("--port=")) continue;
    out.push(arg);
  }
  return out;
}

export function internalNextArgs(
  args: string[],
  internalPort: number,
): string[] {
  return [
    ...stripPortFlags(args),
    "--hostname",
    "127.0.0.1",
    "-p",
    String(internalPort),
  ];
}

export function listenOnAllInterfaces(
  server: Server,
  port: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off("listening", onListening);
      server.off("error", onError);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    server.once("listening", onListening);
    server.once("error", onError);
    try {
      server.listen(port, "0.0.0.0");
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
