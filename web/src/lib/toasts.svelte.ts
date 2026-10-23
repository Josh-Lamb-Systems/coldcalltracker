class Toasts {
  items = $state<{ id: number; text: string }[]>([]);
  private nextId = 0;

  show(text: string, durationMs = 5000) {
    const id = ++this.nextId;
    this.items.push({ id, text });
    setTimeout(() => {
      this.items = this.items.filter((item) => item.id !== id);
    }, durationMs);
  }
}

export const toasts = new Toasts();
