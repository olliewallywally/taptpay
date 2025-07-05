import { Navigation } from "./navigation";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[hsl(210,20%,98%)]">
      <Navigation />
      {children}
    </div>
  );
}