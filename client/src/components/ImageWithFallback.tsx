interface ImageWithFallbackProps {
  src: string;
  alt: string;
  style?: React.CSSProperties;
  className?: string;
}

export function ImageWithFallback({ src, alt, style, className }: ImageWithFallbackProps) {
  return <img src={src} alt={alt} style={style} className={className} />;
}
