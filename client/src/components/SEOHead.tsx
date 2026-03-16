import { useEffect } from 'react';
import { useLocation } from 'wouter';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
}

export function SEOHead({
  title,
  description,
  keywords,
  ogTitle,
  ogDescription,
  ogImage = '/og-image.png',
  canonicalUrl,
}: SEOHeadProps) {
  const [location] = useLocation();
  
  useEffect(() => {
    if (title) {
      document.title = title;
    }
    
    const updateMetaTag = (name: string, content: string, isProperty = false) => {
      const attribute = isProperty ? 'property' : 'name';
      let tag = document.querySelector(`meta[${attribute}="${name}"]`);
      
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attribute, name);
        document.head.appendChild(tag);
      }
      
      tag.setAttribute('content', content);
    };
    
    if (description) {
      updateMetaTag('description', description);
      updateMetaTag('og:description', ogDescription || description, true);
      updateMetaTag('twitter:description', ogDescription || description);
    }
    
    if (keywords) {
      updateMetaTag('keywords', keywords);
    }
    
    if (ogTitle || title) {
      updateMetaTag('og:title', ogTitle || title || '', true);
      updateMetaTag('twitter:title', ogTitle || title || '');
    }
    
    if (ogImage) {
      updateMetaTag('og:image', ogImage, true);
      updateMetaTag('twitter:image', ogImage);
    }

    updateMetaTag('og:locale', 'en_NZ', true);
    
    const canonical = canonicalUrl || `https://taptpay.com${location === '/' ? '' : location}`;
    
    let linkTag = document.querySelector('link[rel="canonical"]');
    if (!linkTag) {
      linkTag = document.createElement('link');
      linkTag.setAttribute('rel', 'canonical');
      document.head.appendChild(linkTag);
    }
    linkTag.setAttribute('href', canonical);
    
    updateMetaTag('og:url', canonical, true);
    updateMetaTag('twitter:url', canonical);

    let hreflangTag = document.querySelector('link[hreflang="en-NZ"]');
    if (!hreflangTag) {
      hreflangTag = document.createElement('link');
      hreflangTag.setAttribute('rel', 'alternate');
      hreflangTag.setAttribute('hreflang', 'en-NZ');
      document.head.appendChild(hreflangTag);
    }
    hreflangTag.setAttribute('href', canonical);
  }, [title, description, keywords, ogTitle, ogDescription, ogImage, canonicalUrl, location]);
  
  return null;
}
