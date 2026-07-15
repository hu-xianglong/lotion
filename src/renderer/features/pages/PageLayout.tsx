import type { ReactNode } from "react";

interface PageLayoutProps {
  fullWidth: boolean;
  smallText?: boolean;
  cover?: ReactNode;
  header: ReactNode;
  properties?: ReactNode;
  overlay?: ReactNode;
  children: ReactNode;
}

export function PageLayout({
  fullWidth,
  smallText,
  cover,
  header,
  properties,
  overlay,
  children
}: PageLayoutProps) {
  const className = [
    "page-editor",
    "page-layout",
    fullWidth ? "full-width" : "",
    smallText ? "small-text" : ""
  ].filter(Boolean).join(" ");
  return (
    <div className={className}>
      {cover}
      <div className="page-header">{header}</div>
      {properties}
      {overlay}
      {children}
    </div>
  );
}
