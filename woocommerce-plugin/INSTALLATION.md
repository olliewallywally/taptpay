# Tapt Payment Gateway for WooCommerce - Installation Guide

## Prerequisites

- WordPress 5.0 or higher
- WooCommerce 3.5.0 or higher  
- PHP 7.4 or higher
- SSL certificate (required for payment processing)
- Active Tapt merchant account

## Installation Methods

### Method 1: WordPress Admin Upload (Recommended)

1. **Download the Plugin**
   - Download the `tapt-payment-gateway.zip` file
   - Or create a ZIP from the `tapt-payment-gateway` folder

2. **Upload via WordPress Admin**
   - Log into your WordPress admin panel
   - Go to **Plugins > Add New**
   - Click **Upload Plugin**
   - Choose the ZIP file and click **Install Now**
   - Click **Activate Plugin**

### Method 2: FTP Upload

1. **Extract Files**
   - Extract the plugin files to your computer
   
2. **Upload via FTP**
   - Connect to your website via FTP
   - Upload the `tapt-payment-gateway` folder to `/wp-content/plugins/`
   - Ensure proper file permissions (755 for folders, 644 for files)

3. **Activate Plugin**
   - Go to WordPress Admin > Plugins
   - Find "Tapt Payment Gateway" and click **Activate**

## Configuration

### Step 1: Get Your Tapt API Credentials

1. Sign up or log into your Tapt merchant dashboard at https://tapt.co.nz/dashboard
2. Navigate to **API Management** section
3. Create a new API key for WooCommerce:
   - **Key Name**: "WooCommerce Store API"
   - **Environment**: Choose "Sandbox" for testing or "Live" for production
   - **Permissions**: Select "create_transactions" and "read_transactions"
   - **Webhook URL**: `https://yoursite.com/wc-api/wc_tapt_payment_gateway`
4. Copy your API key and endpoint URL

### Step 2: Configure the Plugin

1. **Access Settings**
   - Go to **WooCommerce > Settings > Payments**
   - Find "Tapt Payment Gateway" and click **Manage**

2. **Basic Settings**
   - ✅ **Enable/Disable**: Check to enable the gateway
   - **Title**: "Tapt Payment" (or customize as needed)
   - **Description**: Customize the checkout description

3. **API Configuration**
   - **Test Mode**: Check this for testing, uncheck for live payments
   - **Sandbox API Endpoint**: Enter your sandbox endpoint (for testing)
   - **Live API Endpoint**: Enter your live endpoint (for production)
   - **API Key**: Paste your API key from Tapt dashboard
   - **Webhook Secret**: (Optional but recommended for security)

4. **Webhook Setup**
   - Copy the **Webhook URL** displayed in settings
   - Add this URL to your Tapt dashboard webhook configuration

### Step 3: Test the Integration

1. **Enable Test Mode**
   - Ensure "Test Mode" is checked
   - Use your sandbox API credentials

2. **Place a Test Order**
   - Add a product to cart and proceed to checkout
   - Select "Tapt Payment" as payment method
   - Complete the checkout process
   - You'll be redirected to Tapt's payment page

3. **Verify Order Processing**
   - Complete the test payment
   - Check that the order status updates in WooCommerce
   - Verify webhook notifications are working

### Step 4: Go Live

1. **Switch to Live Mode**
   - Uncheck "Test Mode" in settings
   - Enter your live API credentials
   - Update webhook URL in Tapt dashboard to use live environment

2. **Final Testing**
   - Place a small real transaction to verify everything works
   - Monitor order processing and status updates

## Webhook Configuration

### In Your Tapt Dashboard:
- **Webhook URL**: `https://yoursite.com/wc-api/wc_tapt_payment_gateway`
- **Events**: Select `transaction.completed`, `transaction.failed`, `transaction.cancelled`
- **Secret**: Use the same secret you entered in WooCommerce settings

### Important Notes:
- Webhooks enable real-time order status updates
- Without webhooks, orders may remain "on-hold" even after payment
- Ensure your website is accessible from the internet for webhooks to work

## Troubleshooting

### Common Issues:

**❌ "Gateway not configured" error**
- Solution: Check that API key and endpoint are correctly entered
- Verify API key has proper permissions in Tapt dashboard

**❌ Orders stuck "on-hold"**
- Solution: Check webhook configuration
- Verify webhook URL is accessible from internet
- Check webhook secret matches between WooCommerce and Tapt

**❌ "Payment error: Invalid response"**
- Solution: Verify API endpoint URL format (should start with https://)
- Check API key is active and not expired
- Ensure test/live mode matches your API credentials

**❌ SSL/HTTPS errors**
- Solution: Ensure your website has a valid SSL certificate
- Payment processing requires HTTPS for security

### Debug Steps:

1. **Check WooCommerce Logs**
   - Go to **WooCommerce > Status > Logs**
   - Look for "tapt-payment-gateway" entries

2. **Verify API Connection**
   - Use the "Test Connection" button in gateway settings
   - Check network connectivity to Tapt API

3. **Test Webhook Delivery**
   - Create a test transaction
   - Check webhook delivery logs in Tapt dashboard
   - Verify webhook endpoint is responding

## Support

If you need help with installation or configuration:

- 📚 **Documentation**: https://tapt.co.nz/docs
- 💬 **Support**: https://tapt.co.nz/support  
- ✉️ **Email**: support@tapt.co.nz

## Security Considerations

- Always use HTTPS for your website
- Keep your API keys secure and never share them
- Use webhook secrets for additional security
- Regularly update the plugin for security patches
- Test thoroughly before going live with real payments

## File Structure

```
tapt-payment-gateway/
├── tapt-payment-gateway.php    # Main plugin file
├── readme.txt                  # WordPress plugin readme
├── assets/
│   ├── checkout.js            # Frontend checkout scripts
│   ├── admin.js               # Admin panel scripts
│   ├── admin.css              # Admin styling
│   └── tapt-icon.svg          # Payment method icon
├── includes/
│   └── class-tapt-admin.php   # Admin functionality
├── languages/
│   └── tapt-payment-gateway.pot # Translation template
└── INSTALLATION.md            # This file
```