import { isPushServiceEndpoint } from "../push-endpoint";

/**
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-5-owner-answers.md, answer 1):
 * a browser's push endpoint is accepted only from the browser push services — Google's, Mozilla's,
 * Apple's or Microsoft's — over HTTPS on the default port, with no user or password in it.
 */
describe("a push endpoint must be a browser push service's", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:APA91b",
    "https://fcm.googleapis.com/wp/abc",
    "https://android.googleapis.com/gcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk",
    "https://wns2-bl2p.notify.windows.com/w/?token=BQYAAAB",
    "https://web.push.apple.com/QGuQyavXutnMH",
    "https://FCM.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:443/fcm/send/abc",
  ])("accepts %s", (endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "https://push.example.test/device",
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/fcm/send/abc",
    "https://user:secret@fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com.attacker.test/fcm/send/abc",
    "https://fcm.googleapis.com./fcm/send/abc",
    "https://attacker.test/fcm.googleapis.com",
    "https://notify.windows.com/w/",
    "https://evilnotify.windows.com/w/",
    "https://notify.windows.com.attacker.test/w/",
    "https://169.254.169.254/latest/meta-data",
    "https://127.0.0.1/",
    "https://[::1]/",
    "apns://device-token",
    "not a url",
    "",
  ])("refuses %s", (endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(false);
  });

  it.each([42, null, undefined, {}, ["https://fcm.googleapis.com/fcm/send/abc"]])("refuses a non-string (%p)", (endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(false);
  });
});
