<?php
/**
 * Plugin Name: Tapt Payment Gateway (Unsupported)
 * Description: Unavailable integration. Checkout, refunds and webhook order updates are disabled.
 * Version: 1.1.1
 * Author: Tapt
 * License: GPL v2 or later
 * Text Domain: tapt-payment-gateway
 */
if (!defined('ABSPATH')) { exit; }

// Keep the historical gateway identity and stored options/order metadata.
// No options, orders, stock, carts or credentials are created/changed here.
add_action('plugins_loaded', 'tapt_payment_gateway_init', 11);
add_action('woocommerce_api_wc_tapt_payment_gateway', 'tapt_unsupported_webhook');
function tapt_unsupported_webhook() {
    wp_die('TaptPay WooCommerce integration is unavailable.', 'Unavailable', array('response' => 503));
}
function tapt_payment_gateway_init() {
    if (!class_exists('WC_Payment_Gateway')) { return; }
    class WC_Tapt_Payment_Gateway extends WC_Payment_Gateway {
        public function __construct() {
            $this->id = 'tapt_payment_gateway';
            $this->method_title = __('Tapt Payment Gateway (Unsupported)', 'tapt-payment-gateway');
            $this->method_description = __('This integration is unavailable. Use another supported payment method.', 'tapt-payment-gateway');
            $this->title = $this->method_title;
            $this->description = $this->method_description;
            $this->enabled = 'no';
            $this->supports = array();
        }
        public function is_available() { return false; }
        public function validate_fields() { return false; }
        public function process_payment($order_id) { return array('result' => 'failure'); }
        public function process_refund($order_id, $amount = null, $reason = '') {
            return new WP_Error('tapt_unsupported', __('TaptPay refunds are unavailable in this plugin.', 'tapt-payment-gateway'));
        }
        public function admin_options() {
            echo '<p>' . esc_html__('TaptPay WooCommerce integration is unavailable. Existing settings and order history are retained. Do not use this gateway for checkout or refunds.', 'tapt-payment-gateway') . '</p>';
        }
    }
    add_filter('woocommerce_payment_gateways', 'tapt_register_unsupported_gateway');
}
function tapt_register_unsupported_gateway($gateways) {
    $gateways[] = 'WC_Tapt_Payment_Gateway';
    return $gateways;
}
