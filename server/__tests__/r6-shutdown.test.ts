import './support/test-env';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { RuntimeResources, installShutdownHandlers } from '../server-shutdown';
import { startServerWithPortManagement } from '../port-manager';

it.each(['SIGTERM', 'SIGINT'])(
  'drains active HTTP/worker/SSE before pools/audit on real %s and a repeated signal',
  signal => {
    const url = (name: string) =>
      JSON.stringify(
        pathToFileURL(path.resolve(__dirname, '..', name + '.ts')).href
      );
    const script = `
    import http from 'node:http';
    const {createApp}=await import(${url('app')});
    const {ApplicationHealth}=await import(${url('application-health')});
    const {RuntimeResources,installShutdownHandlers}=await import(${url('server-shutdown')});
    const {startDrainingLoop}=await import(${url('draining-loop')});
    const {SseBroker}=await import(${url('sse-broker')});
    const events=[],health=new ApplicationHealth({database:async()=>true,schemaValid:()=>true,configValid:true});
    const app=createApp({writeRequestLog:()=>{},health}),server=http.createServer(app),broker=new SseBroker(),resources=new RuntimeResources();
    let started,releaseWorker,releaseHttp=()=>{};const active=new Promise(r=>started=r),workDone=new Promise(r=>releaseWorker=r);
    const worker=startDrainingLoop(async()=>{events.push('work_started');started();await workDone;events.push('work_finished');},5);
    let sse;
    resources.add({stop:()=>{events.push(health.draining?'draining_first':'wrong_order');worker();sse=broker.drain();setTimeout(releaseWorker,40);setTimeout(()=>releaseHttp(),80);},drain:async()=>{await Promise.all([worker.drain(),sse]);},close:async()=>{events.push('pool_closed');}});
    app.get('/stream',(_req,res)=>{res.setHeader('Content-Type','text/event-stream');broker.subscribe(1,{kind:'board',stoneId:1},res);});
    app.get('/hold',(_req,res)=>{releaseHttp=()=>{events.push('http_finished');res.end('done');};res.flushHeaders();});
    health.completeBoot();await new Promise(r=>server.listen(0,'127.0.0.1',r));
    installShutdownHandlers(server,{health,resources,drainMs:1500,closeMs:300,auditMs:300,hardMs:2500,
      audit:async()=>{events.push('audit_flushed');return true;},exit:code=>{console.log(JSON.stringify({result:events,code,subscribers:broker.subscriberCount()}));process.exit(code);}});
    const address={host:'127.0.0.1',port:server.address().port};
    await new Promise((resolve,reject)=>{http.get({...address,path:'/stream'},res=>{res.on('data',()=>resolve());res.on('error',()=>{});}).on('error',reject);});
    await active;
    http.get({...address,path:'/hold'},res=>{res.resume();process.kill(process.pid,${JSON.stringify(signal)});setTimeout(()=>process.kill(process.pid,${JSON.stringify(signal)}),5);});
  `;
    const result = spawnSync(
      process.execPath,
      ['--import=tsx', '--input-type=module', '-e', script],
      {
        cwd: path.resolve(__dirname, '../..'),
        env: { APP_ENV: 'test', ENV_VALIDATION_MODE: 'audit' },
        encoding: 'utf8',
        timeout: 10000,
      }
    );
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    if (result.status !== 0)
      throw Error(
        `Isolated fixture failed: ${result.stdout}\n${result.stderr}`
      );
    const row = result.stdout
      .trim()
      .split('\n')
      .map(s => JSON.parse(s))
      .find(r => r.result);
    expect(row.subscribers).toBe(0);
    expect(row.result.filter((x: string) => x === 'work_started')).toHaveLength(
      1
    );
    expect(row.result.indexOf('draining_first')).toBeLessThan(
      row.result.indexOf('http_finished')
    );
    expect(row.result.indexOf('work_finished')).toBeLessThan(
      row.result.indexOf('pool_closed')
    );
    expect(row.result.slice(-2)).toEqual(['pool_closed', 'audit_flushed']);
  }
);
it('bounds an uncertain worker, skips premature pool close and still attempts audit', async () => {
  const server = http.createServer(),
    events: string[] = [],
    resources = new RuntimeResources();
  let exitCode: number | undefined;
  resources.add({
    stop: () => events.push('stop'),
    drain: () => new Promise(() => {}),
    close: async () => {
      events.push('pool');
    },
  });
  const controller = installShutdownHandlers(server, {
    resources,
    drainMs: 15,
    closeMs: 15,
    auditMs: 15,
    hardMs: 150,
    exit: code => {
      exitCode = code;
    },
    audit: async () => {
      events.push('audit');
      return true;
    },
  });
  try {
    await controller.begin('SIGTERM');
    expect(exitCode).toBe(1);
    expect(events).toEqual(['stop', 'audit']);
  } finally {
    controller.dispose();
  }
});
it('fails shutdown on audit failure and keeps startup failure fatal', async () => {
  for (const reason of ['SIGTERM', 'STARTUP_FAILURE']) {
    let code: number | undefined;
    const controller = installShutdownHandlers(http.createServer(), {
      exit: value => {
        code = value;
      },
      audit: async () => reason === 'STARTUP_FAILURE',
    });
    try {
      await controller.begin(reason);
      expect(code).toBe(1);
    } finally {
      controller.dispose();
    }
  }
});
it('stops a resource registered during startup drain immediately', () => {
  const resources = new RuntimeResources(),
    stop = jest.fn();
  resources.stop();
  resources.add({ stop });
  expect(stop).toHaveBeenCalledTimes(1);
});
it('refuses an occupied port without disturbing the existing listener', async () => {
  const original = http.createServer((_req, res) => res.end('owner')),
    candidate = http.createServer();
  await new Promise<void>(r => original.listen(0, '127.0.0.1', r));
  const port = (original.address() as { port: number }).port;
  try {
    expect(
      await startServerWithPortManagement(candidate, port, '127.0.0.1')
    ).toBe(false);
    expect(original.listening).toBe(true);
  } finally {
    await new Promise<void>(r => original.close(() => r()));
  }
});
