/// <reference path="../pb_data/types.d.ts" />

// Callers are created by an admin in the dashboard (no public sign-up).
// Everyone signed in can see the whole team's sessions and names, but can
// only change their own data.
migrate((app) => {
  const metrics = ["dials", "owners", "attempts", "booked"]

  const users = app.findCollectionByNameOrId("users")
  users.listRule = "@request.auth.id != ''"
  users.viewRule = "@request.auth.id != ''"
  users.createRule = null
  users.updateRule = "id = @request.auth.id"
  users.deleteRule = null
  for (const metric of metrics) {
    // Daily goal per caller; 0 means "no goal".
    users.fields.add(new NumberField({ name: `goal_${metric}`, min: 0, onlyInt: true }))
  }
  app.save(users)

  const sessions = new Collection({
    type: "base",
    name: "sessions",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    // Callers start, tap, edit and end sessions through the transactional
    // routes in pb_hooks/sessions.pb.js; direct writes are admin-only.
    createRule: null,
    updateRule: null,
    deleteRule: "user = @request.auth.id",
    fields: [
      {
        name: "user",
        type: "relation",
        collectionId: users.id,
        required: true,
        maxSelect: 1,
        // Keep history safe: a caller can't be deleted while they have sessions.
        cascadeDelete: false,
      },
      { name: "started_at", type: "date", required: true },
      { name: "ended_at", type: "date" },
      ...metrics.map((name) => ({ name, type: "number", min: 0, onlyInt: true })),
      { name: "notes", type: "text", max: 500 },
      // Ids of recent tap batches, so a retried request isn't counted twice.
      { name: "recent_ops", type: "json", hidden: true, maxSize: 8192 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX `idx_sessions_started_at` ON `sessions` (`started_at`)",
      "CREATE INDEX `idx_sessions_user_started_at` ON `sessions` (`user`, `started_at`)",
      "CREATE UNIQUE INDEX `idx_sessions_one_open_per_user` ON `sessions` (`user`) WHERE `ended_at` = ''",
    ],
  })
  app.save(sessions)

  // Shown in the dashboard and in emails PocketBase sends (password resets).
  const settings = app.settings()
  settings.meta.appName = "Cold Call Tracker"
  app.save(settings)
}, (app) => {
  const settings = app.settings()
  settings.meta.appName = "Acme"
  app.save(settings)

  app.delete(app.findCollectionByNameOrId("sessions"))

  const users = app.findCollectionByNameOrId("users")
  for (const metric of ["dials", "owners", "attempts", "booked"]) {
    users.fields.removeByName(`goal_${metric}`)
  }
  users.listRule = "id = @request.auth.id"
  users.viewRule = "id = @request.auth.id"
  users.createRule = ""
  users.updateRule = "id = @request.auth.id"
  users.deleteRule = "id = @request.auth.id"
  app.save(users)
})
