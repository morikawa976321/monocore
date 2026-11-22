import { AuthGate } from "@/src/components/auth/AuthGate";
import { Sidebar } from "@/src/components/layout/Sidebar";
import { ThemeProvider } from "@/src/components/providers/ThemeProvider";

/**
 * 全画面に共通の枠。`<html>`・`<body>`・タイトル・アイコンは index.html、フォントは fonts.css が持つ。
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AuthGate />
      <Sidebar />
      <main className="pl-0 sm:pl-12 min-h-screen">
        {children}
      </main>
    </ThemeProvider>
  );
}
