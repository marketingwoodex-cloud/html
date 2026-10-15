/// <reference types="vite/client" />

/* The commit this bundle was built from, stamped in by vite.config.ts (`define`), shown in the sidebar
   and on the sign-in card — so "is this the new build?" has an answer that is not a guess. */
declare const __WX_BUILD__: string;

/* One function from Node, for the build stamp in vite.config.ts. Declared here because a browser app has
   no @types/node, and adding 2 MB of Node typings for one call is a worse trade than four lines. */
declare module "node:child_process" {
  export function execSync(cmd: string): { toString(): string };
}
