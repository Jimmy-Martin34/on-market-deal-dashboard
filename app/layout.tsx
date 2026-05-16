import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Subdivide Deal Dashboard",
  description: "Embeddable dashboard for newly listed vacant land subdivision opportunities.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
