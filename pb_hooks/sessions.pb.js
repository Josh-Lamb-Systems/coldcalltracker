/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/tally/sessions/start", (e) => {
  return require(`${__hooks}/lib/sessions.js`).start(e)
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/tally/sessions/{id}/end", (e) => {
  return require(`${__hooks}/lib/sessions.js`).end(e)
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/tally/sessions/{id}/tap", (e) => {
  return require(`${__hooks}/lib/sessions.js`).tap(e)
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/tally/sessions/{id}/update", (e) => {
  return require(`${__hooks}/lib/sessions.js`).update(e)
}, $apis.requireAuth("users"))

cronAdd("close_idle_sessions", "*/5 * * * *", () => {
  require(`${__hooks}/lib/sessions.js`).closeIdleSessions($app)
})
