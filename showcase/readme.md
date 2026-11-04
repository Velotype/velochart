# velochart showcase

The chart showcase: a searchable, categorized sidebar, and a live preview, source and attribute
reference for every chart. It is a small Velotype/veloserver app inside this repository, a real
consumer of the library and not part of the published package.

```sh
deno task dev                 # bundles, then serves http://localhost:4000
PORT=8080 deno task dev       # on another port
deno task bundle              # writes ./build/main.js
deno task serve               # serves what is already built
```

There is no file watcher. Re-run `deno task dev` after a change.

GitHub Pages serves it at <https://velotype.github.io/velochart/>, deployed by
`.github/workflows/pages.yml` on every push to `main`. `gh-pages.html` is the Pages counterpart to the
HTML in `server.ts`.

## Layout

```
showcase/
  server.ts              serves the HTML shell and /build/*
  gh-pages.html          the same shell for GitHub Pages, under /velochart
  src/
    main.tsx             client entry point
    app-shell.tsx        header, searchable sidebar and routed content area
    data/docs.tsx        each chart's group, description, attrs, types and examples
    data/category-icons.ts
    pages/               home, category, component, not found
```

Routing is client-side, so the server returns the same shell for every path and the client picks the
page from `location.pathname`.
