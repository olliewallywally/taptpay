import './support/test-env';
import nodemailer from 'nodemailer';
import { smtpFixture } from './support/smtp-fixture';

const sender = 'sender@synthetic.test',
  recipient = 'recipient@synthetic.test';

test('the installed SMTP transport cannot inject a recipient through envelope size', async () => {
  const fixture = await smtpFixture();
  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: fixture.port,
    secure: false,
    name: 'r8.synthetic.test',
    connectionTimeout: 1000,
    socketTimeout: 1000,
  });
  try {
    // A safe tiny wire payload; only our own loopback receiver sees it.
    await transport
      .sendMail({
        from: sender,
        to: recipient,
        subject: 'Synthetic',
        text: 'body',
        envelope: {
          from: sender,
          to: recipient,
          size: '5\r\nRCPT TO:<injected@synthetic.test>' as unknown as number,
        },
      })
      .catch(() => undefined);
    expect(
      fixture.commands.some(line => line.includes('injected@synthetic.test'))
    ).toBe(false);
  } finally {
    transport.close();
    await fixture.close();
  }
});

test('the installed SMTP transport still sends one recipient, text, HTML and a buffer attachment', async () => {
  const fixture = await smtpFixture();
  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: fixture.port,
    secure: false,
    name: 'r8.synthetic.test',
    connectionTimeout: 1000,
    socketTimeout: 1000,
  });
  try {
    const result = await transport.sendMail({
      from: sender,
      to: recipient,
      subject: 'Synthetic',
      text: 'plain body',
      html: '<p>html body</p>',
      attachments: [
        { filename: 'fixture.pdf', content: Buffer.from('%PDF-synthetic') },
      ],
    });
    expect(result.accepted).toEqual([recipient]);
    expect(
      fixture.commands.filter(line => line.startsWith('RCPT TO:'))
    ).toHaveLength(1);
    expect(fixture.messages).toHaveLength(1);
    expect(fixture.messages[0]).toContain('plain body');
    expect(fixture.messages[0]).toContain('<p>html body</p>');
    expect(fixture.messages[0]).toContain('filename=fixture.pdf');
  } finally {
    transport.close();
    await fixture.close();
  }
});
