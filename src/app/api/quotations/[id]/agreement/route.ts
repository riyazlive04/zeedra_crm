import { route, parseBody } from "@/lib/api";
import { agreementInputSchema, createAgreement } from "@/lib/services/agreements";

type P = { id: string };

/** Makes (or, with a later call, changes) the consumer–vendor agreement for an accepted quotation. */
export const POST = route<P>("quotations:create", async ({ req, session, params }) => {
  const input = await parseBody(req, agreementInputSchema);
  return Response.json(await createAgreement(session, params.id, input), { status: 201 });
});
