import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "Auth");
assert.ok(declaration);
const reactUrl = import.meta.resolve("react");
const source = `import React, { useState } from ${JSON.stringify(reactUrl)};
  const Brand = () => React.createElement('span', null, 'Granize');
  const plans = [{id:'trial', name:'Grátis'}];
  const api = () => { throw new Error('Formulário não deve enviar dados durante renderização'); };
  export default ${declaration.getText(tree)}`;
const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { default: Auth } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

for (const mode of ["login", "register"]) {
  test(`formulário ${mode} permite e-mail e senha sem depender de localhost ou acesso externo`, () => {
    const html = renderToStaticMarkup(React.createElement(Auth, {
      mode, selectedPlan: "trial", onDone() {}, onBack() {}, onChoosePlan() {}, refresh: async () => ({authenticated:false}),
    }));
    const email = html.match(/<input[^>]*name="email"[^>]*>/)?.[0];
    assert.ok(email);
    assert.doesNotMatch(email, /readonly|disabled/i);
    assert.match(email, /inputMode="email"/);
    assert.match(email, /autoComplete="email"/);
    assert.match(email, /autoCapitalize="none"/);
    assert.match(html, /name="password"/);
    assert.match(html, new RegExp(`autoComplete="${mode === "register" ? "new-password" : "current-password"}"`));
    assert.doesNotMatch(html, /ChatGPT|signin-with-chatgpt/i);
    assert.doesNotMatch(declaration.getText(tree), /localAuth|readOnly/);
  });
}
