import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("n8n trata compras por texto ou áudio antes do fluxo financeiro existente", async () => {
  const workflow = JSON.parse(await readFile(new URL("../infra/local/n8n/granize-whatsapp.json", import.meta.url), "utf8"));
  const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));
  assert.equal(workflow.connections["É áudio?"].main[1][0].node, "Preparar comando");
  assert.equal(workflow.connections["Aplicar transcrição"].main[0][0].node, "Preparar comando");
  assert.equal(workflow.connections["É lista de compras?"].main[0][0].node, "Enviar lista de compras");
  assert.equal(workflow.connections["É lista de compras?"].main[1][0].node, "Entender comando");
  assert.match(nodes.get("Consultar lista de compras").parameters.url, /\/api\/integrations\/shopping-list/);
  assert.match(nodes.get("Consultar lista de compras").parameters.body, /externalId/);
  assert.equal(workflow.connections["Preparar mensagem"].main[0][0].node, "Autorizar telefone");
  for (const connection of Object.values(workflow.connections)) for (const branch of connection.main) for (const edge of branch) assert.ok(nodes.has(edge.node), edge.node);
  for (const node of workflow.nodes.filter((node) => node.type === "n8n-nodes-base.code")) assert.doesNotThrow(() => new Function("$json", "$", "$env", node.parameters.jsCode), node.name);
});
