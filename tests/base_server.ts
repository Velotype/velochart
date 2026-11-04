// Server, Router, Inspector and RequestInspectorResponse are all constructed below, so they are
// value imports; only Context is used purely as a type.
import { Server, Router, Inspector, RequestInspectorResponse } from "@velotype/veloserver"
import type { Context } from "@velotype/veloserver"

/** Closes a test server. Use this rather than `server.close()` in test teardown. */
export async function closeAppServer(server: Server<ServerContextMetadata>, reason: string): Promise<void> {
    server.close(reason)
    // The shutdown callbacks run from a `finished` handler, so let that settle before the caller
    // carries on
    await new Promise((resolve) => setTimeout(resolve, 0))
}

export type ServerContextMetadata = {
    /** Request start time (`performance.now()`), set by the timing inspector below */
    st?: number
}

export async function startAppServer(server_port: number): Promise<Server<ServerContextMetadata>> {
    const router: Router<ServerContextMetadata> = new Router<ServerContextMetadata>({
        context_metadata_constructor: () => ({}),
    })
    router.addAllInspector("", new Inspector<ServerContextMetadata>(
        (request: Request, context: Context<ServerContextMetadata>) => {
            console.log(`START ${request.method} ${request.url}`)
            context.meta.st = performance.now()
            return new RequestInspectorResponse()
        },
        (request: Request, response: Response, context: Context<ServerContextMetadata>) => {
            const startTime = context.meta.st
            if (startTime != undefined) {
                const ms = (performance.now() - startTime).toFixed(2)
                response.headers.set("X-Response-Time", `${ms}ms`);
                console.log(`END ${response.status} ${request.method} ${request.url} ${ms}ms`)
            } else {
                console.error(`END ${response.status} ${request.method} ${request.url} ERROR could not calculate elapsed time`)
            }
        }
    ))
    const setOfModules = ['charts']
    setOfModules.forEach((module) => {
        router.get(`/${module}`, function() {
            const response = new Response(`<!DOCTYPE html><html><body>
<div id="main-page"></div>
<script src="/build/${module}.js" type="module" ></script>
</body></html>`,{status:200})
            response.headers.set("content-type", "text/html; charset=utf-8")
            return response
        })
    })
    await router.mountFiles("/build/", `${Deno.cwd()}/tests/build/`)
    const app = new Server<ServerContextMetadata>(router)
    const prom = new Promise<Server<ServerContextMetadata>>((resolve) => {
        app.addServerListenCallback(() => {
            resolve(app)
        })
    })
    app.serve('localhost', server_port)
    return prom
}
