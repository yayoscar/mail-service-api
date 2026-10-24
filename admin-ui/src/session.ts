import { reactive } from 'vue';

export const session = reactive({
  username: null as string | null,
  /** Message shown on the login page, e.g. after the session expired. */
  notice: '',
});

export const toasts = reactive<{ id: number; message: string }[]>([]);

let nextToastId = 0;

export function toast(message: string) {
  const id = nextToastId++;
  toasts.push({ id, message });
  setTimeout(() => {
    const index = toasts.findIndex((t) => t.id === id);
    if (index >= 0) toasts.splice(index, 1);
  }, 3500);
}
