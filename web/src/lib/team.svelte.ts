import { displayName, type Caller } from "./auth.svelte";
import { pb } from "./pb";

class Team {
  members = $state<Caller[]>([]);

  async load() {
    const members = await pb.collection("users").getFullList<Caller>({ sort: "name" });
    this.members = members.sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }

  find(id: string): Caller | undefined {
    return this.members.find((member) => member.id === id);
  }

  name(id: string): string {
    const member = this.find(id);
    return member ? displayName(member) : "Former caller";
  }
}

export const team = new Team();
