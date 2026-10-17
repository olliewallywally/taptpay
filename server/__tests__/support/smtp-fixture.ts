/** Owned, bounded SMTP wire fixture. Never relays, authenticates or delivers mail. */
import net from 'node:net';

export async function smtpFixture() {
  const commands: string[] = [],
    messages: string[] = [],
    sockets = new Set<net.Socket>();
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    socket.setTimeout(3000, () => socket.destroy());
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    let pending = '',
      data = false,
      body: string[] = [];
    socket.on('data', chunk => {
      pending += String(chunk);
      if (pending.length > 65536) {
        socket.destroy();
        return;
      }
      let at: number;
      while ((at = pending.indexOf('\r\n')) >= 0) {
        const line = pending.slice(0, at);
        pending = pending.slice(at + 2);
        if (data) {
          if (line === '.') {
            messages.push(body.join('\r\n'));
            body = [];
            data = false;
            socket.write('250 accepted\r\n');
          } else body.push(line);
          continue;
        }
        commands.push(line);
        if (/^EHLO|^HELO/.test(line))
          socket.write(
            '250-synthetic.test\r\n250-SIZE 1048576\r\n250 8BITMIME\r\n'
          );
        else if (line === 'DATA') {
          data = true;
          socket.write('354 message\r\n');
        } else if (line === 'QUIT') {
          socket.end('221 bye\r\n');
        } else socket.write('250 OK\r\n');
      }
    });
    socket.write('220 synthetic.test ESMTP\r\n');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as net.AddressInfo).port;
  return {
    commands,
    messages,
    port,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close(e => (e ? reject(e) : resolve()))
      );
    },
  };
}
