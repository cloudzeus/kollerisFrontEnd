import { createPolicyRoute } from "@/lib/policies/route";

const { generateMetadata, PolicyRoute: apostoli_paradosiPage } = createPolicyRoute("apostoli-paradosi", "/apostoli-paradosi");

export { generateMetadata };
export default apostoli_paradosiPage;
