import { createPolicyRoute } from "@/lib/policies/route";

const { generateMetadata, PolicyRoute: tropoi_pliromisPage } = createPolicyRoute("tropoi-pliromis", "/tropoi-pliromis");

export { generateMetadata };
export default tropoi_pliromisPage;
