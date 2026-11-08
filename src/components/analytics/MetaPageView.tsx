"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/** PageView σε κάθε πλοήγηση του App Router· την πρώτη τη στέλνει ήδη το `MetaPixel`. */
export function MetaPageView() {
  const pathname = usePathname();
  const search = useSearchParams();
  const first = useRef(true);
  const url = `${pathname}?${search}`;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq?.("track", "PageView");
  }, [url]);
  return null;
}
