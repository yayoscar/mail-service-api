<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { api, ApiError } from '../api';
import { toast } from '../session';
import type { Mailbox, System } from '../types';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import ConsentLinkDialog from '../components/ConsentLinkDialog.vue';
import MailboxForm, { type MailboxFormData } from '../components/MailboxForm.vue';

const props = defineProps<{ id: string }>();

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; mailbox: Mailbox }
  | { kind: 'deactivate'; mailbox: Mailbox }
  | { kind: 'consent'; mailbox: Mailbox };

const system = ref<System | null>(null);
const mailboxes = ref<Mailbox[]>([]);
const loading = ref(true);
const loadError = ref('');
const dialog = ref<Dialog | null>(null);
const busy = ref(false);
const dialogError = ref('');

// Default first, then active, then inactive
const sortedMailboxes = computed(() =>
  [...mailboxes.value].sort(
    (a, b) =>
      Number(b.isDefault) - Number(a.isDefault) ||
      Number(b.active) - Number(a.active) ||
      a.email.localeCompare(b.email),
  ),
);

async function load() {
  loadError.value = '';
  try {
    const [systems, list] = await Promise.all([
      api<System[]>('/systems'),
      api<Mailbox[]>(`/systems/${props.id}/mailboxes?includeInactive=true`),
    ]);
    system.value = systems.find((s) => s.id === props.id) ?? null;
    mailboxes.value = list;
    if (!system.value) loadError.value = 'El sistema no existe.';
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'No se pudieron cargar los buzones.';
  } finally {
    loading.value = false;
  }
}

function open(next: Dialog) {
  dialogError.value = '';
  dialog.value = next;
}

async function run(action: () => Promise<void>, keepDialog = false) {
  busy.value = true;
  dialogError.value = '';
  try {
    await action();
    if (!keepDialog) dialog.value = null;
    await load();
  } catch (e) {
    const message = e instanceof ApiError ? e.message : 'La operación no se pudo completar.';
    if (dialog.value) dialogError.value = message;
    else loadError.value = message;
  } finally {
    busy.value = false;
  }
}

const create = (data: MailboxFormData) =>
  run(async () => {
    await api(`/systems/${props.id}/mailboxes`, 'POST', data);
    toast('Buzón agregado');
  });

const update = (mailbox: Mailbox, data: MailboxFormData) =>
  run(async () => {
    const changes: Partial<MailboxFormData> = { displayName: data.displayName };
    if (data.email !== mailbox.email) changes.email = data.email;
    await api(`/mailboxes/${mailbox.id}`, 'PATCH', changes);
    toast('Buzón actualizado');
  });

const makeDefault = (mailbox: Mailbox) =>
  run(async () => {
    await api(`/mailboxes/${mailbox.id}/default`, 'PATCH');
    toast(`${mailbox.email} es ahora el buzón predeterminado`);
  });

const deactivate = (mailbox: Mailbox) =>
  run(async () => {
    await api(`/mailboxes/${mailbox.id}`, 'DELETE');
    toast('Buzón desactivado');
  });

const reactivate = (mailbox: Mailbox) =>
  run(async () => {
    await api(`/mailboxes/${mailbox.id}`, 'PATCH', { active: true });
    toast('Buzón reactivado');
  });

function closeConsent() {
  dialog.value = null;
  load();
}

// The consent is usually completed in another tab: refresh when coming back
const onVisible = () => {
  if (document.visibilityState === 'visible' && !dialog.value) load();
};

onMounted(() => {
  load();
  document.addEventListener('visibilitychange', onVisible);
});
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible));
</script>

<template>
  <div class="breadcrumbs mb-2 text-sm">
    <ul>
      <li><RouterLink to="/sistemas">Sistemas</RouterLink></li>
      <li class="font-mono">{{ system?.key ?? '…' }}</li>
    </ul>
  </div>

  <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="flex items-center gap-3 text-2xl font-semibold">
        {{ system?.name ?? 'Buzones' }}
        <span
          v-if="system"
          class="badge"
          :class="system.active ? 'badge-success badge-soft' : 'badge-ghost'"
        >
          {{ system.active ? 'Activo' : 'Inactivo' }}
        </span>
      </h1>
      <p class="text-sm text-base-content/60">
        Buzones de Microsoft 365 desde los que este sistema puede enviar correo.
      </p>
    </div>
    <div class="flex gap-2">
      <button class="btn btn-ghost" :disabled="loading" @click="load">Actualizar</button>
      <button class="btn btn-primary" :disabled="!system" @click="open({ kind: 'create' })">
        Agregar buzón
      </button>
    </div>
  </div>

  <div v-if="loadError" role="alert" class="alert alert-error alert-soft mb-4">{{ loadError }}</div>

  <div v-if="system" class="card overflow-x-auto bg-base-100 shadow-sm">
    <div v-if="loading" class="flex justify-center p-10"><span class="loading loading-spinner" /></div>
    <div v-else-if="mailboxes.length === 0" class="p-10 text-center text-base-content/60">
      Este sistema aún no tiene buzones. Agrega uno y genera su enlace de consentimiento.
    </div>
    <table v-else class="table">
      <thead>
        <tr>
          <th>Buzón</th>
          <th>Estado</th>
          <th>Autorización</th>
          <th class="text-right">Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="mailbox in sortedMailboxes" :key="mailbox.id" :class="{ 'opacity-60': !mailbox.active }">
          <td>
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ mailbox.email }}</span>
              <span v-if="mailbox.isDefault" class="badge badge-primary badge-soft badge-sm">Predeterminado</span>
            </div>
            <div class="text-sm text-base-content/60">{{ mailbox.displayName }}</div>
          </td>
          <td>
            <span class="badge badge-sm" :class="mailbox.active ? 'badge-success badge-soft' : 'badge-ghost'">
              {{ mailbox.active ? 'Activo' : 'Inactivo' }}
            </span>
          </td>
          <td>
            <span class="badge badge-sm" :class="mailbox.consentGiven ? 'badge-success' : 'badge-warning badge-soft'">
              {{ mailbox.consentGiven ? 'Autorizado' : 'Pendiente' }}
            </span>
          </td>
          <td>
            <div class="flex flex-wrap justify-end gap-1">
              <template v-if="mailbox.active">
                <button
                  class="btn btn-sm btn-soft"
                  :class="mailbox.consentGiven ? 'btn-neutral' : 'btn-primary'"
                  @click="open({ kind: 'consent', mailbox })"
                >
                  Enlace de consentimiento
                </button>
                <button class="btn btn-sm btn-ghost" @click="open({ kind: 'edit', mailbox })">Editar</button>
                <template v-if="!mailbox.isDefault">
                  <button class="btn btn-sm btn-ghost" :disabled="busy" @click="makeDefault(mailbox)">
                    Predeterminar
                  </button>
                  <button class="btn btn-sm btn-ghost text-error" @click="open({ kind: 'deactivate', mailbox })">
                    Desactivar
                  </button>
                </template>
              </template>
              <template v-else>
                <button class="btn btn-sm btn-ghost" @click="open({ kind: 'edit', mailbox })">Editar</button>
                <button class="btn btn-sm btn-ghost" :disabled="busy" @click="reactivate(mailbox)">Reactivar</button>
              </template>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <MailboxForm
    v-if="dialog?.kind === 'create'"
    :busy="busy"
    :error="dialogError"
    @submit="create"
    @cancel="dialog = null"
  />
  <MailboxForm
    v-else-if="dialog?.kind === 'edit'"
    :mailbox="dialog.mailbox"
    :busy="busy"
    :error="dialogError"
    @submit="update(dialog.mailbox, $event)"
    @cancel="dialog = null"
  />
  <ConfirmDialog
    v-else-if="dialog?.kind === 'deactivate'"
    title="Desactivar buzón"
    :message="`${dialog.mailbox.email} dejará de poder usarse como remitente. Podrás reactivarlo después.`"
    confirm-label="Desactivar"
    danger
    :busy="busy"
    :error="dialogError"
    @confirm="deactivate(dialog.mailbox)"
    @cancel="dialog = null"
  />
  <ConsentLinkDialog v-else-if="dialog?.kind === 'consent'" :mailbox="dialog.mailbox" @close="closeConsent" />
</template>
