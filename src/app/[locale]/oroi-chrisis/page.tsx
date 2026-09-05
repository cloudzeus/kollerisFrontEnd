import { createPolicyRoute } from "@/lib/policies/route";

const { generateMetadata, PolicyRoute: oroi_chrisisPage } = createPolicyRoute(
  "oroi-chrisis",
  "/oroi-chrisis",
);

export { generateMetadata };
export default oroi_chrisisPage;
