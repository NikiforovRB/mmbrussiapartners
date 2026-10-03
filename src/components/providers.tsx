"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeSync } from "@/hooks/use-theme";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeSync />
      {children}
    </SessionProvider>
  );
}
