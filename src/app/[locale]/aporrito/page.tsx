import { createPolicyRoute } from "@/lib/policies/route";

const { generateMetadata, PolicyRoute: aporritoPage } = createPolicyRoute(
  "aporrito",
  "/aporrito",
);

export { generateMetadata };
export default aporritoPage;
