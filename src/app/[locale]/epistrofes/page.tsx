import { createPolicyRoute } from "@/lib/policies/route";

const { generateMetadata, PolicyRoute: epistrofesPage } = createPolicyRoute("epistrofes", "/epistrofes");

export { generateMetadata };
export default epistrofesPage;
