<script setup lang="ts">
import { useRouter } from 'vue-router';
import { api } from './api';
import { session, toasts } from './session';

const router = useRouter();

async function logout() {
  try {
    await api('/admin-session/logout', 'POST');
  } finally {
    session.username = null;
    session.notice = '';
    await router.push({ name: 'login' });
  }
}
</script>

<template>
  <div class="min-h-screen bg-base-200">
    <header v-if="session.username" class="navbar bg-base-100 px-4 shadow-sm">
      <div class="flex-1">
        <RouterLink to="/sistemas" class="text-lg font-semibold">
          Mail Service <span class="font-normal text-base-content/60">· Administración</span>
        </RouterLink>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-base-content/70">{{ session.username }}</span>
        <button class="btn btn-ghost btn-sm" @click="logout">Cerrar sesión</button>
      </div>
    </header>

    <main class="mx-auto max-w-6xl p-4 md:p-8">
      <RouterView />
    </main>

    <div class="toast toast-end">
      <div v-for="t in toasts" :key="t.id" class="alert alert-success">{{ t.message }}</div>
    </div>
  </div>
</template>
