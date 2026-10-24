<script setup lang="ts">
import { computed, reactive } from 'vue';
import AppModal from './AppModal.vue';
import type { Mailbox } from '../types';

export interface MailboxFormData {
  email: string;
  displayName: string;
  isDefault: boolean;
}

const props = defineProps<{ mailbox?: Mailbox; busy?: boolean; error?: string }>();
const emit = defineEmits<{ submit: [data: MailboxFormData]; cancel: [] }>();

const form = reactive<MailboxFormData>({
  email: props.mailbox?.email ?? '',
  displayName: props.mailbox?.displayName ?? '',
  isDefault: false,
});

const losesConsent = computed(
  () =>
    !!props.mailbox?.consentGiven &&
    form.email.toLowerCase() !== props.mailbox.email.toLowerCase(),
);
</script>

<template>
  <AppModal :title="mailbox ? 'Editar buzón' : 'Agregar buzón'" @close="emit('cancel')">
    <form id="mailbox-form" class="flex flex-col gap-4" @submit.prevent="emit('submit', { ...form })">
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Correo de Microsoft 365</span>
        <input
          v-model.trim="form.email"
          type="email"
          class="input w-full"
          placeholder="controlgestion@dgeti.gob.mx"
          required
        />
      </label>
      <div v-if="losesConsent" role="alert" class="alert alert-warning alert-soft">
        Este buzón está autorizado. Al cambiar el correo se perderá la autorización y habrá que
        generar un enlace de consentimiento nuevo.
      </div>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Nombre visible</span>
        <input v-model.trim="form.displayName" class="input w-full" placeholder="Control de Gestión" required />
      </label>
      <label v-if="!mailbox" class="flex items-center gap-2">
        <input v-model="form.isDefault" type="checkbox" class="checkbox checkbox-primary checkbox-sm" />
        <span class="text-sm">Usar como buzón predeterminado del sistema</span>
      </label>
      <div v-if="error" role="alert" class="alert alert-error alert-soft">{{ error }}</div>
    </form>
    <template #actions>
      <button class="btn btn-ghost" :disabled="busy" @click="emit('cancel')">Cancelar</button>
      <button
        class="btn"
        :class="losesConsent ? 'btn-warning' : 'btn-primary'"
        type="submit"
        form="mailbox-form"
        :disabled="busy"
      >
        <span v-if="busy" class="loading loading-spinner loading-sm" />
        {{ mailbox ? (losesConsent ? 'Guardar y quitar autorización' : 'Guardar') : 'Agregar buzón' }}
      </button>
    </template>
  </AppModal>
</template>
