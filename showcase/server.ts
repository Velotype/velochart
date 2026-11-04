import { Server, Router } from "@velotype/veloserver"

const port = Number(Deno.env.get("PORT")) || Number(Deno.args[0]) || 4000
const hostname = Deno.env.get("HOST") || "0.0.0.0"

const pageShell = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>velochart</title>
<link rel="icon" href="data:,"/>
</head>
<body>
<div id="main-page"></div>
<!--
  One module, holding velotype, velodesign, velochart and the app, which is how a consumer on JSR
  builds. Holding velotype out with --external and sharing it through an import map does not work
  against a published package: JSR's copy of velodesign imports "jsr:@velotype/velotype@^0.3.1", which
  the external flag does not match, so that bundle keeps its own velotype. Two copies is the failure
  that matters here. A component class from one copy is not a Component to the other, and velotype
  calls it as a function, which throws "Class constructor cannot be invoked without 'new'".
-->
<script src="/build/main.js" type="module"></script>
</body>
</html>`

function shellHandler() {
    const response = new Response(pageShell, {status: 200})
    response.headers.set("content-type", "text/html; charset=utf-8")
    return response
}

const router = new Router<never>({})

// Mount the static build output FIRST: this Router resolves sibling routes at each node in
// registration order (first match wins, wildcard included) rather than by specificity, so the
// exact /build/main.js route has to be registered before the catch-all below or the wildcard
// would win and the browser would get index.html back when it asked for the JS bundle.
await router.mountFiles("/build/", `${Deno.cwd()}/build/`)

// The app does its own client-side routing (History.changeLocation + popstate/locationchange,
// same mechanism `PageSelector`/`NavLink` use), so every other route serves the same shell and
// the client picks the right page from `location.pathname` once it boots. A single splat
// catch-all - rather than enumerating each client route here too - means a new page added to
// the client router (src/app-shell.tsx's ContentArea) never needs a matching change here.
router.get("/*", shellHandler)

const app = new Server(router)
app.addServerListenCallback(() => {
    console.log(`velochart showcase running at http://${hostname}:${port}`)
})
app.serve(hostname, port)
