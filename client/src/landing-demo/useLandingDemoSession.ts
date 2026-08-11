import { useCallback, useEffect, useRef, useState } from "react";
import {
  LANDING_DEMO_TOKEN_HEADER,
  isLandingDemoScene,
  isLandingDemoToken,
  type LandingDemoActionRequest,
  type LandingDemoSessionCreated,
  type LandingDemoSnapshot,
} from "@shared/landing-demo";

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isLandingDemoSnapshot = (
  value: unknown,
): value is LandingDemoSnapshot => {
  if (!isRecord(value) || !Number.isInteger(value.revision) ||
      typeof value.expiresAt !== "string" || !isRecord(value.state)) {
    return false;
  }
  return isLandingDemoScene(value.state.activeScene);
};

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export class LandingDemoSessionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "LandingDemoSessionError";
  }
}

export class LandingDemoSessionClient {
  private token: string | null = null;
  private current: LandingDemoSnapshot | null = null;

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  get snapshot(): LandingDemoSnapshot | null {
    return this.current;
  }

  async create(): Promise<LandingDemoSnapshot> {
    const response = await this.fetchImpl("/api/landing-demo/session", {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await readJson(response);
    if (!response.ok || !isRecord(body) || !isLandingDemoToken(body.token) ||
        !isLandingDemoSnapshot(body)) {
      throw new LandingDemoSessionError(response.status, "DEMO_SESSION_CREATE_FAILED");
    }
    const created = body as unknown as LandingDemoSessionCreated;
    this.token = created.token;
    this.current = {
      revision: created.revision,
      expiresAt: created.expiresAt,
      state: created.state,
    };
    return this.current;
  }

  async read(): Promise<LandingDemoSnapshot> {
    const token = this.requireToken();
    const response = await this.fetchImpl("/api/landing-demo/state", {
      credentials: "omit",
      headers: { [LANDING_DEMO_TOKEN_HEADER]: token },
    });
    return this.consumeSnapshot(response, "DEMO_SESSION_READ_FAILED");
  }

  async apply(
    action: LandingDemoActionRequest,
  ): Promise<{ kind: "ok" | "conflict"; snapshot: LandingDemoSnapshot }> {
    const token = this.requireToken();
    const response = await this.fetchImpl("/api/landing-demo/action", {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        [LANDING_DEMO_TOKEN_HEADER]: token,
      },
      body: JSON.stringify(action),
    });
    const snapshot = await this.consumeSnapshot(
      response,
      "DEMO_ACTION_FAILED",
      response.status === 409,
    );
    return { kind: response.status === 409 ? "conflict" : "ok", snapshot };
  }

  async destroy(): Promise<void> {
    const token = this.token;
    this.token = null;
    this.current = null;
    if (!token) return;
    try {
      await this.fetchImpl("/api/landing-demo/session", {
        method: "DELETE",
        credentials: "omit",
        headers: { [LANDING_DEMO_TOKEN_HEADER]: token },
      });
    } catch {
      // Unload cleanup is best-effort; the server TTL remains authoritative.
    }
  }

  private requireToken(): string {
    if (!this.token) throw new LandingDemoSessionError(0, "DEMO_SESSION_MISSING");
    return this.token;
  }

  private async consumeSnapshot(
    response: Response,
    fallbackCode: string,
    allowConflict = false,
  ): Promise<LandingDemoSnapshot> {
    const body = await readJson(response);
    if ((response.ok || (allowConflict && response.status === 409)) &&
        isLandingDemoSnapshot(body)) {
      this.current = body;
      return body;
    }
    if (response.status === 410) {
      this.token = null;
      this.current = null;
    }
    const code = isRecord(body) && isRecord(body.error) &&
      typeof body.error.code === "string" ? body.error.code : fallbackCode;
    throw new LandingDemoSessionError(response.status, code);
  }
}

export function useLandingDemoSession(enabled = true) {
  const clientRef = useRef<LandingDemoSessionClient | null>(null);
  if (!clientRef.current) clientRef.current = new LandingDemoSessionClient();
  const [snapshot, setSnapshot] = useState<LandingDemoSnapshot | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    enabled ? "loading" : "idle",
  );
  const [error, setError] = useState<LandingDemoSessionError | null>(null);

  const create = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const next = await clientRef.current!.create();
      setSnapshot(next);
      setStatus("ready");
      return next;
    } catch (cause) {
      const nextError = cause instanceof LandingDemoSessionError
        ? cause
        : new LandingDemoSessionError(0, "DEMO_SESSION_CREATE_FAILED");
      setError(nextError);
      setStatus("error");
      throw nextError;
    }
  }, []);

  const apply = useCallback(async (action: LandingDemoActionRequest) => {
    try {
      const result = await clientRef.current!.apply(action);
      setSnapshot(result.snapshot);
      return result;
    } catch (cause) {
      if (cause instanceof LandingDemoSessionError && cause.status === 410) {
        await create();
      }
      throw cause;
    }
  }, [create]);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    void create().catch(() => undefined);
    return () => {
      void clientRef.current?.destroy();
    };
  }, [create, enabled]);

  return { snapshot, status, error, create, apply };
}
