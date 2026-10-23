/// <reference path="../pb_data/types.d.ts" />

// PocketBase serves the app without cache headers, so browsers may keep an
// old index.html after a redeploy. Make them revalidate the page; the hashed
// files under /assets/ keep their default caching.
routerUse((e) => {
  const path = e.request.url.path
  if (!path.startsWith("/api/") && !path.startsWith("/_/") && !path.startsWith("/assets/")) {
    e.response.header().set("Cache-Control", "no-cache")
  }
  return e.next()
})
