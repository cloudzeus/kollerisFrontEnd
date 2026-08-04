import Image from "next/image";
import { existsSync } from "node:fs";
import path from "node:path";
import { getTranslations } from "next-intl/server";
import { upGreek } from "@/lib/greek";

/**
 * The shop, photographed.
 *
 * A contact page that says "collect your order in two hours at Κ. Μαυρομιχάλη 4"
 * and shows nothing is asking people to drive somewhere they have never seen.
 * These two do specific work rather than decorate: the frontage is what you
 * look for from the pavement, and the wall of stock answers the question the
 * form is there to ask, which is whether the thing is actually here.
 *
 * Asymmetric on purpose. Two equal photos would read as a gallery; the frontage
 * leads because finding the door is the harder half.
 */

/** Placed under `public/`, so the files carry their own paths. */
const PHOTOS = [
  {
    src: "/photos/katastima-prosopsi.jpg",
    width: 1600,
    height: 1066,
    className: "lg:col-span-3",
    sizes: "(max-width: 1024px) 100vw, 58vw",
  },
  {
    src: "/photos/katastima-wera.jpg",
    width: 1200,
    height: 1600,
    className: "lg:col-span-2",
    sizes: "(max-width: 1024px) 100vw, 38vw",
  },
] as const;

/**
 * Rendered only when the files are actually there.
 *
 * Shipping the markup ahead of the photographs would put two broken images on
 * the contact page of a real business. Without them the section is simply
 * absent and the page reads exactly as it did before.
 */
const present = (src: string) => existsSync(path.join(process.cwd(), "public", src));

export async function StorePhotos() {
  const available = PHOTOS.filter((photo) => present(photo.src));
  if (available.length === 0) return null;

  const t = await getTranslations("epikoinonia.StorePhotos");

  return (
    <section className="reveal border-b border-k-line bg-white">
      <div className="shell-x py-9 lg:py-12">
        <div className="grid gap-px bg-k-line lg:grid-cols-5">
          {available.map((photo, index) => (
            <figure key={photo.src} className={`relative bg-white ${photo.className}`}>
              <Image
                src={photo.src}
                alt={t(index === 0 ? "alt_prosopsi" : "alt_esoteriko")}
                width={photo.width}
                height={photo.height}
                sizes={photo.sizes}
                className="h-full w-full object-cover"
              />
            </figure>
          ))}
        </div>

        {/*
          One functional line, outside the image. Someone driving to collect an
          order needs the parking, not a caption about the light.
        */}
        <p className="t-brand-count mt-3.5 text-k-text-3">
          {upGreek(t("parking"))}
        </p>
      </div>
    </section>
  );
}
