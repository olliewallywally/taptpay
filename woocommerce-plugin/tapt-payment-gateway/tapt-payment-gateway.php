<?php
/**
 * Plugin Name: Tapt Payment Gateway
 * Plugin URI: https://tapt.co.nz
 * Description: Accept payments using Tapt's secure payment processing with NFC and QR code support. Perfect for businesses wanting modern payment solutions with low fixed fees.
 * Version: 1.0.0
 * Author: Tapt
 * Author URI: https://tapt.co.nz
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: tapt-payment-gateway
 * Domain Path: /languages
 * Requires at least: 5.0
 * Tested up to: 6.4
 * WC requires at least: 3.5.0
 * WC tested up to: 8.5
 *
 * @package TaptPaymentGateway
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('TAPT_PAYMENT_GATEWAY_VERSION', '1.0.0');
define('TAPT_PAYMENT_GATEWAY_PLUGIN_URL', plugin_dir_url(__FILE__));
define('TAPT_PAYMENT_GATEWAY_PLUGIN_PATH', plugin_dir_path(__FILE__));

/**
 * Check if WooCommerce is active
 */
if (!in_array('woocommerce/woocommerce.php', apply_filters('active_plugins', get_option('active_plugins')))) {
    return;
}

/**
 * Initialize the Tapt Payment Gateway
 */
add_action('plugins_loaded', 'tapt_payment_gateway_init', 11);

function tapt_payment_gateway_init() {
    if (!class_exists('WC_Payment_Gateway')) {
        return;
    }

    // Include admin class
    if (is_admin()) {
        require_once TAPT_PAYMENT_GATEWAY_PLUGIN_PATH . 'includes/class-tapt-admin.php';
    }

    /**
     * Tapt Payment Gateway Class
     */
    class WC_Tapt_Payment_Gateway extends WC_Payment_Gateway {

        /**
         * Constructor
         */
        public function __construct() {
            $this->id                 = 'tapt_payment_gateway';
            $this->icon               = TAPT_PAYMENT_GATEWAY_PLUGIN_URL . 'assets/tapt-icon.svg';
            $this->has_fields         = false;
            $this->method_title       = __('Tapt Payment Gateway', 'tapt-payment-gateway');
            $this->method_description = __('Accept payments using Tapt\'s secure payment processing with NFC and QR code support.', 'tapt-payment-gateway');

            // Supported features
            $this->supports = array(
                'products',
                'refunds'
            );

            // Load the settings
            $this->init_form_fields();
            $this->init_settings();

            // Define user set variables
            $this->title                = $this->get_option('title');
            $this->description          = $this->get_option('description');
            $this->enabled              = $this->get_option('enabled');
            $this->testmode             = 'yes' === $this->get_option('testmode');
            $this->api_endpoint         = $this->get_option('api_endpoint');
            $this->api_key              = $this->get_option('api_key');
            $this->webhook_secret       = $this->get_option('webhook_secret');

            // Set API endpoint based on mode
            if ($this->testmode) {
                $this->api_base_url = $this->get_option('sandbox_api_endpoint', 'https://your-sandbox-domain.replit.app');
            } else {
                $this->api_base_url = $this->get_option('live_api_endpoint', 'https://your-live-domain.replit.app');
            }

            // Actions
            add_action('woocommerce_update_options_payment_gateways_' . $this->id, array($this, 'process_admin_options'));
            add_action('woocommerce_api_wc_tapt_payment_gateway', array($this, 'webhook'));
            add_action('wp_enqueue_scripts', array($this, 'payment_scripts'));
        }

        /**
         * Initialize Gateway Settings Form Fields
         */
        public function init_form_fields() {
            $this->form_fields = array(
                'enabled' => array(
                    'title'   => __('Enable/Disable', 'tapt-payment-gateway'),
                    'type'    => 'checkbox',
                    'label'   => __('Enable Tapt Payment Gateway', 'tapt-payment-gateway'),
                    'default' => 'yes'
                ),
                'title' => array(
                    'title'       => __('Title', 'tapt-payment-gateway'),
                    'type'        => 'text',
                    'description' => __('This controls the title which the user sees during checkout.', 'tapt-payment-gateway'),
                    'default'     => __('Tapt Payment', 'tapt-payment-gateway'),
                    'desc_tip'    => true,
                ),
                'description' => array(
                    'title'       => __('Description', 'tapt-payment-gateway'),
                    'type'        => 'textarea',
                    'description' => __('Payment method description that the customer will see on your checkout.', 'tapt-payment-gateway'),
                    'default'     => __('Pay securely using Tapt with NFC tap-to-pay or QR code scanning. Fixed $0.25 fee per transaction.', 'tapt-payment-gateway'),
                    'desc_tip'    => true,
                ),
                'testmode' => array(
                    'title'       => __('Test mode', 'tapt-payment-gateway'),
                    'label'       => __('Enable Test Mode', 'tapt-payment-gateway'),
                    'type'        => 'checkbox',
                    'description' => __('Place the payment gateway in test mode using test API keys.', 'tapt-payment-gateway'),
                    'default'     => 'yes',
                    'desc_tip'    => true,
                ),
                'sandbox_api_endpoint' => array(
                    'title'       => __('Sandbox API Endpoint', 'tapt-payment-gateway'),
                    'type'        => 'text',
                    'description' => __('Your Tapt sandbox/development API endpoint URL.', 'tapt-payment-gateway'),
                    'default'     => 'https://your-sandbox-domain.replit.app',
                    'desc_tip'    => true,
                ),
                'live_api_endpoint' => array(
                    'title'       => __('Live API Endpoint', 'tapt-payment-gateway'),
                    'type'        => 'text',
                    'description' => __('Your Tapt live production API endpoint URL.', 'tapt-payment-gateway'),
                    'default'     => 'https://your-live-domain.replit.app',
                    'desc_tip'    => true,
                ),
                'api_key' => array(
                    'title'       => __('API Key', 'tapt-payment-gateway'),
                    'type'        => 'password',
                    'description' => __('Get your API keys from your Tapt admin dashboard.', 'tapt-payment-gateway'),
                    'default'     => '',
                    'desc_tip'    => true,
                ),
                'webhook_secret' => array(
                    'title'       => __('Webhook Secret', 'tapt-payment-gateway'),
                    'type'        => 'password',
                    'description' => __('Optional webhook secret for secure payment notifications.', 'tapt-payment-gateway'),
                    'default'     => '',
                    'desc_tip'    => true,
                ),
                'webhook_url' => array(
                    'title'       => __('Webhook URL', 'tapt-payment-gateway'),
                    'type'        => 'text',
                    'description' => sprintf(__('Copy this URL to your Tapt webhook settings: %s', 'tapt-payment-gateway'), home_url('/wc-api/wc_tapt_payment_gateway')),
                    'default'     => home_url('/wc-api/wc_tapt_payment_gateway'),
                    'custom_attributes' => array('readonly' => 'readonly'),
                    'desc_tip'    => false,
                ),
            );
        }

        /**
         * Payment form on checkout page
         */
        public function payment_fields() {
            if ($this->description) {
                echo wpautop(wp_kses_post($this->description));
            }
            
            echo '<div id="tapt-payment-data">';
            echo '<p>' . __('You will be redirected to complete your payment securely with Tapt.', 'tapt-payment-gateway') . '</p>';
            echo '</div>';
        }

        /**
         * Process the payment and return the result
         */
        public function process_payment($order_id) {
            $order = wc_get_order($order_id);

            // Create transaction via Tapt API
            $response = $this->create_tapt_transaction($order);

            if (is_wp_error($response)) {
                wc_add_notice(__('Payment error: ', 'tapt-payment-gateway') . $response->get_error_message(), 'error');
                return array('result' => 'failure');
            }

            if (!isset($response['payment_url']) || !isset($response['id'])) {
                wc_add_notice(__('Payment error: Invalid response from payment provider.', 'tapt-payment-gateway'), 'error');
                return array('result' => 'failure');
            }

            // Store transaction ID in order meta
            $order->update_meta_data('_tapt_transaction_id', $response['id']);
            $order->update_meta_data('_tapt_payment_url', $response['payment_url']);
            $order->save();

            // Mark as on-hold (we will reduce stock)
            $order->update_status('on-hold', __('Awaiting Tapt payment confirmation.', 'tapt-payment-gateway'));

            // Reduce stock levels
            wc_reduce_stock_levels($order_id);

            // Remove cart
            WC()->cart->empty_cart();

            // Return success and redirect to payment URL
            return array(
                'result'   => 'success',
                'redirect' => $response['payment_url']
            );
        }

        /**
         * Create transaction via Tapt API
         */
        private function create_tapt_transaction($order) {
            $api_url = $this->api_base_url . '/api/v1/transactions';
            
            $body = array(
                'amount'         => floatval($order->get_total()),
                'currency'       => $order->get_currency(),
                'item_name'      => sprintf(__('Order #%s from %s', 'tapt-payment-gateway'), $order->get_order_number(), get_bloginfo('name')),
                'customer_email' => $order->get_billing_email(),
                'return_url'     => $this->get_return_url($order),
                'webhook_url'    => home_url('/wc-api/wc_tapt_payment_gateway'),
                'metadata'       => array(
                    'woocommerce_order_id' => $order->get_id(),
                    'woocommerce_order_key' => $order->get_order_key(),
                    'source' => 'woocommerce'
                )
            );

            $args = array(
                'body'        => json_encode($body),
                'headers'     => array(
                    'Content-Type'  => 'application/json',
                    'Authorization' => 'Bearer ' . $this->api_key,
                ),
                'timeout'     => 60,
                'method'      => 'POST',
            );

            $response = wp_remote_post($api_url, $args);

            if (is_wp_error($response)) {
                return $response;
            }

            $body = wp_remote_retrieve_body($response);
            $data = json_decode($body, true);

            if (wp_remote_retrieve_response_code($response) !== 200) {
                return new WP_Error('tapt_api_error', isset($data['error']) ? $data['error'] : __('Unknown API error', 'tapt-payment-gateway'));
            }

            return $data;
        }

        /**
         * Process refund
         */
        public function process_refund($order_id, $amount = null, $reason = '') {
            $order = wc_get_order($order_id);
            $transaction_id = $order->get_meta('_tapt_transaction_id');

            if (!$transaction_id) {
                return new WP_Error('tapt_refund_error', __('Transaction ID not found', 'tapt-payment-gateway'));
            }

            // For now, return false to indicate manual refund needed
            // In a full implementation, you would call the Tapt refund API
            $order->add_order_note(sprintf(__('Refund of %s requested via Tapt. Please process manually in your Tapt dashboard.', 'tapt-payment-gateway'), wc_price($amount)));
            
            return false; // This requires manual processing
        }

        /**
         * Webhook handler
         */
        public function webhook() {
            $payload = @file_get_contents('php://input');
            $data = json_decode($payload, true);

            if (!$data || !isset($data['event']) || !isset($data['data'])) {
                wp_die('Invalid webhook data', 'Webhook Error', array('response' => 400));
            }

            // Verify webhook secret if configured
            if (!empty($this->webhook_secret)) {
                $signature = $_SERVER['HTTP_X_TAPT_SIGNATURE'] ?? '';
                $expected_signature = hash_hmac('sha256', $payload, $this->webhook_secret);
                
                if (!hash_equals($expected_signature, $signature)) {
                    wp_die('Invalid signature', 'Webhook Error', array('response' => 401));
                }
            }

            $event_type = $data['event'];
            $transaction_data = $data['data'];

            // Find order by transaction ID
            $orders = wc_get_orders(array(
                'meta_key'   => '_tapt_transaction_id',
                'meta_value' => $transaction_data['id'],
                'limit'      => 1,
            ));

            if (empty($orders)) {
                wp_die('Order not found', 'Webhook Error', array('response' => 404));
            }

            $order = $orders[0];

            switch ($event_type) {
                case 'transaction.completed':
                    if ($order->get_status() !== 'processing' && $order->get_status() !== 'completed') {
                        $order->payment_complete($transaction_data['windcave_transaction_id'] ?? $transaction_data['id']);
                        $order->add_order_note(__('Payment completed via Tapt.', 'tapt-payment-gateway'));
                    }
                    break;

                case 'transaction.failed':
                    $order->update_status('failed', __('Payment failed via Tapt.', 'tapt-payment-gateway'));
                    break;

                case 'transaction.cancelled':
                    $order->update_status('cancelled', __('Payment cancelled via Tapt.', 'tapt-payment-gateway'));
                    break;
            }

            wp_die('OK', 'Webhook Success', array('response' => 200));
        }

        /**
         * Load payment scripts
         */
        public function payment_scripts() {
            if (!is_admin() && !is_cart() && !is_checkout() && !isset($_GET['pay_for_order'])) {
                return;
            }

            if ('no' === $this->enabled) {
                return;
            }

            if (empty($this->api_key)) {
                return;
            }

            wp_enqueue_script('tapt-payment-gateway', TAPT_PAYMENT_GATEWAY_PLUGIN_URL . 'assets/checkout.js', array('jquery'), TAPT_PAYMENT_GATEWAY_VERSION, true);

            wp_localize_script('tapt-payment-gateway', 'tapt_params', array(
                'api_url' => $this->api_base_url,
                'testmode' => $this->testmode,
            ));
        }

        /**
         * Admin Panel Options
         */
        public function admin_options() {
            echo '<div class="tapt-admin-header">';
            echo '<h3>' . __('Tapt Payment Gateway', 'tapt-payment-gateway') . '</h3>';
            echo '<p>' . __('Modern payment processing with NFC tap-to-pay, QR codes, and transparent fixed-fee pricing.', 'tapt-payment-gateway') . '</p>';
            echo '</div>';

            // Show status indicators
            $status = Tapt_Admin::get_plugin_status();
            echo '<div class="tapt-feature-grid">';
            
            echo '<div class="tapt-feature-card">';
            echo '<h4>🔧 Configuration Status</h4>';
            if ($status['configured']) {
                echo '<span class="tapt-status-indicator tapt-status-connected">✅ Configured</span>';
            } else {
                echo '<span class="tapt-status-indicator tapt-status-error">❌ Not Configured</span>';
            }
            echo '</div>';

            echo '<div class="tapt-feature-card">';
            echo '<h4>🌐 API Connection</h4>';
            if ($status['api_connected']) {
                echo '<span class="tapt-status-indicator tapt-status-connected">✅ Connected</span>';
            } else {
                echo '<span class="tapt-status-indicator tapt-status-error">❌ Not Connected</span>';
            }
            echo '</div>';

            echo '<div class="tapt-feature-card">';
            echo '<h4>⚡ Gateway Status</h4>';
            if ($status['enabled']) {
                echo '<span class="tapt-status-indicator tapt-status-connected">✅ Enabled</span>';
            } else {
                echo '<span class="tapt-status-indicator tapt-status-warning">⚠️ Disabled</span>';
            }
            echo '</div>';

            echo '<div class="tapt-feature-card">';
            echo '<h4>🧪 Environment</h4>';
            if ($status['testmode']) {
                echo '<span class="tapt-status-indicator tapt-status-warning">🧪 Test Mode</span>';
            } else {
                echo '<span class="tapt-status-indicator tapt-status-connected">🚀 Live Mode</span>';
            }
            echo '</div>';

            echo '</div>';

            echo '<table class="form-table">';
            $this->generate_settings_html();
            echo '</table>';

            // Help section
            echo '<div class="tapt-help-section">';
            echo '<h4>Need Help?</h4>';
            echo '<div class="tapt-help-links">';
            echo '<a href="https://tapt.co.nz/docs" target="_blank">📚 Documentation</a>';
            echo '<a href="https://tapt.co.nz/support" target="_blank">💬 Support</a>';
            echo '<a href="https://tapt.co.nz/dashboard" target="_blank">⚙️ Tapt Dashboard</a>';
            echo '</div>';
            echo '</div>';
        }
    }
}

/**
 * Add the Gateway to WooCommerce
 */
function tapt_add_gateway_class($gateways) {
    $gateways[] = 'WC_Tapt_Payment_Gateway';
    return $gateways;
}
add_filter('woocommerce_payment_gateways', 'tapt_add_gateway_class');

/**
 * Plugin activation hook
 */
register_activation_hook(__FILE__, 'tapt_payment_gateway_activate');

function tapt_payment_gateway_activate() {
    // Check if WooCommerce is active
    if (!class_exists('WooCommerce')) {
        deactivate_plugins(plugin_basename(__FILE__));
        wp_die(__('This plugin requires WooCommerce to be installed and active.', 'tapt-payment-gateway'));
    }
}

/**
 * Add settings link on plugin page
 */
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'tapt_payment_gateway_action_links');

function tapt_payment_gateway_action_links($links) {
    $settings_link = '<a href="' . admin_url('admin.php?page=wc-settings&tab=checkout&section=tapt_payment_gateway') . '">' . __('Settings', 'tapt-payment-gateway') . '</a>';
    array_unshift($links, $settings_link);
    return $links;
}

/**
 * Load textdomain for translations
 */
add_action('plugins_loaded', 'tapt_payment_gateway_load_textdomain');

function tapt_payment_gateway_load_textdomain() {
    load_plugin_textdomain('tapt-payment-gateway', false, basename(dirname(__FILE__)) . '/languages');
}