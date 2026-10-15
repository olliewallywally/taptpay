// R2-T6: card setup validates its hosted-page link for the payment mode and its
// callback addresses against PUBLIC_ORIGIN, so this contract runs as UAT.
jest.mock("../config", () => {
  const actual = jest.requireActual("../config");
  return {
    ...actual,
    config: {
      ...actual.config,
      paymentMode: "uat",
      publicOrigin: "https://app.example.test",
      windcave: { ...actual.config.windcave, endpoint: actual.UAT_WINDCAVE_ENDPOINT, username: "SyntheticUser", apiKey: "synthetic-key" },
    },
  };
});

import {
  chargeStoredCard,
  queryStoredCardCharge,
  createCardStorageSession,
  queryStoredCardSession,
} from "../windcave";

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  } as Response;
}

function requestSequence(...responses: Response[]) {
  return jest.fn(async (_url: string, _options: RequestInit): Promise<Response> => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected Windcave request");
    return response;
  });
}

describe('R3 stored-card identity recovery port',()=>{
  it('refuses conflicting identity aliases on a zero-value verification',async()=>{
    const request=requestSequence(jsonResponse(200,{id:'card-session',state:'complete',transactions:[{
      id:'validation-one',transactionId:'validation-two',authorised:true,
      card:{id:'stored-card',cardNumber:'****4242',dateExpiryMonth:9,dateExpiryYear:2031}
    }]}));
    expect((await queryStoredCardSession('card-session',{request,expected:{reference:'SC_reference',providerAccount:'SyntheticUser'}})).success).toBe(false);
  });
  it.each([{amount:'1.00'},{currency:'USD'},{merchantReference:'foreign-reference'},{username:'foreign-account'},{type:'purchase'}])('refuses a mismatched zero-value card echo %p',async(echo)=>{
    const request=requestSequence(jsonResponse(200,{id:'card-session',state:'complete',transactions:[{
      id:'validation-one',authorised:true,...echo,
      card:{id:'stored-card',cardNumber:'****4242',dateExpiryMonth:9,dateExpiryYear:2031}
    }]}));
    expect((await queryStoredCardSession('card-session',{request,expected:{reference:'SC_reference',providerAccount:'SyntheticUser'}})).success).toBe(false);
  });
  const args=['durable-synthetic-x-id','synthetic-card','8.99','synthetic-reference'] as const;
  it('commits the pending transaction identity before the first poll',async()=>{
    let release!:()=>void,started!:()=>void;
    const entered=new Promise<void>(r=>{started=r;}),commit=new Promise<void>(r=>{release=r;});
    const request=requestSequence(jsonResponse(202,{id:'pending-identity'}),jsonResponse(200,{id:'pending-identity',authorised:true}));
    const onPendingTransaction=jest.fn(async()=>{started();await commit;});
    const result=chargeStoredCard(...args,{request,wait:async()=>{},onPendingTransaction} as any);
    await Promise.race([entered,new Promise((_,reject)=>setTimeout(()=>reject(new Error('pending identity was not persisted')),1000))]);
    expect(request).toHaveBeenCalledTimes(1);release();
    expect(await result).toMatchObject({success:true,windcaveTransactionId:'pending-identity'});
    expect(onPendingTransaction).toHaveBeenCalledWith('pending-identity');
  });
  it('a failed identity commit keeps an unknown outcome and sends no poll',async()=>{
    const request=requestSequence(jsonResponse(202,{id:'pending-identity'}));
    const result=await chargeStoredCard(...args,{request,wait:async()=>{},onPendingTransaction:async()=>{throw new Error('private storage error');}} as any);
    expect(result).toMatchObject({success:false,windcaveTransactionId:'pending-identity'});
    expect(result.error).not.toContain('private');expect(request).toHaveBeenCalledTimes(1);
  });
  it('resumes from a saved identity with GET alone',async()=>{
    const request=requestSequence(jsonResponse(200,{id:'pending-identity',authorised:true}));
    const result=await queryStoredCardCharge(args[0],'pending-identity',args[2],args[3],{request,wait:async()=>{}});
    expect(result).toMatchObject({success:true,windcaveTransactionId:'pending-identity'});
    expect(request.mock.calls.map(([,init])=>init.method)).toEqual(['GET']);
  });
  it.each([undefined,'../private','transaction?query',''])('an approval without a valid identity %p stays unknown',async(id)=>{
    const request=requestSequence(jsonResponse(200,{id,authorised:true}));
    expect((await chargeStoredCard(...args,{request})).success).toBe(false);
  });
  it('a final identity cannot replace the previously persisted pending identity',async()=>{
    const request=requestSequence(jsonResponse(202,{id:'pending-identity'}),jsonResponse(200,{id:'another-identity',authorised:true}));
    expect((await chargeStoredCard(...args,{request,wait:async()=>{}})).success).toBe(false);
  });
  it('does not forward query strings or another transaction path from a provider self link',async()=>{
    const request=requestSequence(jsonResponse(202,{id:'pending-identity',links:[{rel:'self',href:'https://uat.windcave.com/api/v1/transactions/another-identity?private=query'}]}),jsonResponse(200,{id:'pending-identity',authorised:true}));
    await chargeStoredCard(...args,{request,wait:async()=>{}});
    expect(request.mock.calls[1][0]).toBe(request.mock.calls[0][0]+'/pending-identity');
  });
});

describe("Windcave subscription stored-card contract", () => {
  it('retains an already-complete created session without reopening its hosted form',async()=>{
    const request=requestSequence(jsonResponse(202,{id:'already-complete',state:'complete',links:[{rel:'hpp',href:'https://uat.windcave.com/pxmi3/already-complete'}]}));
    const result=await createCardStorageSession('synthetic-x-id','SC_reference','owner@synthetic.test',
      'https://app.example.test/api/billing/card/callback?state=synthetic','https://app.example.test/api/billing/card/notification',{request});
    expect(result).toMatchObject({success:true,sessionId:'already-complete',complete:true});expect(result.hppUrl).toBeUndefined();
  });
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("starts a zero-dollar fixed-monthly recurring card-storage sequence", async () => {
    const request = requestSequence(jsonResponse(202, {
      id: "session-123",
      links: [
        { rel: "self", method: "GET", href: "https://uat.windcave.com/api/v1/sessions/session-123" },
        { rel: "hpp", method: "REDIRECT", href: "https://uat.windcave.com/pxmi3/session-123" },
      ],
    }));

    const result = await createCardStorageSession(
      "card-x-id",
      "TAPTPAY-CARD-M22",
      "owner@example.test",
      "https://app.example.test/api/billing/card/callback?merchantId=22",
      "https://app.example.test/api/billing/card/notification",
      { request },
    );

    expect(result).toEqual({
      success: true,
      sessionId: "session-123",
      hppUrl: "https://uat.windcave.com/pxmi3/session-123",
    });
    expect(request).toHaveBeenCalledTimes(1);

    const [url, init] = request.mock.calls[0];
    expect(url).toMatch(/\/sessions$/);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "X-ID": "card-x-id" });
    expect(JSON.parse(String(init.body))).toEqual({
      type: "validate",
      amount: "0.00",
      currency: "NZD",
      merchantReference: "TAPTPAY-CARD-M22",
      methods: ["card"],
      storeCard: true,
      storedCardIndicator: "recurringfixedinitial",
      recurringExpiry: "9999-12-31",
      recurringFrequency: "monthly",
      customer: { email: "owner@example.test" },
      callbackUrls: {
        approved: "https://app.example.test/api/billing/card/callback?merchantId=22&result=approved",
        declined: "https://app.example.test/api/billing/card/callback?merchantId=22&result=declined",
        cancelled: "https://app.example.test/api/billing/card/callback?merchantId=22&result=cancelled",
      },
      notificationUrl: "https://app.example.test/api/billing/card/notification",
    });
  });

  it.each([200, 201])("accepts a final %i and uses the established fixed-monthly rebill fields", async (status) => {
    const request = requestSequence(jsonResponse(status, {
      id: "transaction-123",
      authorised: true,
      reCo: "00",
      responseText: "APPROVED",
    }));

    const result = await chargeStoredCard(
      "sub-7-2026-08-01",
      "1234567891012345",
      "7.99",
      "TAPTPAY-SOLO-M22-2026-08-01",
      { request },
    );

    expect(result).toEqual({
      success: true,
      approved: true,
      windcaveTransactionId: "transaction-123",
      declineReason: undefined,
    });

    const [, init] = request.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      type: "purchase",
      amount: "7.99",
      currency: "NZD",
      merchantReference: "TAPTPAY-SOLO-M22-2026-08-01",
      cardId: "1234567891012345",
      storedCardIndicator: "recurringfixed",
      recurringExpiry: "9999-12-31",
      recurringFrequency: "monthly",
    });
    expect(body).not.toHaveProperty("card");
    expect(body).not.toHaveProperty("recurring");
    expect(init.headers).toMatchObject({ "X-ID": "sub-7-2026-08-01" });
  });

  it("reads the official stored-card transaction shape from a completed session", async () => {
    const request = requestSequence(jsonResponse(200, {
      // R2-T6: a session query names the session asked about (it named another before).
      id: "session_ABC-123",
      transactions: [{
        id: "validation-transaction",
        authorised: true,
        card: {
          id: "stored-card-token",
          type: "Visa",
          cardNumber: "4111 11** **** 4242",
          dateExpiryMonth: 9,
          dateExpiryYear: 2031,
        },
      }],
    }));

    const result = await queryStoredCardSession("session_ABC-123", { request });

    expect(result).toEqual({
      success: true,
      complete: true,
      approved: true,
      card: {
        cardId: "stored-card-token",
        brand: "Visa",
        last4: "4242",
        expiry: "09/31",
      },
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatch(/\/sessions\/session_ABC-123$/);
    expect(request.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }),
    });
  });

  it("reports a 202 stored-card session as pending without treating it as an error", async () => {
    const request = requestSequence(jsonResponse(202, { id: "session-pending" }));

    await expect(queryStoredCardSession("session-pending", { request })).resolves.toEqual({
      success: true,
      complete: false,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reports an authorised false session transaction as a real decline", async () => {
    const request = requestSequence(jsonResponse(200, {
      transactions: [{
        id: "validation-declined",
        authorised: false,
        responseText: "DECLINED",
      }],
    }));

    await expect(queryStoredCardSession("session-declined", { request })).resolves.toEqual({
      success: true,
      complete: true,
      approved: false,
    });
  });

  it.each([
    ["invalid JSON", "{not-json"],
    ["no transaction", JSON.stringify({ transactions: [] })],
    ["no authorised result", JSON.stringify({ transactions: [{ id: "validation-1" }] })],
  ])("rejects a malformed final session response with %s", async (_case, body) => {
    const request = requestSequence({
      status: 200,
      ok: true,
      text: async () => body,
    } as Response);

    const result = await queryStoredCardSession("session-malformed", { request });

    expect(result).toEqual({
      success: false,
      error: "Windcave stored-card session response did not include a final transaction result",
    });
    expect(result.approved).toBeUndefined();
  });

  it("rejects an approved session result that omits the stored-card token", async () => {
    const request = requestSequence(jsonResponse(200, {
      transactions: [{
        id: "validation-without-card",
        authorised: true,
      }],
    }));

    const result = await queryStoredCardSession("session-without-card", { request });

    expect(result).toEqual({
      success: false,
      error: "Windcave stored-card session response did not include a stored card",
    });
    expect(result.approved).toBeUndefined();
  });

  it("rejects traversal-like session ids before making a provider request", async () => {
    const request = jest.fn();

    await expect(queryStoredCardSession("../session", { request })).resolves.toEqual({
      success: false,
      error: "Invalid Windcave session id",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("polls a 202 transaction until Windcave returns its final 200 outcome", async () => {
    const request = requestSequence(
      jsonResponse(202, { id: "transaction-pending" }),
      jsonResponse(202, { id: "transaction-pending" }),
      jsonResponse(200, {
        id: "transaction-pending",
        authorised: true,
        responseText: "APPROVED",
      }),
    );
    const wait = jest.fn(async (_ms: number) => undefined);

    const result = await chargeStoredCard(
      "sub-8-2026-09-01",
      "1234567891012345",
      "8.99",
      "TAPTPAY-TEAM-M22-2026-09-01",
      { request, wait, transactionPollLimit: 3 },
    );

    expect(result).toMatchObject({
      success: true,
      approved: true,
      windcaveTransactionId: "transaction-pending",
    });
    expect(request).toHaveBeenCalledTimes(3);
    const transactionUrl = request.mock.calls[0][0];
    expect(request.mock.calls.slice(1).map(([url, init]) => [url, init.method])).toEqual([
      [`${transactionUrl}/transaction-pending`, "GET"],
      [`${transactionUrl}/transaction-pending`, "GET"],
    ]);
    expect(wait).toHaveBeenNthCalledWith(1, 5000);
    expect(wait).toHaveBeenNthCalledWith(2, 5000);
  });

  it("uses the final polled response to report a real card decline", async () => {
    const request = requestSequence(
      jsonResponse(202, { id: "transaction-declined" }),
      jsonResponse(200, {
        id: "transaction-declined",
        authorised: false,
        reCo: "51",
        responseText: "INSUFFICIENT FUNDS",
      }),
    );

    const result = await chargeStoredCard(
      "sub-9-2026-09-01",
      "1234567891012345",
      "12.99",
      "TAPTPAY-CREW-M22-2026-09-01",
      { request, wait: async () => undefined },
    );

    expect(result).toEqual({
      success: true,
      approved: false,
      windcaveTransactionId: "transaction-declined",
      declineReason: "INSUFFICIENT FUNDS",
    });
  });

  it("keeps an exhausted 202 response as a transport/pending failure, not a decline", async () => {
    const request = requestSequence(
      jsonResponse(202, { id: "transaction-slow" }),
      jsonResponse(202, { id: "transaction-slow" }),
      jsonResponse(202, { id: "transaction-slow" }),
    );

    const result = await chargeStoredCard(
      "sub-10-2026-09-01",
      "1234567891012345",
      "7.99",
      "TAPTPAY-SOLO-M22-2026-09-01",
      { request, wait: async () => undefined, transactionPollLimit: 2 },
    );

    expect(result).toMatchObject({
      success: false,
      windcaveTransactionId: "transaction-slow",
      error: "Windcave transaction still processing after 2 polls",
    });
    expect(result.approved).toBeUndefined();
  });

  it.each([200, 201])("does not misclassify a malformed final %i response as a card decline", async (status) => {
    const request = requestSequence(jsonResponse(status, {
      id: "transaction-malformed",
      responseText: "APPROVED",
    }));

    const result = await chargeStoredCard(
      "sub-11-2026-09-01",
      "1234567891012345",
      "7.99",
      "TAPTPAY-SOLO-M22-2026-09-01",
      { request },
    );

    expect(result).toMatchObject({
      success: false,
      windcaveTransactionId: "transaction-malformed",
      error: "Windcave transaction response did not include an authorised result",
    });
    expect(result.approved).toBeUndefined();
  });
});
