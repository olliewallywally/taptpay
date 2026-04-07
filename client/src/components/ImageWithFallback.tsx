interface ImageWithFallbackProps {
  src: string;
  alt: string;
  style?: React.CSSProperties;
  className?: string;
  loading?: "eager" | "lazy";
}

export function ImageWithFallback({ src, alt, style, className, loading = "lazy" }: ImageWithFallbackProps) {
  return <img src={src} alt={alt} style={style} className={className} loading={loading} />;
}
