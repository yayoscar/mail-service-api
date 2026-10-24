<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, ApiError } from '../api';
import { formatDate } from '../format';
import { toast } from '../session';
import type { CreatedSystem, RegeneratedApiKey, System } from '../types';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import SecretDialog from '../components/SecretDialog.vue';
import SystemForm from '../components/SystemForm.vue';

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; system: System }
  | { kind: 'deactivate'; system: System }
  | { kind: 'rotate'; system: System }
  | { kind: 'secret'; title: string; systemKey: string; apiKey: string };

const systems = ref<System[]>([]);
const loading = ref(true);
const loadError = ref('');
const dialog = ref<Dialog | null>(null);
const busy = ref(false);
const dialogError = ref('');

async function load() {
  loadError.value = '';
  try {
    systems.value = await api<System[]>('/systems');
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'No se pudo cargar la lista de sistemas.';
  } finally {
    loading.value = false;
  }
}

function open(next: Dialog) {
  dialogError.value = '';
  dialog.value = next;
}

/** Runs a dialog action; on error the dialog stays open with the message and the typed data. */
async function run(action: () => Promise<Dialog | null | void>) {
  busy.value = true;
  dialogError.value = '';
  try {
    dialog.value = (await action()) ?? null;
    await load();
  } catch (e) {
    dialogError.value = e instanceof ApiError ? e.message : 'La operación no se pudo completar.';
  } finally {
    busy.value = false;
  }
}

const create = (data: { key: string; name: string }) =>
  run(async () => {
    const created = await api<CreatedSystem>('/systems', 'POST', data);
    return { kind: 'secret', title: 'Sistema creado', systemKey: created.key, apiKey: created.apiKey };
  });

const rename = (system: System, data: { name: string }) =>
  run(async () => {
    await api(`/systems/${system.id}`, 'PATCH', { name: data.name });
    toast('Sistema actualizado');
  });

const setActive = (system: System, active: boolean) =>
  run(async () => {
    await api(`/systems/${system.id}`, 'PATCH', { active });
    toast(active ? 'Sistema activado' : 'Sistema desactivado');
  });

const rotate = (system: System) =>
  run(async () => {
    const result = await api<RegeneratedApiKey>(`/systems/${system.id}/regenerate-api-key`, 'POST');
    return { kind: 'secret', title: 'Nueva API key', systemKey: system.key, apiKey: result.apiKey };
  });

onMounted(load);
</script>

<template>
  <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold">Sistemas</h1>
      <p class="text-sm text-base-content/60">Aplicaciones que envían correo a través del servicio.</p>
    </div>
    <button class="btn btn-primary" @click="open({ kind: 'create' })">Nuevo sistema</button>
  </div>

  <div v-if="loadError" role="alert" class="alert alert-error alert-soft">{{ loadError }}</div>

  <div v-else class="card overflow-x-auto bg-base-100 shadow-sm">
    <div v-if="loading" class="flex justify-center p-10"><span class="loading loading-spinner" /></div>
    <div v-else-if="systems.length === 0" class="p-10 text-center text-base-content/60">
      Aún no hay sistemas. Crea el primero para obtener su API key.
    </div>
    <table v-else class="table">
      <thead>
        <tr>
          <th>Clave</th>
          <th>Nombre</th>
          <th>Estado</th>
          <th>Creado</th>
          <th class="text-right">Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="system in systems" :key="system.id" :class="{ 'opacity-60': !system.active }">
          <td class="font-mono">
            <RouterLink :to="`/sistemas/${system.id}`" class="link link-hover">{{ system.key }}</RouterLink>
          </td>
          <td>{{ system.name }}</td>
          <td>
            <span class="badge badge-sm" :class="system.active ? 'badge-success badge-soft' : 'badge-ghost'">
              {{ system.active ? 'Activo' : 'Inactivo' }}
            </span>
          </td>
          <td class="text-sm text-base-content/70">{{ formatDate(system.createdAt) }}</td>
          <td>
            <div class="flex flex-wrap justify-end gap-1">
              <RouterLink :to="`/sistemas/${system.id}`" class="btn btn-sm btn-primary btn-soft">Buzones</RouterLink>
              <button class="btn btn-sm btn-ghost" @click="open({ kind: 'edit', system })">Editar</button>
              <button class="btn btn-sm btn-ghost" @click="open({ kind: 'rotate', system })">Rotar API key</button>
              <button
                v-if="system.active"
                class="btn btn-sm btn-ghost text-error"
                @click="open({ kind: 'deactivate', system })"
              >
                Desactivar
              </button>
              <button v-else class="btn btn-sm btn-ghost" :disabled="busy" @click="setActive(system, true)">
                Activar
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <SystemForm
    v-if="dialog?.kind === 'create'"
    :busy="busy"
    :error="dialogError"
    @submit="create"
    @cancel="dialog = null"
  />
  <SystemForm
    v-else-if="dialog?.kind === 'edit'"
    :system="dialog.system"
    :busy="busy"
    :error="dialogError"
    @submit="rename(dialog.system, $event)"
    @cancel="dialog = null"
  />
  <ConfirmDialog
    v-else-if="dialog?.kind === 'deactivate'"
    title="Desactivar sistema"
    :message="`${dialog.system.name} dejará de poder enviar correos: su API key será rechazada hasta que lo vuelvas a activar.`"
    confirm-label="Desactivar"
    danger
    :busy="busy"
    :error="dialogError"
    @confirm="setActive(dialog.system, false)"
    @cancel="dialog = null"
  />
  <ConfirmDialog
    v-else-if="dialog?.kind === 'rotate'"
    title="Rotar API key"
    :message="`La API key actual de ${dialog.system.name} dejará de funcionar de inmediato. Tendrás que configurar la nueva en el sistema consumidor.`"
    confirm-label="Rotar API key"
    danger
    :busy="busy"
    :error="dialogError"
    @confirm="rotate(dialog.system)"
    @cancel="dialog = null"
  />
  <SecretDialog
    v-else-if="dialog?.kind === 'secret'"
    :title="dialog.title"
    :system-key="dialog.systemKey"
    :api-key="dialog.apiKey"
    @close="dialog = null"
  />
</template>
