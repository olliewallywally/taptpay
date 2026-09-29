/**
 * Run only by no-network-guard.test.ts, in a child Jest with the server
 * config: a test whose code reaches off this machine and swallows the error,
 * as a route answering 502 would. The guard must fail it anyway.
 * (Not a *.test.ts file, so the server suite never runs it directly.)
 */
test("swallows a refused outside connection", async () => {
  const outcome = await fetch("https://example.com/").then(
    () => "answered",
    () => "failed quietly",
  );
  expect(outcome).toBe("failed quietly");
});
