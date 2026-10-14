import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
test('delivery is bootstrapped for DB-backed cash/manual events independently of provider querying',()=>{
  const source=readFileSync(resolve(__dirname,'../index.ts'),'utf8');
  expect(source).toMatch(/if\(isDatabaseConnected\(\)\)\{\s*const delivery=createPaymentDeliveryRuntime\(\)/);
  expect(source).toMatch(/if\(config.features.providerReconciliation && isDatabaseConnected\(\) && config.windcave.username && config.windcave.apiKey\)/);
});
