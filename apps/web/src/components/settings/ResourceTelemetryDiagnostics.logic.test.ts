import { describe, expect, it } from "vite-plus/test";

import type { ResourceTelemetryProcess } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { visibleResourceTelemetryProcesses } from "./ResourceTelemetryDiagnostics.logic";

const visiblePids = (
  processes: ReadonlyArray<ResourceTelemetryProcess>,
  collapsed: ReadonlySet<string>,
) =>
  visibleResourceTelemetryProcesses(processes, collapsed).map(({ process, hiddenCount }) => [
    process.identity.pid,
    hiddenCount,
  ]);

const process = (pid: number, ppid: number, depth: number): ResourceTelemetryProcess => ({
  identity: { pid, startTimeMs: pid * 1_000 },
  ppid,
  childPids: [],
  depth,
  name: `process-${pid}`,
  command: `process-${pid}`,
  status: "Running",
  category: pid === 1 ? "server" : "server-child",
  cpuPercent: 0,
  cpuTimeMs: 0,
  residentBytes: 0,
  peakResidentBytes: 0,
  virtualBytes: 0,
  ioReadBytes: 0,
  ioWriteBytes: 0,
  ioReadBytesPerSecond: 0,
  ioWriteBytesPerSecond: 0,
  ioSemantics: "storage",
  runTimeMs: 0,
  firstSeenAt: DateTime.makeUnsafe(0),
  lastSeenAt: DateTime.makeUnsafe(0),
});

describe("visibleResourceTelemetryProcesses", () => {
  it("hides descendants by parentage even when rows are not depth-first", () => {
    const processes = [
      process(1, 0, 0),
      process(10, 0, 0),
      process(2, 1, 1),
      process(11, 10, 1),
      process(3, 2, 2),
    ];

    expect(visiblePids(processes, new Set(["1:1000"]))).toEqual([
      [1, 2],
      [10, 0],
      [11, 0],
    ]);
  });

  it("keeps a root row visible when its launcher is collapsed", () => {
    const processes = [process(1, 10, 0), process(2, 1, 1), process(10, 0, 0), process(11, 10, 1)];

    expect(visiblePids(processes, new Set(["10:10000"]))).toEqual([
      [1, 0],
      [2, 0],
      [10, 1],
    ]);
  });

  it("sums every hidden descendant into a collapsed row, including collapsed children", () => {
    const usage = (pid: number, ppid: number, depth: number, amount: number) => ({
      ...process(pid, ppid, depth),
      cpuPercent: amount,
      cpuTimeMs: amount,
      residentBytes: amount,
      ioReadBytes: amount,
      ioWriteBytes: amount,
      ioReadBytesPerSecond: amount,
      ioWriteBytesPerSecond: amount,
    });
    const processes = [
      usage(3, 2, 2, 100),
      usage(2, 1, 1, 10),
      usage(1, 0, 0, 1),
      usage(4, 1, 1, 1_000),
    ];

    const [row] = visibleResourceTelemetryProcesses(processes, new Set(["2:2000", "1:1000"]));

    expect(row?.hiddenCount).toBe(3);
    expect(row?.process).toMatchObject({
      identity: { pid: 1 },
      cpuPercent: 1_111,
      cpuTimeMs: 1_111,
      residentBytes: 1_111,
      ioReadBytes: 1_111,
      ioWriteBytes: 1_111,
      ioReadBytesPerSecond: 1_111,
      ioWriteBytesPerSecond: 1_111,
    });
  });
});
