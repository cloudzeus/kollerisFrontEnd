import { createPolicyRoute } from "@/lib/policies/route";

const { generateMetadata, PolicyRoute: eggyiseisPage } = createPolicyRoute(
  "eggyiseis",
  "/eggyiseis",
);

export { generateMetadata };
export default eggyiseisPage;
