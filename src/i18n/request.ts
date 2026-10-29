import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import { getMergedMessages } from "@/lib/content/messages";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    // The compiled catalogue with any admin overrides merged on top. One cached
    // query per request; falls back to the catalogue if the read fails.
    messages: await getMergedMessages(locale),
    timeZone: "Europe/Athens",
    formats: {
      dateTime: {
        short: { day: "2-digit", month: "2-digit", year: "numeric" },
      },
    },
  };
});
