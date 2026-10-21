import "./globals.css";

export const metadata = {
  title: "PWA Converter — Make the web installable",
  description:
    "Turn a public web app into a polished, installable PWA wrapper.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
