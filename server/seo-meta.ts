export function getPageMetaTags(url: string): string {
  const baseUrl = process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : 'https://taptpay.com';
  
  const pages: Record<string, {
    title: string;
    description: string;
    ogTitle?: string;
    ogDescription?: string;
    keywords?: string;
  }> = {
    '/': {
      title: 'TapTpay - Modern Payment Terminal | QR & NFC Payments',
      description: 'Accept payments anywhere with TapTpay. Simple QR code and NFC payment terminal for modern businesses. Fast, secure, and easy to use. Get started in minutes.',
      ogTitle: 'TapTpay - Modern Payment Terminal for Your Business',
      ogDescription: 'Revolutionary payment solution with QR codes and NFC. Accept payments instantly with no hardware required.',
      keywords: 'payment terminal, QR payments, NFC payments, mobile payments, contactless payments, business payments, digital wallet, tap to pay',
    },
    '/login': {
      title: 'Login - TapTpay Payment Terminal',
      description: 'Access your TapTpay merchant account to manage payments, view transactions, track revenue, and configure your payment settings.',
      ogTitle: 'Login to TapTpay',
      ogDescription: 'Sign in to your merchant dashboard to manage payments and track your business.',
      keywords: 'merchant login, payment dashboard, taptpay login, business account',
    },
  };

  const meta = pages[url] || pages['/'];
  const canonical = `${baseUrl}${url}`;
  const ogImage = `${baseUrl}/og-image.png`;

  return `
    <title>${meta.title}</title>
    <meta name="description" content="${meta.description}" />
    <meta name="keywords" content="${meta.keywords || ''}" />
    <link rel="canonical" href="${canonical}" />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${meta.ogTitle || meta.title}" />
    <meta property="og:description" content="${meta.ogDescription || meta.description}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:site_name" content="TapTpay" />
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${canonical}" />
    <meta name="twitter:title" content="${meta.ogTitle || meta.title}" />
    <meta name="twitter:description" content="${meta.ogDescription || meta.description}" />
    <meta name="twitter:image" content="${ogImage}" />
    <meta name="twitter:creator" content="@taptpay" />
    
    <!-- Additional SEO -->
    <meta name="robots" content="index, follow" />
    <meta name="language" content="English" />
    <meta name="revisit-after" content="7 days" />
    <meta name="author" content="TapTpay" />
    
    <!-- Structured Data for Landing Page -->
    ${url === '/' ? `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "TapTpay",
      "description": "${meta.description}",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web, iOS, Android",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.8",
        "ratingCount": "127"
      },
      "featureList": [
        "QR Code Payments",
        "NFC Payments",
        "Real-time Transaction Tracking",
        "Multi-currency Support",
        "Instant Notifications",
        "Secure Encryption"
      ]
    }
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "TapTpay",
      "url": "${baseUrl}",
      "logo": "${baseUrl}/logo.png",
      "description": "Modern payment terminal solution for businesses",
      "sameAs": [
        "https://twitter.com/taptpay",
        "https://facebook.com/taptpay",
        "https://linkedin.com/company/taptpay"
      ]
    }
    </script>
    ` : ''}
  `.trim();
}
