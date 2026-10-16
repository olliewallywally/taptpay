export type Stage = {name: string; status: 'pass' | 'fail'; exitCode: number};
export function assertNode22(version?: string): void;
export function assertCIDatabase(raw: string, options?: {marker?: string; applicationUrls?: (string | undefined)[]}): {url: URL; database: string};
export function assertJestReport(report: unknown): void;
export function sanitizedStages(stages: Stage[]): Stage[];
export function writeCIReport(directory: string, stages: Stage[]): Promise<void>;
export function runOwnedCommand(command: string[], options: {
  cwd?: string; env?: NodeJS.ProcessEnv; logFile: string; timeoutMs?: number; signal?: AbortSignal; killGraceMs?: number;
}): Promise<{exitCode: number; timedOut: boolean; aborted: boolean}>;
