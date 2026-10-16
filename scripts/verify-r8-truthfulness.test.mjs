import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
test('legacy deploy helper cannot certify readiness from environment presence',()=>{
  const result=spawnSync(process.execPath,['scripts/deploy.js'],{encoding:'utf8',env:{PATH:process.env.PATH,
    DATABASE_URL:'postgres://synthetic:synthetic@127.0.0.1:5432/unverified'}});
  assert.equal(result.status,1);
  assert.doesNotMatch(result.stdout,/READY FOR PRODUCTION|All critical requirements are met/);
  assert.match(result.stderr,/DEPLOYMENT.md/);
});
test('unsupported WooCommerce gateway contains no payment, refund or webhook side effects',()=>{
  const source=readFileSync('woocommerce-plugin/tapt-payment-gateway/tapt-payment-gateway.php','utf8');
  assert.match(source,/function is_available\(\)\s*\{\s*return false;/);
  assert.doesNotMatch(source,/wp_remote_|wc_get_order|payment_complete|update_status|empty_cart|wc_reduce_stock|class-tapt-admin/);
  assert.match(source,/'response'\s*=>\s*503/);
  assert.match(source,/function process_payment/);
  assert.match(source,/function process_refund/);
});
test('PHP parses and executes the real unavailable gateway without money/order/network/settings effects',()=>{
  const php=process.env.PHP_BIN??'php';
  const file='woocommerce-plugin/tapt-payment-gateway/tapt-payment-gateway.php';
  const syntax=spawnSync(php,['-n','-l',file],{encoding:'utf8',timeout:5000});
  assert.equal(syntax.status,0,'PHP_SYNTAX_OR_RUNTIME_UNAVAILABLE');
  const run=spawnSync(php,['-n','scripts/fixtures/unsupported-woocommerce.php',file],{encoding:'utf8',timeout:5000});
  assert.equal(run.status,0,'UNSUPPORTED_PLUGIN_RUNTIME_FAILED');
  assert.equal(run.stdout,'PASS unsupported WooCommerce entry points; settings unchanged\n');
  assert.equal(run.stderr,'');
});
