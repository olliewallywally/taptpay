import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/hooks/use-toast";
import { appleConnectOutcome, isAppleAuthorizeUrl, leaveForApple, type AppleConnection } from "@/lib/apple-sign-in";
import { apiRequest } from "@/lib/queryClient";
import { apiPath, apiTo } from "@shared/api-path";

export const APPLE_CONNECTION_KEY = [apiPath("GET /api/auth/apple/connection")] as const;

const COULD_NOT_START = "Could not start connecting Apple. Please try again.";
const COULD_NOT_DISCONNECT = "Could not disconnect Apple. Please try again.";

/** The server's own words for a refusal, or the fallback: never a raw body or a browser's own error text. */
function serverWords(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const start = error.message.indexOf("{");
  if (start < 0) return fallback;
  try {
    const payload = JSON.parse(error.message.slice(start));
    return typeof payload?.message === "string" && payload.message.trim() ? payload.message.trim() : fallback;
  } catch {
    return fallback;
  }
}

function readAppleReturn(): { present: boolean; word: string | null } {
  const params = new URLSearchParams(window.location.search);
  return { present: params.has("apple"), word: params.get("apple") };
}

function scrubAppleReturn(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("apple");
  const query = url.searchParams.toString();
  window.history.replaceState(window.history.state, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
}

/**
 * R1-T5d: the owner's "Sign in with Apple" row in Settings, shared by the phone and the tablet/desktop
 * screens. It reads the login's own connection, starts a connect or disconnects behind the current
 * password (typed, used once and forgotten), and says how a return from Apple went. The server holds
 * every rule; a teammate is not asked at all.
 */
export function useAppleConnection(isOwner: boolean) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [returned] = useState(readAppleReturn);
  const [password, setPassword] = useState("");

  // The return word leaves the address before the screen paints, whatever it was.
  useLayoutEffect(() => {
    if (returned.present) scrubAppleReturn();
  }, [returned.present]);

  const query = useQuery<AppleConnection>({
    queryKey: APPLE_CONNECTION_KEY,
    enabled: isOwner,
    queryFn: async () => (await apiRequest(...apiTo("GET /api/auth/apple/connection"))).json(),
  });

  // How the return went is said once, to the owner only. A refusal is said as soon as the page knows
  // it is the owner's. "Connected" is anyone's to write into an address, so it is said only when the
  // server's own answer agrees; if it does not, nothing is said.
  const said = useRef(false);
  const serverSaysConnected = query.data === undefined ? undefined : query.data.connected === true;
  useEffect(() => {
    const outcome = appleConnectOutcome(returned.word);
    if (said.current || !outcome || !isOwner) return;
    if (!outcome.connected) {
      said.current = true;
      toast({ title: outcome.title, description: outcome.description, variant: "destructive" });
      return;
    }
    if (serverSaysConnected === undefined) return;
    said.current = true;
    if (serverSaysConnected) toast({ title: outcome.title, description: outcome.description });
    // The word was read once, when the page opened; the toast function is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, serverSaysConnected]);

  const connect = useMutation({
    mutationFn: async (currentPassword: string) => {
      const response = await apiRequest(...apiTo("POST /api/auth/apple/connect"), { currentPassword });
      const body = await response.json().catch(() => ({}));
      // The page leaves only for Apple's own sign-in page.
      if (!isAppleAuthorizeUrl(body?.url)) throw new Error(COULD_NOT_START);
      leaveForApple(body.url);
    },
    onError: (error: unknown) => toast({ title: serverWords(error, COULD_NOT_START), variant: "destructive" }),
    onSettled: () => setPassword(""),
  });

  const disconnect = useMutation({
    mutationFn: async (currentPassword: string) => {
      await apiRequest(...apiTo("POST /api/auth/apple/disconnect"), { currentPassword });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: APPLE_CONNECTION_KEY });
      toast({ title: "Apple disconnected", description: "Apple no longer signs this login in." });
    },
    onError: (error: unknown) => toast({ title: serverWords(error, COULD_NOT_DISCONNECT), variant: "destructive" }),
    onSettled: () => setPassword(""),
  });

  const connection = query.data;
  const connected = connection?.connected === true;
  const busy = connect.isPending || disconnect.isPending;
  return {
    /** Draw the row: for the owner, when Apple can be connected here or already is. */
    visible: isOwner && (connection?.available === true || connected),
    connected,
    /** Apple can be connected here (set up, https). A connection made earlier can still be removed when not. */
    available: connection?.available === true,
    email: connection?.email ?? null,
    isPrivateEmail: connection?.isPrivateEmail === true,
    connectedAt: connection?.connectedAt ?? null,
    password,
    setPassword,
    busy,
    /** Connect, or disconnect when connected, with the password typed. */
    submit: () => {
      if (busy || !password) return;
      (connected ? disconnect : connect).mutate(password);
    },
    /** The page was opened by Apple's return (the phone screen opens its Account section for it). */
    returnedFromApple: returned.present,
  };
}
