import { ClientResponseError, type RecordModel } from "pocketbase";
import { pb } from "./pb";
import type { Metric } from "./metrics";

export type Caller = RecordModel & {
  name: string;
  email?: string;
} & Record<`goal_${Metric}`, number>;

export function displayName(caller: Pick<Caller, "name" | "email"> | null | undefined): string {
  return caller?.name?.trim() || caller?.email?.split("@")[0] || "Unnamed caller";
}

function currentCaller(): Caller | null {
  return pb.authStore.isValid && pb.authStore.record?.collectionName === "users"
    ? (pb.authStore.record as Caller)
    : null;
}

class Auth {
  user = $state<Caller | null>(currentCaller());

  constructor() {
    pb.authStore.onChange(() => {
      this.user = currentCaller();
    });
  }

  async login(email: string, password: string) {
    await pb.collection("users").authWithPassword(email, password);
  }

  logout() {
    pb.authStore.clear();
  }

  /** Extends the session and picks up profile changes made by an admin. */
  async refresh() {
    if (!this.user) return;
    try {
      await pb.collection("users").authRefresh();
    } catch (err) {
      if (err instanceof ClientResponseError && err.status >= 400 && err.status < 500) this.logout();
    }
  }
}

export const auth = new Auth();
