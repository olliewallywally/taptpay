<?php
/**
 * Tapt Payment Gateway Admin Class
 *
 * @package TaptPaymentGateway
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Admin functionality for Tapt Payment Gateway
 */
class Tapt_Admin {

    /**
     * Constructor
     */
    public function __construct() {
        add_action('admin_enqueue_scripts', array($this, 'admin_scripts'));
        add_action('admin_notices', array($this, 'admin_notices'));
        add_filter('woocommerce_settings_tabs_checkout', array($this, 'add_settings_tab'));
    }

    /**
     * Enqueue admin scripts and styles
     */
    public function admin_scripts($hook) {
        if ('woocommerce_page_wc-settings' !== $hook) {
            return;
        }

        wp_enqueue_style(
            'tapt-admin-css',
            TAPT_PAYMENT_GATEWAY_PLUGIN_URL . 'assets/admin.css',
            array(),
            TAPT_PAYMENT_GATEWAY_VERSION
        );

        wp_enqueue_script(
            'tapt-admin-js',
            TAPT_PAYMENT_GATEWAY_PLUGIN_URL . 'assets/admin.js',
            array('jquery'),
            TAPT_PAYMENT_GATEWAY_VERSION,
            true
        );
    }

    /**
     * Display admin notices
     */
    public function admin_notices() {
        // Check if WooCommerce is active
        if (!class_exists('WooCommerce')) {
            echo '<div class="notice notice-error"><p>';
            echo __('Tapt Payment Gateway requires WooCommerce to be installed and active.', 'tapt-payment-gateway');
            echo '</p></div>';
            return;
        }

        // Check if gateway is enabled but not configured
        $gateway = WC()->payment_gateways()->payment_gateways()['tapt_payment_gateway'] ?? null;
        if ($gateway && $gateway->enabled === 'yes' && empty($gateway->api_key)) {
            echo '<div class="notice notice-warning"><p>';
            echo sprintf(
                __('Tapt Payment Gateway is enabled but not configured. <a href="%s">Configure it now</a>.', 'tapt-payment-gateway'),
                admin_url('admin.php?page=wc-settings&tab=checkout&section=tapt_payment_gateway')
            );
            echo '</p></div>';
        }
    }

    /**
     * Add settings tab for checkout
     */
    public function add_settings_tab() {
        // Additional functionality can be added here
    }

    /**
     * Test API connection
     */
    public static function test_api_connection($api_endpoint, $api_key) {
        $test_url = rtrim($api_endpoint, '/') . '/api/v1/test';
        
        $args = array(
            'headers' => array(
                'Authorization' => 'Bearer ' . $api_key,
                'Content-Type' => 'application/json',
            ),
            'timeout' => 10,
            'method' => 'GET',
        );

        $response = wp_remote_get($test_url, $args);

        if (is_wp_error($response)) {
            return array(
                'success' => false,
                'message' => $response->get_error_message()
            );
        }

        $status_code = wp_remote_retrieve_response_code($response);
        
        if ($status_code === 200) {
            return array(
                'success' => true,
                'message' => __('API connection successful', 'tapt-payment-gateway')
            );
        }

        return array(
            'success' => false,
            'message' => sprintf(__('API connection failed with status %d', 'tapt-payment-gateway'), $status_code)
        );
    }

    /**
     * Format currency for display
     */
    public static function format_currency($amount, $currency = 'NZD') {
        return sprintf('$%s %s', number_format($amount, 2), $currency);
    }

    /**
     * Get plugin status information
     */
    public static function get_plugin_status() {
        $gateway = WC()->payment_gateways()->payment_gateways()['tapt_payment_gateway'] ?? null;
        
        if (!$gateway) {
            return array(
                'configured' => false,
                'enabled' => false,
                'api_connected' => false
            );
        }

        $configured = !empty($gateway->api_key) && !empty($gateway->api_base_url);
        $enabled = $gateway->enabled === 'yes';
        $api_connected = false;

        if ($configured) {
            $test_result = self::test_api_connection($gateway->api_base_url, $gateway->api_key);
            $api_connected = $test_result['success'];
        }

        return array(
            'configured' => $configured,
            'enabled' => $enabled,
            'api_connected' => $api_connected,
            'testmode' => $gateway->testmode
        );
    }
}

new Tapt_Admin();