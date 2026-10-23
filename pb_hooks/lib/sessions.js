/// <reference path="../../pb_data/types.d.ts" />

// Calling session logic shared by the routes and cron in sessions.pb.js.
// PocketBase runs every hook handler in an isolated context, so handlers
// `require` this module instead of sharing top-level variables.
//
// Every write reads and saves the session inside one transaction. PocketBase
// runs write transactions one at a time, so concurrent taps and edits from
// several devices can't overwrite each other.

const METRICS = ["dials", "owners", "attempts", "booked"]
const DEFAULT_IDLE_MINUTES = 120
const MAX_DELTA = 1000
const MAX_COUNT = 1000000
const MAX_NOTES = 500
// Tap batches remembered per session so a retried request isn't counted twice.
const RECENT_OPS = 50
const OP_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

// Open sessions with no activity since this moment are considered abandoned.
function idleCutoffMs() {
  const minutes = parseFloat($os.getenv("SESSION_IDLE_MINUTES"))
  return Date.now() - (minutes > 0 ? minutes : DEFAULT_IDLE_MINUTES) * 60 * 1000
}

function isOpen(session) {
  return session.getDateTime("ended_at").isZero()
}

function isIdle(session) {
  return session.getDateTime("updated").time().unixMilli() < idleCutoffMs()
}

function recentOps(session) {
  try {
    const ops = JSON.parse(session.getString("recent_ops") || "[]")
    return Array.isArray(ops) ? ops : []
  } catch (_) {
    return []
  }
}

// Ends a session. An idle session ends at its last activity rather than now.
// Sessions where nothing was counted are deleted instead, so accidental
// starts don't clutter the stats. Returns the saved record, or null.
function closeSession(app, session) {
  if (METRICS.every((metric) => session.getInt(metric) === 0)) {
    app.delete(session)
    return null
  }
  session.set("ended_at", isIdle(session) ? session.getDateTime("updated") : new DateTime())
  app.save(session)
  return session
}

function findOwnSession(e) {
  let session
  try {
    session = e.app.findRecordById("sessions", e.request.pathValue("id"))
  } catch (err) {
    if (String(err).indexOf("no rows") !== -1) throw new NotFoundError("Session not found.")
    throw err
  }
  if (session.getString("user") !== e.auth.id) {
    throw new ForbiddenError("You can only change your own sessions.")
  }
  return session
}

function sessionEnded(e) {
  return e.json(409, {
    status: 409,
    message: "This session has ended. Start a new one to keep counting.",
    data: {},
  })
}

// POST /api/tally/sessions/start
// Returns the caller's active session, starting a new one if there is none.
// Idempotent, so two devices starting at once end up sharing one session.
function start(e) {
  const notes = String(e.requestInfo().body.notes || "").slice(0, MAX_NOTES)
  let session = null
  e.app.runInTransaction((txApp) => {
    const open = txApp.findRecordsByFilter(
      "sessions", "user = {:user} && ended_at = ''", "-started_at", 0, 0, { user: e.auth.id },
    )
    for (const candidate of open) {
      if (!session && !isIdle(candidate)) {
        session = candidate
      } else {
        closeSession(txApp, candidate)
      }
    }
    if (session) {
      // Keep a note typed before tapping if the open session has none yet.
      if (notes && !session.getString("notes")) {
        session.set("notes", notes)
        txApp.save(session)
      }
      return
    }

    session = new Record(txApp.findCollectionByNameOrId("sessions"))
    session.set("user", e.auth.id)
    session.set("started_at", new DateTime())
    session.set("notes", notes)
    txApp.save(session)
  })
  return e.json(200, session)
}

// POST /api/tally/sessions/{id}/end
// Responds with the ended session, or 204 if it was empty and got deleted.
function end(e) {
  const id = findOwnSession(e).id
  let session = null
  e.app.runInTransaction((txApp) => {
    session = txApp.findRecordById("sessions", id)
    if (isOpen(session)) session = closeSession(txApp, session)
  })
  return session ? e.json(200, session) : e.noContent(204)
}

// POST /api/tally/sessions/{id}/tap  {"metric": "dials", "delta": 1, "op": "<random id>"}
// Adds delta to one counter, never going below zero. Clients resend a batch
// with the same op id when they don't know whether it arrived; a repeated op
// is acknowledged without being counted again.
function tap(e) {
  const body = e.requestInfo().body
  const metric = String(body.metric)
  const delta = Number(body.delta)
  const op = body.op === undefined ? "" : String(body.op)
  if (METRICS.indexOf(metric) === -1) {
    throw new BadRequestError("Unknown metric.")
  }
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_DELTA) {
    throw new BadRequestError(`Delta must be a non-zero whole number up to ${MAX_DELTA}.`)
  }
  if (op && !OP_PATTERN.test(op)) {
    throw new BadRequestError("Invalid op id.")
  }

  const id = findOwnSession(e).id
  let session = null
  let ended = false
  e.app.runInTransaction((txApp) => {
    session = txApp.findRecordById("sessions", id)
    const ops = recentOps(session)
    if (op && ops.indexOf(op) !== -1) return // already counted
    if (isOpen(session) && isIdle(session)) closeSession(txApp, session)
    if (!isOpen(session) || isIdle(session)) {
      ended = true
      return
    }
    session.set(metric, Math.max(0, session.getInt(metric) + delta))
    if (op) session.set("recent_ops", ops.concat([op]).slice(-RECENT_OPS))
    txApp.save(session)
  })
  return ended ? sessionEnded(e) : e.json(200, session)
}

// POST /api/tally/sessions/{id}/update  {"dials": 42, "notes": "…"}
// Sets counters and/or the note. Only the fields sent are changed, so an edit
// can't undo taps that landed in the meantime.
function update(e) {
  const body = e.requestInfo().body
  const changes = {}
  for (const metric of METRICS) {
    if (body[metric] === undefined) continue
    const value = Number(body[metric])
    if (!Number.isInteger(value) || value < 0 || value > MAX_COUNT) {
      throw new BadRequestError(`${metric} must be a whole number from 0 to ${MAX_COUNT}.`)
    }
    changes[metric] = value
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== "string" || body.notes.length > MAX_NOTES) {
      throw new BadRequestError(`Notes must be text up to ${MAX_NOTES} characters.`)
    }
    changes.notes = body.notes
  }
  if (Object.keys(changes).length === 0) {
    throw new BadRequestError("Nothing to update.")
  }

  const id = findOwnSession(e).id
  let session = null
  e.app.runInTransaction((txApp) => {
    session = txApp.findRecordById("sessions", id)
    for (const field of Object.keys(changes)) session.set(field, changes[field])
    txApp.save(session)
  })
  return e.json(200, session)
}

// Cron: close sessions that were left open (e.g. the tab was closed).
function closeIdleSessions(app) {
  const cutoff = new Date(idleCutoffMs()).toISOString().replace("T", " ")
  const idle = app.findRecordsByFilter(
    "sessions", "ended_at = '' && updated < {:cutoff}", "", 0, 0, { cutoff },
  )
  for (const candidate of idle) {
    try {
      app.runInTransaction((txApp) => {
        const session = txApp.findRecordById("sessions", candidate.id)
        if (isOpen(session) && isIdle(session)) closeSession(txApp, session)
      })
    } catch (err) {
      app.logger().error("Failed to close idle session", "id", candidate.id, "error", String(err))
    }
  }
}

module.exports = { start, end, tap, update, closeIdleSessions }
