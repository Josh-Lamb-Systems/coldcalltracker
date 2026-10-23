// Hash routing keeps the app a plain static bundle for PocketBase to serve.

export const ROUTES = [
  { path: "counter", label: "Counter" },
  { path: "stats", label: "Stats" },
  { path: "goals", label: "Goals" },
] as const;

export type Route = (typeof ROUTES)[number]["path"];

function current(): Route {
  const path = location.hash.replace(/^#\/?/, "");
  return ROUTES.find((route) => route.path === path)?.path ?? "counter";
}

class Router {
  route = $state<Route>(current());

  constructor() {
    addEventListener("hashchange", () => {
      this.route = current();
    });
  }
}

export const router = new Router();
