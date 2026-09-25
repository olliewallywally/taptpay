import net from "node:net";

/**
 * A database that never answers, on this machine: it accepts the connection
 * and says nothing, so a client waits out its connect timeout — what an
 * unreachable database looks like to the app, with nothing leaving the machine.
 * (Tests used to dial the reserved address 192.0.2.1, which the R1-T1
 * no-network guard rightly refuses: it is still a connection off the machine.)
 */
export async function startSilentDatabase(): Promise<{ connectionString: string; close(): Promise<void> }> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    connectionString: `postgres://u:p@127.0.0.1:${port}/none?sslmode=disable`,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
