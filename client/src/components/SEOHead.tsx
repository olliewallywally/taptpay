import { useEffect } from 'react';
import { useLocation } from 'wouter';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export function SEOHead({
  title,
  description,
  keywords,
  ogTitle,
  ogDescription,
  ogImage = '/og-image.png',
}: SEOHeadProps) {
  const [location] = useLocation();
  
  useEffect(() => {
    // Update document title
    if (title) {
      document.title = title;
    }
    
    // Update meta tags
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
    
    // Update canonical URL
    const baseUrl = window.location.origin;
    const canonical = `${baseUrl}${location}`;
    
    let linkTag = document.querySelector('link[rel="canonical"]');
    if (!linkTag) {
      linkTag = document.createElement('link');
      linkTag.setAttribute('rel', 'canonical');
      document.head.appendChild(linkTag);
    }
    linkTag.setAttribute('href', canonical);
    
    updateMetaTag('og:url', canonical, true);
    updateMetaTag('twitter:url', canonical);
  }, [title, description, keywords, ogTitle, ogDescription, ogImage, location]);
  
  return null;
}
