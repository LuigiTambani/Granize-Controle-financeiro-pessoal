import { ApiError, errorResponse, getD1, requireApiUser } from "../_lib/server";
import { applyShoppingCommand, changeShoppingItem, shoppingItems } from "../_lib/shopping";
import { shoppingNames } from "../../lib/shopping";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    return Response.json({ items: await shoppingItems(getD1(), user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const payload = await request.json() as { name?: unknown };
    if (typeof payload.name !== "string") throw new ApiError(400, "Informe o produto.");
    let names: string[];
    try { names = shoppingNames(payload.name); }
    catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "Produto inválido."); }
    const responseText = await applyShoppingCommand(getD1(), user.id, { action: "add", items: names }, "manual");
    return Response.json({ items: await shoppingItems(getD1(), user.id), responseText }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser(request);
    const payload = await request.json() as { id?: unknown; completed?: unknown };
    if (typeof payload.completed !== "boolean") throw new ApiError(400, "Informe se o item foi comprado.");
    await changeShoppingItem(getD1(), user.id, payload.id, payload.completed);
    return Response.json({ items: await shoppingItems(getD1(), user.id) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser(request);
    const payload = await request.json() as { id?: unknown };
    await changeShoppingItem(getD1(), user.id, payload.id);
    return Response.json({ items: await shoppingItems(getD1(), user.id) });
  } catch (error) { return errorResponse(error); }
}
