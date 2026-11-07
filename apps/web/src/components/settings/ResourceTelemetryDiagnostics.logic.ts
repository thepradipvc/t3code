import type { ResourceTelemetryProcess, ResourceTelemetrySourceStatus } from "@t3tools/contracts";

export function processIdentityKey(process: Pick<ResourceTelemetryProcess, "identity">): string {
  return `${process.identity.pid}:${process.identity.startTimeMs}`;
}

export interface VisibleResourceTelemetryProcess {
  readonly process: ResourceTelemetryProcess;
  readonly hiddenCount: number;
}

export function visibleResourceTelemetryProcesses(
  processes: ReadonlyArray<ResourceTelemetryProcess>,
  collapsed: ReadonlySet<string>,
): ReadonlyArray<VisibleResourceTelemetryProcess> {
  const childrenByParent = new Map<number, ResourceTelemetryProcess[]>();
  for (const process of processes) {
    const children = childrenByParent.get(process.ppid) ?? [];
    children.push(process);
    childrenByParent.set(process.ppid, children);
  }

  const descendants = (root: ResourceTelemetryProcess): ResourceTelemetryProcess[] => {
    const seen = new Set<string>();
    const result: ResourceTelemetryProcess[] = [];
    const visit = (pid: number): void => {
      for (const child of childrenByParent.get(pid) ?? []) {
        // Depth 0 rows are their own roots, e.g. the server launched by Electron main.
        if (child.depth === 0) continue;
        const key = processIdentityKey(child);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(child);
        visit(child.identity.pid);
      }
    };
    visit(root.identity.pid);
    return result;
  };

  const hidden = new Set<string>();
  const hiddenByCollapsed = new Map<string, ResourceTelemetryProcess[]>();
  for (const process of processes) {
    const key = processIdentityKey(process);
    if (!collapsed.has(key)) continue;
    const folded = descendants(process);
    hiddenByCollapsed.set(key, folded);
    for (const child of folded) hidden.add(processIdentityKey(child));
  }

  return processes.flatMap((process) => {
    const key = processIdentityKey(process);
    if (hidden.has(key)) return [];
    const folded = hiddenByCollapsed.get(key) ?? [];
    return [{ process: folded.reduce(addProcessUsage, process), hiddenCount: folded.length }];
  });
}

function addProcessUsage(
  total: ResourceTelemetryProcess,
  process: ResourceTelemetryProcess,
): ResourceTelemetryProcess {
  return {
    ...total,
    cpuPercent: total.cpuPercent + process.cpuPercent,
    cpuTimeMs: total.cpuTimeMs + process.cpuTimeMs,
    residentBytes: total.residentBytes + process.residentBytes,
    ioReadBytes: total.ioReadBytes + process.ioReadBytes,
    ioWriteBytes: total.ioWriteBytes + process.ioWriteBytes,
    ioReadBytesPerSecond: total.ioReadBytesPerSecond + process.ioReadBytesPerSecond,
    ioWriteBytesPerSecond: total.ioWriteBytesPerSecond + process.ioWriteBytesPerSecond,
  };
}

export function shouldShowResourceMonitorRetry(input: {
  readonly nativeStatus: ResourceTelemetrySourceStatus | null;
  readonly error: string | null;
}): boolean {
  return (
    (input.nativeStatus === null && input.error !== null) ||
    input.nativeStatus === "degraded" ||
    input.nativeStatus === "unavailable" ||
    input.nativeStatus === "stopped"
  );
}

export function resourceHistoryBarHeight(input: {
  readonly value: number;
  readonly max: number;
  readonly minimumVisiblePercent: number;
}): number {
  if (input.value <= 0) return 0;
  return Math.max(input.minimumVisiblePercent, (input.value / Math.max(1, input.max)) * 100);
}

export function resourceHistoryCpuScaleMax(
  buckets: ReadonlyArray<{ readonly avgCpuPercent: number }>,
): number {
  return Math.max(1, ...buckets.map((bucket) => bucket.avgCpuPercent));
}
