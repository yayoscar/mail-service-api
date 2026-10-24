<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '../api';
import { session } from '../session';

const router = useRouter();
const route = useRoute();

const form = reactive({ username: '', password: '' });
const busy = ref(false);
const error = ref('');

const MESSAGES: Record<number, string> = {
  401: 'Usuario o contraseña incorrectos.',
  429: 'Demasiados intentos. Espera un minuto antes de volver a intentar.',
  503: 'La administración web no está configurada en el servidor.',
};

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    const me = await api<{ username: string }>('/admin-session/login', 'POST', form);
    session.username = me.username;
    session.notice = '';
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/sistemas';
    // Only in-app paths, never an external URL
    await router.push(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/sistemas');
  } catch (e) {
    error.value =
      e instanceof ApiError ? (MESSAGES[e.status] ?? e.message) : 'No se pudo conectar con el servidor.';
    form.password = '';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-[80vh] items-center justify-center">
    <div class="card w-full max-w-sm bg-base-100 shadow-md">
      <form class="card-body gap-4" @submit.prevent="submit">
        <div>
          <h1 class="text-xl font-semibold">Mail Service</h1>
          <p class="text-sm text-base-content/60">Administración de cuentas</p>
        </div>

        <div v-if="session.notice && !error" role="status" class="alert alert-info alert-soft">
          {{ session.notice }}
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Usuario</span>
          <input v-model.trim="form.username" class="input w-full" autocomplete="username" required autofocus />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Contraseña</span>
          <input
            v-model="form.password"
            type="password"
            class="input w-full"
            autocomplete="current-password"
            required
          />
        </label>

        <div v-if="error" role="alert" class="alert alert-error alert-soft">{{ error }}</div>

        <button class="btn btn-primary w-full" type="submit" :disabled="busy">
          <span v-if="busy" class="loading loading-spinner loading-sm" />
          Iniciar sesión
        </button>
      </form>
    </div>
  </div>
</template>
