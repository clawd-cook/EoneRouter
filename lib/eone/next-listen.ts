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
