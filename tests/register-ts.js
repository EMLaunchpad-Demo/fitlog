// Lets Node load the app's TypeScript modules in unit tests: transpiles them on the fly
// and resolves the "@/…" import alias to src/. Only for pure logic (src/lib): modules that
// import React Native cannot be loaded this way.
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const SRC = path.join(__dirname, '..', 'src');

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(
    this,
    request.startsWith('@/') ? path.join(SRC, request.slice(2)) : request,
    ...rest,
  );
};

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    module._compile(outputText, filename);
  };
}
