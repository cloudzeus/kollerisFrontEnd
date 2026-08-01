import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { getBanner, listPlacements } from "@/lib/banners/banners";
import { BannerEditor } from "@/components/admin/banners/BannerEditor";

export const dynamic = "force-dynamic";

export default async function BannerEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  assertCan(session?.user.role, "content");

  const { id } = await params;
  const [banner, placements] = await Promise.all([getBanner(id), listPlacements()]);
  if (!banner) notFound();

  // The editor renders its own PageShell: the header carries save and publish,
  // which are its state.
  return <BannerEditor banner={banner} placements={placements} />;
}
