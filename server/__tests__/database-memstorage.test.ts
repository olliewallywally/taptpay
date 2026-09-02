describe("development database bootstrap", () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock("../config");
  });

  test("constructs the database module without DATABASE_URL", () => {
    jest.resetModules();
    jest.doMock("../config", () => ({ config: { databaseUrl: undefined } }));

    jest.isolateModules(() => {
      const { databaseClient, pool } = require("../db");
      expect(pool).toBeNull();
      expect(databaseClient).toBeNull();
    });
  });
});
