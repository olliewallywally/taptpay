<?php
// Exercise the real contained plugin with minimal WordPress/WooCommerce hosts.
define('ABSPATH', __DIR__);
$actions = array();
$options = array('woocommerce_tapt_payment_gateway_settings' => array('enabled' => 'yes', 'api_key' => 'synthetic-retained-key'));
$before = serialize($options);
function add_action($name, $callback, $priority = 10) { global $actions; $actions[$name] = $callback; }
function add_filter($name, $callback) {}
function __($text, $domain = null) { return $text; }
function esc_html__($text, $domain = null) { return htmlspecialchars($text); }
function wp_die($text, $title, $args) { throw new RuntimeException('STATUS_' . $args['response']); }
function update_option() { throw new RuntimeException('UNEXPECTED_SETTINGS_WRITE'); }
function wc_get_order() { throw new RuntimeException('UNEXPECTED_ORDER_ACCESS'); }
function wp_remote_post() { throw new RuntimeException('UNEXPECTED_NETWORK'); }
function wp_remote_get() { throw new RuntimeException('UNEXPECTED_NETWORK'); }
class WP_Error {
    public $code;
    public function __construct($code, $message) { $this->code = $code; }
}
class WC_Payment_Gateway {
    public $id, $method_title, $method_description, $title, $description, $enabled, $supports;
}
function check($value) { if (!$value) { throw new RuntimeException('UNSUPPORTED_GATEWAY_CONTRACT_FAILED'); } }
require $argv[1];
call_user_func($actions['plugins_loaded']);
$gateway = new WC_Tapt_Payment_Gateway();
check($gateway->id === 'tapt_payment_gateway');
check($gateway->enabled === 'no' && $gateway->is_available() === false);
check($gateway->validate_fields() === false && count($gateway->supports) === 0);
check($gateway->process_payment(123) === array('result' => 'failure'));
check($gateway->process_refund(123, 10, 'synthetic') instanceof WP_Error);
try {
    call_user_func($actions['woocommerce_api_wc_tapt_payment_gateway']);
    throw new RuntimeException('WEBHOOK_NOT_REFUSED');
} catch (RuntimeException $error) { check($error->getMessage() === 'STATUS_503'); }
check(serialize($options) === $before);
echo "PASS unsupported WooCommerce entry points; settings unchanged\n";
